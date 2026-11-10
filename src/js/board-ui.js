/* CarolPawsDoku — tela de jogo do quebra-cabeça de regiões.
 *
 * Toque: 1× marca ✕ · 2× revela (validado contra a solução) · arrastar marca/apaga várias ✕.
 * Revelar certo mostra o personagem da região; errado custa 1 vida e a casa vira ✕.
 * Teclado: setas movem, X/Espaço marca, Enter revela, Z desfaz, Esc pausa.
 */
(function (CPD) {
  'use strict';

  const { $, $$, el, icon, charEl } = CPD.ui;

  let session = null;
  let level = null;
  let cells = [];
  let focus = -1;
  let busy = false;
  let paused = false;
  let timer = null;
  let coachIdx = -1;
  let msgTimer = null;
  let drag = null; // { start, moved, value, group }

  const nameOf = (id) => { const c = CPD.characters.get(id); return c ? c.name : ''; };
  // Marcação automática (bolinhas nas casas descartadas): só nas fases 1–9. Depois, o jogador marca tudo.
  const autoMarks = () => !level.noAutoMark && level.id <= 9;

  /* ================= Ciclo de vida ================= */

  function start(levelId, opts) {
    const o = opts || {};
    if (!CPD.levels.get(levelId)) return;
    if (!CPD.progress.isUnlocked(levelId)) { CPD.ui.toast('Essa fase ainda está bloqueada.'); return; }
    stopTimer();
    CPD.ui.closeOverlay('ov-victory');
    CPD.ui.closeOverlay('ov-defeat');
    CPD.ui.loading(true, 'Preparando o tabuleiro…');
    setTimeout(() => {
      try {
        const saved = o.resume ? CPD.progress.loadGame() : null;
        session = saved && saved.levelId === levelId && saved.v === 3 ? CPD.GameSession.fromJSON(saved) : CPD.GameSession.create(levelId);
      } catch (e) {
        console.error(e);
        CPD.ui.loading(false);
        CPD.ui.toast('Não foi possível gerar o tabuleiro. Tente de novo.', 'error');
        return;
      }
      level = session.level;
      focus = -1; busy = false; paused = false; coachIdx = -1; drag = null;
      // personagens já revelados no início também entram na coleção
      if (!o.resume && session.givens.length) CPD.progress.markFound(session.givens.map((g) => session.characterAt(g)));
      setup();
      CPD.ui.loading(false);
      CPD.app.show('game');
      fitBoard();
      save();
      CPD.audio.setContext('game:' + level.group);
      const info = CPD.progress.levelInfo(levelId);
      playIntro().then(() => {
        if (!session || session.level !== level) return;
        if (level.tutorial && !(info && info.wins) && !o.resume) showTutorial(level.tutorial, beginTimer);
        else { beginTimer(); if (level.special && !o.resume) message(level.special); }
      });
    }, 40);
  }

  function resumeSaved() {
    const saved = CPD.progress.loadGame();
    if (saved && saved.status === 'playing' && saved.v === 3) start(saved.levelId, { resume: true });
  }

  function beginTimer() {
    if (!session || session.status !== 'playing') return;
    paused = false;
    $('#board-veil').hidden = true;
    session.start();
    stopTimer();
    timer = setInterval(() => {
      renderSub();
      if (session && session.elapsedSec() % 5 === 0) save();
    }, 500);
    renderSub();
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }

  function leave() { if (!session) return; session.pause(); save(); stopTimer(); }

  function save() {
    if (!session) return;
    if (session.status === 'playing') CPD.progress.saveGame(session.toJSON());
    else CPD.progress.clearGame();
  }

  function isActive() { return !!session && session.status === 'playing'; }

  /* ================= Montagem ================= */

  function setup() {
    const N = level.size;
    $('#game-level-label').textContent = 'Nível ' + level.id;
    $('#game-level-name').textContent = level.name + ' · ' + N + '×' + N;
    $('#how-line').textContent = level.noMarks
      ? 'Toque para revelar · sem marcas nesta fase'
      : 'Toque 1× para marcar ✕ · 2× para revelar · arraste para marcar várias';
    const board = $('#board');
    board.innerHTML = '';
    board.style.setProperty('--n', N);
    cells = [];
    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N), c = i % N, k = session.reg[i];
      const cell = el('div', { class: 'cell', role: 'gridcell', tabindex: i === 0 ? '0' : '-1', dataset: { idx: i, region: k } });
      cell.style.setProperty('--rc', `var(--region-${k})`);
      // contorno entre regiões diferentes (1px de cada lado = linha de 2px)
      const differs = (rr, cc) => rr < 0 || cc < 0 || rr >= N || cc >= N ? false : session.reg[rr * N + cc] !== k;
      if (differs(r - 1, c)) cell.style.setProperty('--bt', '1px');
      if (differs(r + 1, c)) cell.style.setProperty('--bb', '1px');
      if (differs(r, c - 1)) cell.style.setProperty('--bl', '1px');
      if (differs(r, c + 1)) cell.style.setProperty('--br', '1px');
      board.appendChild(cell);
      cells.push(cell);
    }
    renderAll();
    // nova fase: barra de progresso volta a zero sem animar a partir da fase anterior
    const pf = $('#progress-fill');
    pf.style.transition = 'none';
    pf.style.transform = 'scaleX(0)';
    void pf.offsetWidth;
    pf.style.transition = '';
    renderIndicators();
    renderCastPanel();
    message('');
  }

  /**
   * Transição de fase: o tabuleiro surge em branco e as casas se encaixam em onda
   * diagonal, cada uma com um "toc" suave; no fim, um acorde leve de encaixe perfeito.
   * Toques ficam bloqueados durante a animação; o cronômetro só começa depois.
   */
  let introTimers = [];
  function playIntro() {
    introTimers.forEach(clearTimeout);
    introTimers = [];
    const board = $('#board');
    board.classList.remove('intro');
    if (CPD.anim.mode() === 'off') return Promise.resolve();
    const N = level.size;
    const step = N <= 6 ? 60 : 40;  // intervalo entre ondas diagonais (ms)
    const hold = 260;               // quadro em branco antes da primeira casa
    const waves = 2 * N - 1;
    cells.forEach((c, i) => c.style.setProperty('--d', (hold + (Math.floor(i / N) + (i % N)) * step) + 'ms'));
    void board.offsetWidth;
    board.classList.add('intro');
    busy = true;
    const every = waves > 9 ? 2 : 1; // no máximo ~9 toques, para continuar leve
    for (let w = 0; w < waves; w += every) {
      introTimers.push(setTimeout(() => CPD.audio.play('snap', { step: w, of: waves }), hold + w * step + 250));
    }
    const total = hold + (waves - 1) * step + 480;
    introTimers.push(setTimeout(() => CPD.audio.play('fit'), total - 40));
    return new Promise((resolve) => {
      introTimers.push(setTimeout(() => { board.classList.remove('intro'); busy = false; resolve(); }, total + 60));
    });
  }

  /** Maior casa que cabe na tela; o tabuleiro é sempre quadrado (N·c). */
  function fitBoard() { fitOnce(); fitOnce(); }
  function fitOnce() {
    if (!level) return;
    const screen = $('#screen-game');
    if (screen.hidden) return;
    const N = level.size;
    const land = window.innerWidth > window.innerHeight && window.innerHeight < 560;
    screen.classList.toggle('compact-land', land);
    const chrome = $('.game-top').offsetHeight + $('.indicators').offsetHeight + $('#game-sub').offsetHeight;
    let w, h;
    if (land) {
      const side = Math.min(320, Math.max(220, window.innerWidth * 0.36));
      document.documentElement.style.setProperty('--side-w', side + 'px');
      w = window.innerWidth - side - 3 * 16;
      h = window.innerHeight - chrome - 24;
    } else {
      w = Math.min($('.board-area').clientWidth || window.innerWidth, 560);
      h = Math.min(window.innerHeight - chrome - $('.game-actions').offsetHeight - $('#how-line').offsetHeight - $('#game-msg').offsetHeight - 52, 560);
    }
    const c = Math.max(26, Math.floor(Math.min(w, h) / N));
    $('#board').style.setProperty('--c', c + 'px');
    document.documentElement.style.setProperty('--board-size', (N * c) + 'px');
  }

  /* ================= Renderização ================= */

  function renderCell(i, opts) {
    const cell = cells[i];
    const placed = session.isPlaced(i);
    cell.classList.toggle('placed', placed);
    cell.classList.toggle('given', session.isGiven(i));
    cell.innerHTML = '';
    const r = Math.floor(i / level.size) + 1, c = (i % level.size) + 1;
    if (placed) {
      const id = session.characterAt(i);
      const ch = CPD.characters.hasImages(id) ? charEl(id) : null;
      if (ch) {
        if (opts && opts.reveal) ch.classList.add('entering');
        cell.appendChild(ch);
      } else {
        cell.appendChild(el('span', { class: 'found-dot' }));
      }
      cell.setAttribute('aria-label', `Linha ${r}, coluna ${c}: ${nameOf(id)}`);
      return ch;
    }
    if (session.marks[i]) {
      cell.appendChild(el('span', { class: 'mark', 'aria-hidden': 'true' }, '✕'));
      cell.setAttribute('aria-label', `Linha ${r}, coluna ${c}: marcada`);
    } else if (autoMarks() && session.eliminated(i)) {
      cell.appendChild(el('span', { class: 'auto', 'aria-hidden': 'true' }));
      cell.setAttribute('aria-label', `Linha ${r}, coluna ${c}: descartada`);
    } else {
      cell.setAttribute('aria-label', `Linha ${r}, coluna ${c}: livre`);
    }
    return null;
  }

  function renderAll() {
    for (let i = 0; i < cells.length; i++) renderCell(i);
    updateHighlights();
  }

  function updateHighlights() {
    const N = level.size;
    const fr = focus >= 0 ? Math.floor(focus / N) : -1, fc = focus >= 0 ? focus % N : -1;
    for (let i = 0; i < cells.length; i++) {
      const inLine = focus >= 0 && !level.noLineHighlight && (Math.floor(i / N) === fr || i % N === fc);
      cells[i].classList.toggle('focus', i === focus);
      cells[i].classList.toggle('hl-line', inLine && i !== focus);
      cells[i].classList.toggle('coach', i === coachIdx);
      cells[i].tabIndex = i === (focus >= 0 ? focus : 0) ? 0 : -1;
    }
  }

  /** Painel lateral: cor de cada região, personagem escondido até ser revelado. */
  function renderCastPanel() {
    const panel = $('#cast-panel');
    panel.innerHTML = '';
    panel.appendChild(el('h4', null, 'Personagens desta fase'));
    const found = new Set(session.foundIds());
    const ul = el('ul');
    session.regionCast.forEach((id, k) => {
      const isFound = found.has(id);
      const face = el('span', { class: 'cast-face', '--rc': `var(--region-${k})` });
      face.style.setProperty('--rc', `var(--region-${k})`);
      face.appendChild((isFound && charEl(id)) || el('span', { class: 'cast-q' }, isFound ? '✓' : '?'));
      ul.appendChild(el('li', { class: isFound ? 'is-found' : '' }, face, el('span', null, isFound ? nameOf(id) : 'Escondido')));
    });
    panel.appendChild(ul);
  }

  function renderIndicators() {
    const lives = $('#ind-lives');
    lives.innerHTML = '';
    for (let k = 0; k < CPD.MAX_ERRORS; k++) lives.appendChild(icon('heart', k < CPD.MAX_ERRORS - session.errors ? '' : 'off'));
    lives.setAttribute('aria-label', `${CPD.MAX_ERRORS - session.errors} vidas`);
    $('#found-count').textContent = `${session.foundIds().length}/${session.size}`;
    const pct = Math.round(session.progress() * 100);
    $('#progress-fill').style.transform = `scaleX(${pct / 100})`;
    $('#progress-pct').textContent = pct + '%';
    $('#ind-progress').setAttribute('aria-valuenow', String(pct));
    const left = session.hintsLeft();
    const hb = $('#btn-hint');
    hb.querySelector('span').textContent = left === 1 ? 'Última dica' : `Dica (${left})`;
    hb.classList.toggle('last', left === 1);
    hb.disabled = left <= 0 || session.status !== 'playing';
    $('#btn-undo').disabled = !session.history.length || session.status !== 'playing';
    renderSub();
  }

  function renderSub() {
    if (!session) return;
    $('#game-sub').textContent = `${CPD.ui.formatTime(session.elapsedSec())} · ${CPD.ui.fmt(session.liveScore())} pts`;
  }

  function message(text, kind) {
    const m = $('#game-msg');
    m.textContent = text || '';
    m.className = 'game-msg' + (kind ? ' ' + kind : '');
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 4500);
  }

  /* ================= Interação ================= */

  function canPlay() { return session && session.status === 'playing' && !busy && !paused; }

  /** Toque simples: livre → ✕ → revelar. */
  function tap(i) {
    if (!canPlay()) return;
    focus = i;
    if (session.isPlaced(i)) { CPD.audio.play('select'); updateHighlights(); return; }
    if (!level.noMarks && !session.marks[i]) {
      session.toggleMark(i);
      CPD.audio.play('select');
      renderCell(i);
      CPD.anim.play(cells[i].querySelector('.mark'), 'pop');
      renderIndicators();
      updateHighlights();
      save();
      return;
    }
    reveal(i);
  }

  function reveal(i) {
    if (autoMarks() && session.eliminated(i)) {
      message('Essa casa já está descartada por um personagem revelado.');
      CPD.anim.shake(cells[i]);
      if (!level.noMarks) { session.toggleMark(i); renderCell(i); renderIndicators(); }
      return;
    }
    const foundBefore = new Set(session.foundIds());
    const res = session.place(i);
    if (res.type === 'correct') {
      CPD.audio.play('correct');
      afterReveal(i, foundBefore);
      message(`Você encontrou ${nameOf(res.character)}!`, 'good');
      save();
      if (res.won) { busy = true; setTimeout(onWin, 1100); }
      return;
    }
    if (res.type === 'wrong') {
      CPD.audio.play('error');
      renderCell(i);
      cells[i].classList.add('is-wrong');
      CPD.anim.shake(cells[i]);
      setTimeout(() => cells[i] && cells[i].classList.remove('is-wrong'), 700);
      renderIndicators();
      const heart = $('#ind-lives').children[CPD.MAX_ERRORS - session.errors];
      CPD.anim.play(heart, 'shake');
      const lives = CPD.MAX_ERRORS - session.errors;
      message(`Ninguém mora aqui. Respira e tenta de novo (${lives} ${lives === 1 ? 'vida' : 'vidas'}).`, 'bad');
      save();
      if (res.lost) { busy = true; setTimeout(onLose, 1000); }
    }
  }

  /** Depois de uma revelação certa (jogada ou dica): anima e atualiza tudo. */
  function afterReveal(i, foundBefore) {
    const ch = renderCell(i, { reveal: true });
    if (autoMarks()) for (let j = 0; j < cells.length; j++) if (j !== i && !session.isPlaced(j)) renderCell(j);
    if (i === coachIdx) coachIdx = -1;
    CPD.anim.play(cells[i], 'correct', { timeout: 700 });
    if (ch) CPD.anim.reveal(ch);
    const id = session.characterAt(i);
    if (!foundBefore.has(id)) {
      CPD.progress.markFound([id]);
      const c = CPD.characters.get(id);
      setTimeout(() => CPD.audio.play(c && c.kind === 'cat' ? 'meow' : 'reveal'), 140);
    }
    renderCastPanel();
    renderIndicators();
    updateHighlights();
  }

  function undo() {
    if (!canPlay()) return;
    const changed = session.undo();
    if (!changed) return;
    CPD.audio.play('click');
    changed.forEach((i) => renderCell(i));
    renderIndicators();
    save();
  }

  async function doHint() {
    if (!canPlay()) return;
    if (session.hintsLeft() === 1) {
      session.pause();
      const ok = await CPD.ui.confirm({
        title: 'Última dica',
        message: 'Usar a <b>terceira dica</b> revela um personagem, mas <b>encerra a partida</b>. Quer mesmo usar?',
        okText: 'Usar e encerrar', cancelText: 'Continuar jogando', danger: true,
      });
      session.start();
      if (!ok) return;
    }
    const foundBefore = new Set(session.foundIds());
    const res = session.useHint(focus);
    if (!res) return;
    CPD.audio.play('hint');
    focus = res.idx;
    afterReveal(res.idx, foundBefore);
    const left = session.hintsLeft();
    if (res.lost) message('Era a última dica…', 'bad');
    else message(`Dica: ${nameOf(res.character)} estava aqui.${left === 1 ? ' A próxima dica encerra a partida.' : ''}`);
    save();
    if (res.lost) { busy = true; setTimeout(onLose, 1300); }
    else if (res.won) { busy = true; setTimeout(onWin, 1100); }
  }

  /* ---- arrastar para marcar ---- */
  function cellAt(x, y) {
    const t = document.elementFromPoint(x, y);
    const c = t && t.closest && t.closest('#board .cell');
    return c ? Number(c.dataset.idx) : -1;
  }
  function onPointerDown(e) {
    if (!canPlay() || e.button > 0) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    $('#board').setPointerCapture(e.pointerId);
    drag = { start: i, last: i, moved: false, value: session.marks[i] ? 0 : 1, group: null, id: e.pointerId };
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id || level.noMarks) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || i === drag.last) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.group = session.beginGroup();
      if (session.setMark(drag.start, drag.value, drag.group)) renderCell(drag.start);
    }
    drag.last = i;
    if (session.setMark(i, drag.value, drag.group)) { renderCell(i); CPD.audio.play('select'); }
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) { session.endGroup(d.group); renderIndicators(); save(); return; }
    tap(d.start);
  }

  /* ================= Pausa e ajustes ================= */

  function pause(showMenu) {
    if (!session || session.status !== 'playing' || paused) return;
    paused = true;
    session.pause();
    save();
    $('#board-veil').hidden = false;
    if (showMenu !== false) {
      $('#pause-info').textContent = `Nível ${level.id} · ${CPD.ui.formatTime(session.elapsedSec())} · ${session.errors} erro(s) · ${session.hintsUsed} dica(s)`;
      CPD.ui.openOverlay('ov-pause');
    }
  }
  function resume() {
    CPD.ui.closeOverlay('ov-pause');
    CPD.ui.closeOverlay('ov-quick');
    beginTimer();
  }

  function openQuick() {
    if (!session) return;
    pause(false);
    const body = $('#quick-body');
    body.innerHTML = '';
    const { settingRow, toggle, range } = CPD.ui;
    body.append(
      settingRow('Música', null, range('musicVolume')),
      settingRow('Efeitos', null, range('sfxVolume')),
      settingRow('Silenciar música', null, toggle('muteMusic')),
      settingRow('Animações', null, toggle('animations')),
    );
    CPD.ui.openOverlay('ov-quick');
  }

  /* ================= Tutorial ================= */

  function showTutorial(key, onDone) {
    const steps = CPD.levels.TUTORIALS[key];
    if (!steps) { if (onDone) onDone(); return; }
    let k = 0;
    const o = $('#ov-tutorial');
    const art = $('#tutorial-art');
    art.innerHTML = '';
    const demo = [0, 0, 1, 1, 0, 2, 2, 1, 3, 2, 2, 1, 3, 3, 3, 1];
    const marks = { 0: '★', 7: '★', 9: '★', 12: '★' };
    demo.forEach((g, i) => {
      const t = el('span', { class: 'tut-tile' }, marks[i] || '');
      t.style.background = `var(--region-${g})`;
      art.appendChild(t);
    });
    const paint = () => {
      $('#tutorial-title').textContent = steps[k].title;
      $('#tutorial-text').innerHTML = steps[k].text;
      $('#tutorial-dots').innerHTML = steps.map((_, j) => `<i class="${j === k ? 'on' : ''}"></i>`).join('');
      $('[data-act="next"]', o).textContent = k === steps.length - 1 ? 'Jogar!' : 'Próximo';
    };
    const finish = () => {
      $('[data-act="next"]', o).onclick = null;
      $('[data-act="skip"]', o).onclick = null;
      CPD.ui.closeOverlay('ov-tutorial');
      if (steps.some((s) => s.coach) && session && session.status === 'playing') {
        coachIdx = coachCell();
        updateHighlights();
        if (coachIdx >= 0) message('A casa com contorno verde é a única opção da região dela.');
      }
      if (onDone) onDone();
    };
    $('[data-act="next"]', o).onclick = () => { CPD.audio.play('click'); if (k < steps.length - 1) { k++; paint(); } else finish(); };
    $('[data-act="skip"]', o).onclick = () => finish();
    paint();
    CPD.ui.openOverlay('ov-tutorial');
  }

  /** Casa da solução numa região que só tem uma opção livre (para o tutorial). */
  function coachCell() {
    for (let k = 0; k < session.size; k++) {
      const free = [];
      for (let i = 0; i < cells.length; i++) if (session.reg[i] === k && !session.isPlaced(i) && !session.eliminated(i)) free.push(i);
      if (free.length === 1 && session.solSet.has(free[0])) return free[0];
    }
    return -1;
  }

  /* ================= Fim de partida ================= */

  function resultRow(dl, label, value, cls) {
    dl.appendChild(el('dt', { class: cls || null }, label));
    dl.appendChild(el('dd', { class: cls || null }, value));
  }

  function onWin() {
    stopTimer();
    const r = session.result();
    const rec = CPD.progress.record(level, r);
    CPD.progress.clearGame();
    CPD.audio.play('victory');
    CPD.audio.setContext(level.finale ? 'finale' : 'victory');
    $('#victory-kicker').textContent = level.finale ? 'Campanha concluída · Para sempre ♥' : `Nível ${level.id} concluído`;
    const row = $('#victory-chars');
    row.innerHTML = '';
    session.foundIds().forEach((id, k) => {
      const c = charEl(id);
      if (!c) return;
      c.classList.add('is-happy', 'fx-celebrate');
      c.style.animationDelay = (k * 110) + 'ms';
      row.appendChild(c);
    });
    row.hidden = !row.children.length;
    $('#victory-stars').innerHTML = '';
    for (let s = 1; s <= 3; s++) $('#victory-stars').appendChild(icon('star', s <= r.stars ? 'on' : ''));
    const badge = $('#victory-badge');
    const notes = [];
    if (rec.newBest) notes.push(rec.prevBest ? 'Novo recorde!' : 'Primeira vitória!');
    if (rec.totalGain > 0) notes.push(`+${CPD.ui.fmt(rec.totalGain)} no total`);
    badge.textContent = notes.join(' · ');
    badge.hidden = !notes.length;
    const dl = $('#victory-table');
    dl.innerHTML = '';
    const b = r.breakdown;
    resultRow(dl, `Personagens revelados (${r.placements})`, '+' + CPD.ui.fmt(b.placements));
    resultRow(dl, 'Fase concluída', '+' + CPD.ui.fmt(b.completion));
    resultRow(dl, 'Sem erros', b.noErrors ? '+' + b.noErrors : '—');
    resultRow(dl, 'Sem dicas', b.noHints ? '+' + b.noHints : '—');
    resultRow(dl, `Velocidade (máx. ${CPD.scoring.speedCap(level)})`, b.speed ? '+' + b.speed : '—');
    resultRow(dl, 'Tempo', CPD.ui.formatTime(r.timeSec));
    resultRow(dl, 'Erros · Dicas', `${r.errors} · ${r.hints}`);
    resultRow(dl, 'Pontuação', CPD.ui.fmt(r.score), 'total');
    if (!rec.newBest && rec.prevBest) resultRow(dl, 'Seu recorde nesta fase', CPD.ui.fmt(rec.prevBest));
    const nxt = CPD.levels.next(level.id);
    $('#ov-victory [data-act="next"]').hidden = !nxt;
    CPD.ui.openOverlay('ov-victory');
    CPD.support.noteWin();
    if (rec.unlocked) setTimeout(() => { CPD.audio.play('unlock'); CPD.ui.toast(`Nível ${rec.unlocked} desbloqueado!`, 'ok'); }, 900);
    busy = false;
  }

  function onLose() {
    stopTimer();
    const r = session.result();
    CPD.progress.record(level, r);
    CPD.progress.clearGame();
    CPD.audio.play('defeat');
    setTimeout(() => CPD.audio.setContext('defeat'), 300);
    $('#defeat-kicker').textContent = `Nível ${level.id} · ${level.name}`;
    const holder = $('#defeat-char');
    holder.innerHTML = '';
    const found = session.foundIds().filter((id) => CPD.characters.hasImages(id));
    const pick = found.length ? found[Math.floor(Math.random() * found.length)] : null;
    if (pick) holder.appendChild(charEl(pick));
    holder.hidden = !pick;
    const who = pick ? nameOf(pick) + ' te espera para a próxima' : 'Respira e tenta de novo';
    $('#defeat-reason').textContent = r.reason === 'hints'
      ? `A terceira dica encerra a partida. ${who}.`
      : `Três tentativas em casas vazias desta vez. ${who}.`;
    const dl = $('#defeat-table');
    dl.innerHTML = '';
    resultRow(dl, 'Pontuação obtida', CPD.ui.fmt(r.score));
    resultRow(dl, 'Tempo', CPD.ui.formatTime(r.timeSec));
    resultRow(dl, 'Erros', String(r.errors));
    resultRow(dl, 'Dicas', String(r.hints));
    resultRow(dl, 'Personagens encontrados', `${session.foundIds().length}/${session.size}`);
    CPD.ui.openOverlay('ov-defeat');
    busy = false;
  }

  /* ================= Eventos ================= */

  function moveFocus(dr, dc) {
    const N = level.size;
    const i = focus < 0 ? 0 : focus;
    const r = (Math.floor(i / N) + dr + N) % N, c = (i % N + dc + N) % N;
    focus = r * N + c;
    updateHighlights();
    cells[focus].focus({ preventScroll: true });
  }

  function onKey(e) {
    if ($('#screen-game').hidden || !session) return;
    if (CPD.ui.anyOverlay()) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'Escape') { pause(); e.preventDefault(); return; }
    if (!canPlay()) return;
    if (k === 'ArrowUp') { moveFocus(-1, 0); e.preventDefault(); }
    else if (k === 'ArrowDown') { moveFocus(1, 0); e.preventDefault(); }
    else if (k === 'ArrowLeft') { moveFocus(0, -1); e.preventDefault(); }
    else if (k === 'ArrowRight') { moveFocus(0, 1); e.preventDefault(); }
    else if (focus >= 0 && (k === 'x' || k === 'X' || k === ' ') && !level.noMarks) {
      if (!session.isPlaced(focus)) { session.toggleMark(focus); renderCell(focus); renderIndicators(); save(); }
      e.preventDefault();
    } else if (focus >= 0 && k === 'Enter') { if (!session.isPlaced(focus)) reveal(focus); e.preventDefault(); }
    else if (k === 'z' || k === 'Z') undo();
  }

  function bind() {
    const board = $('#board');
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', () => { if (drag && drag.moved) session.endGroup(drag.group); drag = null; });
    board.addEventListener('contextmenu', (e) => e.preventDefault());
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-hint').addEventListener('click', doHint);
    $('#game-pause').addEventListener('click', () => { CPD.audio.play('click'); pause(); });
    $('#game-quick').addEventListener('click', () => { CPD.audio.play('click'); openQuick(); });
    $('#ov-quick [data-act="close"]').addEventListener('click', resume);

    $('#ov-pause').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      CPD.audio.play('click');
      const act = b.dataset.act;
      if (act === 'resume') resume();
      else if (act === 'tutorial') { CPD.ui.closeOverlay('ov-pause'); showTutorial(level.tutorial || 'basics', () => resume()); }
      else if (act === 'restart') {
        const ok = await CPD.ui.confirm({ title: 'Reiniciar fase?', message: 'Um tabuleiro novo será gerado e o progresso desta partida será perdido.', okText: 'Reiniciar' });
        if (ok) { CPD.ui.closeOverlay('ov-pause'); CPD.progress.clearGame(); start(level.id); }
      } else if (act === 'levels' || act === 'menu') { CPD.ui.closeOverlay('ov-pause'); CPD.app.navigate(act); }
    });
    $('#ov-victory').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      CPD.audio.play('click');
      const act = b.dataset.act;
      if (act === 'next') {
        const n = CPD.levels.next(level.id);
        if (!n) return;
        if (CPD.support.pending()) { CPD.ui.closeOverlay('ov-victory'); CPD.support.openPopup(() => start(n.id)); } else start(n.id);
      }
      else if (act === 'retry') start(level.id);
      else { CPD.ui.closeOverlay('ov-victory'); CPD.app.navigate('menu'); }
    });
    $('#ov-defeat').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      CPD.audio.play('click');
      if (b.dataset.act === 'retry') start(level.id);
      else { CPD.ui.closeOverlay('ov-defeat'); CPD.app.navigate('menu'); }
    });

    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => requestAnimationFrame(fitBoard));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !$('#screen-game').hidden && isActive() && !paused) pause();
    });
    window.addEventListener('pagehide', () => { if (session && session.status === 'playing') { session.pause(); save(); } });
    CPD.on('characters-ready', () => { if (session && !$('#screen-game').hidden) { renderAll(); renderCastPanel(); } });
  }

  CPD.game = {
    bind, start, resumeSaved, leave, isActive, fitBoard, tap, reveal,
    current: () => session,
    _debug: () => ({ session, focus, busy, paused, coachIdx }),
  };
})(window.CPD = window.CPD || {});

/* CarolPawsDoku — aplicação: roteador e telas de menu, fases, personagens, placar, músicas e configurações. */
(function (CPD) {
  'use strict';

  const { $, $$, el, icon, charEl, fmt, formatTime } = CPD.ui;

  const SCREENS = ['menu', 'levels', 'game', 'characters', 'scores', 'music', 'settings', 'support'];
  let current = null;

  /* ================= Roteador ================= */
  function navigate(name) {
    if (location.hash.slice(1) !== name) location.hash = name;
    else show(name);
  }

  function show(name) {
    if (!SCREENS.includes(name)) name = 'menu';
    if (name === 'game' && !CPD.game.current()) name = 'levels';
    if (current === 'game' && name !== 'game') {
      CPD.game.leave();
      ['ov-victory', 'ov-defeat', 'ov-pause', 'ov-quick', 'ov-tutorial', 'ov-support'].forEach(CPD.ui.closeOverlay);
    }
    SCREENS.forEach((s) => { $('#screen-' + s).hidden = s !== name; });
    const changed = current !== name;
    current = name;
    if (location.hash.slice(1) !== name) history.pushState(null, '', '#' + name);
    const render = RENDER[name];
    if (render) render();
    if (name !== 'game' && name !== 'music') CPD.audio.setContext('menu');
    if (changed) window.scrollTo(0, 0);
    // aviso da campanha pendente (a cada 3 fases vencidas): só fora da partida
    if ((name === 'menu' || name === 'levels') && CPD.support.pending()) setTimeout(CPD.support.maybePopup, 350);
  }

  /* ================= Menu ================= */
  function renderMenu() {
    const saved = CPD.progress.loadGame();
    const cont = $('#btn-continue');
    if (saved && saved.status === 'playing' && CPD.levels.get(saved.levelId)) {
      cont.hidden = false;
      cont.querySelector('span').textContent = `Continuar · Nível ${saved.levelId} (${formatTime((saved.elapsedMs || 0) / 1000)})`;
    } else cont.hidden = true;
    const st = CPD.progress.stats();
    $('#menu-summary').textContent = `Nível ${Math.min(st.unlocked, CPD.levels.LEVELS.length)} · ${fmt(st.totalScore)} pts · ${st.foundCount}/${CPD.characters.CAST.length} personagens`;
  }

  /* ================= Fases ================= */
  function renderLevels() {
    const st = CPD.progress.stats();
    $('#levels-total').textContent = `${fmt(st.totalScore)} pts · ${st.stars}★`;
    const body = $('#levels-body');
    body.innerHTML = '';
    const unlocked = CPD.progress.get().unlocked;
    Object.keys(CPD.levels.GROUPS).forEach((gk) => {
      const g = CPD.levels.GROUPS[gk];
      const lvls = CPD.levels.LEVELS.filter((l) => l.group === gk);
      const grid = el('div', { class: 'level-grid' });
      lvls.forEach((l) => {
        const info = CPD.progress.levelInfo(l.id);
        const locked = l.id > unlocked;
        const tile = el('button', {
          class: 'level-tile' + (locked ? ' is-locked' : '') + (l.id === unlocked && !(info && info.wins) ? ' is-next' : ''),
          'aria-label': `Nível ${l.id}, ${l.name}${locked ? ', bloqueado' : ''}`, dataset: { level: l.id },
        },
        el('span', { class: 'size' }, `${l.size}×${l.size}`),
        locked ? icon('lock', 'lock') : null,
        el('span', { class: 'num' }, String(l.id)),
        el('span', { class: 'lname' }, l.name),
        diffPips(l.difficulty),
        !locked && info && info.wins ? el('span', { class: 'tile-stars' }, [1, 2, 3].map((s) => icon('star', s <= info.stars ? 'on' : ''))) : null,
        !locked && info && info.best ? el('span', { class: 'best' }, fmt(info.best) + ' pts') : null);
        tile.addEventListener('click', () => onLevel(l, locked));
        grid.appendChild(tile);
      });
      body.appendChild(el('section', { class: 'level-group' },
        el('h3', null, g.label, el('small', null, `níveis ${g.range} · ${g.sizes}`)), grid));
    });
  }

  function diffPips(d) {
    const n = Math.ceil(d / 2);
    return el('span', { class: 'diff-pips', 'aria-label': `dificuldade ${d} de 10` }, [1, 2, 3, 4, 5].map((k) => el('i', { class: k <= n ? 'on' : '' })));
  }

  async function onLevel(l, locked) {
    if (locked) { CPD.audio.play('error'); CPD.ui.toast('Conclua a fase anterior para desbloquear.'); return; }
    CPD.audio.play('click');
    const saved = CPD.progress.loadGame();
    if (saved && saved.status === 'playing') {
      if (saved.levelId === l.id) {
        const cont = await CPD.ui.confirm({ title: `Nível ${l.id}`, message: 'Você tem uma partida em andamento nesta fase.', okText: 'Continuar partida', cancelText: 'Começar de novo' });
        CPD.game.start(l.id, { resume: cont });
        return;
      }
      const ok = await CPD.ui.confirm({ title: 'Partida em andamento', message: `Há uma partida não terminada no nível ${saved.levelId}. Começar o nível ${l.id} descarta aquela partida.`, okText: 'Começar' });
      if (!ok) return;
    }
    CPD.game.start(l.id);
  }

  /* ================= Personagens (coleção) ================= */
  function renderCharacters() {
    const grid = $('#char-grid');
    grid.innerHTML = '';
    const total = CPD.characters.CAST.length;
    const found = CPD.characters.CAST.filter((c) => CPD.progress.hasFound(c.id)).length;
    $('#char-count').textContent = `${found}/${total} encontrados`;
    CPD.characters.list().forEach((c) => {
      const isFound = CPD.progress.hasFound(c.id);
      const face = isFound ? charEl(c.id) : null;
      const card = el('button', { class: 'char-card' + (isFound ? ' is-found' : ''), 'aria-label': isFound ? `${c.name}: ver expressão de alegria` : 'Personagem ainda não encontrado', disabled: !isFound },
        el('span', { class: 'char-stage' }, face || el('span', { class: 'cast-q' }, isFound ? c.name.charAt(0) : '?')),
        el('b', null, isFound ? c.name : '???'),
        el('small', null, isFound ? `revelado ${CPD.progress.get().found[c.id]}×` : 'resolva fases para encontrar'));
      if (face) card.addEventListener('click', () => CPD.anim.reveal(face));
      grid.appendChild(card);
    });
  }

  /* ================= Placar ================= */
  function renderScores() {
    const body = $('#scores-body');
    body.innerHTML = '';
    const s = CPD.progress.stats();
    const rows = [
      ['Pontuação acumulada', fmt(s.totalScore)],
      ['Melhor pontuação', fmt(s.bestScore)],
      ['Vitórias · Derrotas', `${s.wins} · ${s.losses}`],
      ['Fases concluídas', `${s.completed}/${CPD.levels.LEVELS.length}`],
      ['Estrelas', String(s.stars)],
      ['Tempo médio (vitórias)', s.avgTime ? formatTime(s.avgTime) : '—'],
      ['Dicas utilizadas', String(s.hintsUsed)],
      ['Erros cometidos', String(s.errors)],
      ['Personagens encontrados', `${s.foundCount}/${CPD.characters.CAST.length}`],
    ];
    const dl = el('dl', { class: 'stat-list' });
    rows.forEach(([k, v]) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); });
    body.appendChild(el('div', { class: 'card' }, el('h3', null, 'Resumo'), dl,
      el('p', { class: 'hint-text' }, 'A pontuação acumulada soma o melhor resultado de cada fase: repetir uma fase só aumenta o total quando supera o recorde.')));

    const played = CPD.levels.LEVELS.filter((l) => CPD.progress.levelInfo(l.id));
    const best = el('div', { class: 'card' }, el('h3', null, 'Melhores resultados'));
    if (!played.length) best.appendChild(el('p', { class: 'empty' }, 'Nenhuma fase jogada ainda.'));
    else {
      const ul = el('ul', { class: 'history' });
      played.forEach((l) => {
        const i = CPD.progress.levelInfo(l.id);
        ul.appendChild(el('li', null,
          el('span', { class: 'lvl' }, String(l.id)),
          el('span', null, l.name, el('small', null, i.wins ? `${i.wins} vitória(s) · melhor tempo ${formatTime(i.bestTime)} · ${'★'.repeat(i.stars)}` : `${i.plays} tentativa(s), sem vitória`)),
          el('span', { class: 'pts' }, i.best ? fmt(i.best) : '—')));
      });
      best.appendChild(ul);
    }
    body.appendChild(best);

    const hist = el('div', { class: 'card' }, el('h3', null, 'Histórico de partidas'));
    const h = CPD.progress.get().history;
    if (!h.length) hist.appendChild(el('p', { class: 'empty' }, 'Sem partidas registradas.'));
    else {
      const ul = el('ul', { class: 'history' });
      h.slice(0, 25).forEach((e) => {
        const L = CPD.levels.get(e.level);
        ul.appendChild(el('li', null,
          el('span', { class: 'res ' + (e.won ? 'win' : 'loss') }, e.won ? 'vitória' : 'derrota'),
          el('span', null, `Nível ${e.level}${L ? ' · ' + L.name : ''}`, el('small', null, `${CPD.ui.formatDate(e.date)} · ${formatTime(e.time)} · ${e.errors} erro(s) · ${e.hints} dica(s)${!e.won && e.reason === 'hints' ? ' · 3ª dica' : ''}`)),
          el('span', { class: 'pts' }, fmt(e.score))));
      });
      hist.appendChild(ul);
    }
    body.appendChild(hist);
  }

  /* ================= Músicas ================= */
  async function renderMusic() {
    const body = $('#music-body');
    body.innerHTML = '';
    const { settingRow, toggle, range, select } = CPD.ui;
    const nameOf = (id) => (CPD.audio.TRACKS.find((t) => t.id === id) || {}).name || id;

    body.appendChild(el('div', { class: 'card' }, el('h3', null, 'Reprodução'),
      el('div', { class: 'settings-list' },
        settingRow('Volume da música', null, range('musicVolume')),
        settingRow('Silenciar música', null, toggle('muteMusic')),
        settingRow('Seleção de trilha', 'Automática troca a música conforme a tela e a fase', select('trackMode', [{ value: 'auto', label: 'Automática' }, { value: 'manual', label: 'Sempre a mesma' }])),
        settingRow('Trilha fixa', 'Usada no modo “Sempre a mesma”', select('manualTrack', CPD.audio.TRACKS.map((t) => ({ value: t.id, label: t.name })))),
        settingRow('Repetir a faixa', 'Desligado: segue para a próxima da lista', toggle('loop')))));

    const n = await CPD.audio.cachedCount();
    const tracks = el('div', { class: 'card' }, el('h3', null, 'Trilha sonora'),
      el('p', { class: 'hint-text' }, `${CPD.audio.TRACKS.length} faixas. ${n ? n + ' já guardada(s) neste navegador para abrir mais rápido.' : 'Cada faixa fica guardada no navegador depois de tocar pela primeira vez.'}`));
    Object.keys(CPD.audio.PLAYLISTS).forEach((key) => {
      const pl = CPD.audio.PLAYLISTS[key];
      tracks.appendChild(el('p', { class: 'track-group' }, pl.label));
      pl.tracks.forEach((id) => {
        const playing = CPD.audio.current() === id;
        const btn = el('button', { class: 'btn btn-sm', 'data-audio-control': '', 'data-track': id, 'aria-label': `Tocar ${nameOf(id)}` }, icon(playing ? 'stop' : 'play'));
        btn.addEventListener('click', () => {
          if (CPD.audio.current() === id) CPD.audio.stopMusic(); else CPD.audio.playTrack(id);
        });
        tracks.appendChild(el('div', { class: 'track' + (playing ? ' is-playing' : ''), dataset: { trackRow: id } },
          el('span', { class: 'track-name' }, nameOf(id)), btn));
      });
    });
    body.appendChild(tracks);

    const sfx = el('div', { class: 'card' }, el('h3', null, 'Efeitos sonoros'),
      el('div', { class: 'settings-list' },
        settingRow('Volume dos efeitos', null, range('sfxVolume')),
        settingRow('Silenciar efeitos', null, toggle('muteSfx'))));
    CPD.audio.SFX.forEach((s) => {
      const b = el('button', { class: 'btn btn-sm', 'data-audio-control': '', 'aria-label': `Ouvir ${s.name}` }, icon('sound'));
      b.addEventListener('click', () => CPD.audio.play(s.id));
      sfx.appendChild(el('div', { class: 'track' }, el('span', { class: 'track-name' }, s.name), b));
    });
    body.appendChild(sfx);
  }

  /* ================= Configurações ================= */
  function renderSettings() {
    const body = $('#settings-body');
    body.innerHTML = '';
    const { settingRow, toggle, range, select } = CPD.ui;
    body.appendChild(el('div', { class: 'card' }, el('h3', null, 'Som'),
      el('div', { class: 'settings-list' },
        settingRow('Volume da música', null, range('musicVolume')),
        settingRow('Volume dos efeitos', null, range('sfxVolume')),
        settingRow('Silenciar música', null, toggle('muteMusic')),
        settingRow('Silenciar efeitos', null, toggle('muteSfx')))));

    body.appendChild(el('div', { class: 'card' }, el('h3', null, 'Movimento'),
      el('div', { class: 'settings-list' },
        settingRow('Animações', 'Revelação dos personagens e transições', toggle('animations')),
        settingRow('Reduzir movimento', '“Sistema” segue a preferência do aparelho', select('reduceMotion', [{ value: 'system', label: 'Sistema' }, { value: 'on', label: 'Sim' }, { value: 'off', label: 'Não' }])))));

    const reset = el('button', { class: 'btn btn-danger' }, icon('trash'), 'Zerar progresso');
    reset.addEventListener('click', async () => {
      const ok = await CPD.ui.confirm({ title: 'Zerar progresso?', message: 'Fases desbloqueadas, pontuação, personagens encontrados e histórico serão apagados. Não dá para desfazer.', okText: 'Zerar', danger: true });
      if (ok) { CPD.progress.reset(); CPD.ui.toast('Progresso apagado'); }
    });
    body.appendChild(el('div', { class: 'card' }, el('h3', null, 'Dados'),
      el('p', { class: 'hint-text' }, 'O progresso fica salvo neste navegador. Imagens e músicas ficam guardadas em cache para o jogo abrir mais rápido.'),
      el('div', { class: 'dialog-actions' }, reset)));
  }

  const RENDER = {
    menu: renderMenu, levels: renderLevels, characters: renderCharacters,
    scores: renderScores, music: renderMusic, settings: renderSettings, support: () => CPD.support.renderPage(),
    game: () => requestAnimationFrame(() => { CPD.game.fitBoard(); requestAnimationFrame(CPD.game.fitBoard); }),
  };

  /* ================= Inicialização ================= */
  function bindGlobal() {
    document.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]');
      if (n) { CPD.audio.play('click'); navigate(n.dataset.nav); }
    });
    $('#btn-continue').addEventListener('click', () => { CPD.audio.play('click'); CPD.game.resumeSaved(); });
    window.addEventListener('hashchange', () => show(location.hash.slice(1) || 'menu'));

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const top = CPD.ui.topOverlay();
      if (!top) return;
      if (top === 'ov-confirm') { const o = $('#ov-confirm'); if (o._cancel) o._cancel(); }
      else if (top === 'ov-quick') $('#ov-quick [data-act="close"]').click();
      else if (top === 'ov-pause') $('#ov-pause [data-act="resume"]').click();
      else if (top === 'ov-support') CPD.support.closePopup(false);
    });

    CPD.on('progress', () => { if (current === 'menu') renderMenu(); });
    CPD.on('characters-ready', () => { if (current === 'characters') renderCharacters(); });
    // Atualiza só o estado visual da lista de músicas (sem recriar botões no meio de um toque).
    CPD.on('music', () => {
      if (current !== 'music') return;
      const cur = CPD.audio.current();
      $$('[data-track-row]').forEach((row) => {
        const on = row.dataset.trackRow === cur;
        row.classList.toggle('is-playing', on);
        const use = row.querySelector('[data-track] use');
        if (use) use.setAttribute('href', on ? '#i-stop' : '#i-play');
      });
    });
  }

  /** Cache de recursos: Service Worker (só em http/https; em file:// o jogo funciona sem cache). */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[CPD] Service Worker não registrado:', e.message));
  }

  function init() {
    CPD.anim.applyRootClasses();
    CPD.audio.init();
    CPD.game.bind();
    CPD.support.init();
    bindGlobal();
    show(location.hash.slice(1) || 'menu');
    // aviso inicial da campanha (uma vez; respeita “não mostrar novamente”)
    if (current !== 'game' && current !== 'support') setTimeout(CPD.support.maybePopup, 900);
    CPD.characters.preload();
    registerServiceWorker();
    document.documentElement.classList.add('ready');
  }

  CPD.app = { navigate, show, current: () => current };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.CPD = window.CPD || {});

/* CarolPawsDoku — Audio Manager (independente da lógica do Sudoku).
 * Músicas: arquivos MP3 do projeto em src/assets/audio/music/, organizados em
 *   listas por contexto. A troca é em sequência, sem sobrepor músicas: a faixa
 *   atual sai devagar, há uma pausa curta e a nova entra devagar (curvas suaves).
 *   Perto do fim de cada faixa o volume também desce aos poucos. Cada faixa é guardada no Cache Storage na primeira vez que
 *   toca e, depois, lida do cache como blob (evita downloads repetidos e o
 *   problema de "range requests" de mídia em Service Workers).
 * Efeitos: sintetizados com Web Audio (seleção, acerto, erro, dica, miado…).
 * O áudio só começa após a primeira interação do usuário (política de autoplay).
 */
(function (CPD) {
  'use strict';

  const MUSIC_DIR = 'src/assets/audio/music/';
  const AUDIO_CACHE = 'cpd-audio-v2'; // mude o sufixo se substituir arquivos com o mesmo nome
  const FADE_OUT_MS = 2800; // saída da faixa atual
  const GAP_MS = 500;       // silêncio curto entre uma música e outra
  const FADE_IN_MS = 3500;  // entrada da nova faixa
  const END_FADE_S = 4;     // segundos finais de cada faixa com volume descendo
  const STOP_MS = 1500;     // parar a música (ex.: volume zerado)

  const TRACKS = [
    { id: 'academia-de-calma', name: 'Academia de Calma' },
    { id: 'antarctic-chill', name: 'Antarctic Chill' },
    { id: 'island-puzzle-flow', name: 'Island Puzzle Flow' },
    { id: 'brisa-tropical', name: 'Brisa Tropical' },
    { id: 'bikini-atoll-lofi', name: 'Bikini Atoll Lofi' },
    { id: 'vibe-da-praia-maluca', name: 'Vibe da Praia Maluca' },
    { id: 'twisted-harmony', name: 'Twisted Harmony' },
    { id: 'folga-do-cientista', name: 'Folga do Cientista' },
    { id: 'gem-stone-hop', name: 'Gem Stone Hop' },
    { id: 'o-nivel-zen-final', name: 'O Nível Zen Final' },
  ];

  /* Trilha contínua, como uma rádio: a música só muda quando a faixa termina.
   * Trocar de tela, entrar numa fase, vencer ou encerrar uma rodada NÃO troca a
   * música (vitória e fim de rodada têm só os efeitos sonoros curtos).
   * Todas as faixas tocam uma vez, em ordem embaralhada, antes de alguma repetir. */
  const PLAYLISTS = {
    main: { label: 'Trilha do jogo · segue tocando entre as telas', tracks: TRACKS.map((t) => t.id) },
  };

  const SFX = [
    { id: 'select', name: 'Seleção de célula' },
    { id: 'correct', name: 'Acerto' },
    { id: 'error', name: 'Erro' },
    { id: 'hint', name: 'Dica' },
    { id: 'meow', name: 'Miado (gatinhas)' },
    { id: 'reveal', name: 'Revelação (pessoas)' },
    { id: 'unlock', name: 'Desbloqueio de fase' },
    { id: 'victory', name: 'Vitória' },
    { id: 'defeat', name: 'Fim da rodada' },
    { id: 'click', name: 'Cliques nos menus' },
    { id: 'snap', name: 'Casas se encaixando' },
    { id: 'fit', name: 'Tabuleiro pronto' },
  ];

  const S = () => CPD.settings;
  const musicVol = () => (S().get('muteMusic') ? 0 : S().get('musicVolume'));
  const sfxVol = () => (S().get('muteSfx') ? 0 : S().get('sfxVolume'));
  const trackUrl = (id) => MUSIC_DIR + id + '.mp3';

  let ctx = null, sfxGain = null, unlocked = false, pendingStart = false;
  let currentContext = 'menu', currentKey = null, currentTrack = null, token = 0;
  const players = [new Audio(), new Audio()];
  players.forEach((p) => {
    p.preload = 'auto';
    p.addEventListener('ended', () => onEnded(p));
    p.addEventListener('timeupdate', () => fadeNearEnd(p));
  });
  let active = 0; // índice do player audível
  const blobUrls = new Map(); // id → objectURL (limitado a 4 para economizar memória)

  /* ---------------- Inicialização ---------------- */
  function init() {
    const unlock = (e) => {
      ensureContext();
      const onControl = e && e.target && e.target.closest && e.target.closest('[data-audio-control]');
      if (pendingStart && !onControl) { pendingStart = false; setContext(currentContext, true); }
    };
    ['pointerdown', 'keydown', 'touchend'].forEach((t) => window.addEventListener(t, unlock, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      const p = players[active];
      if (document.hidden) { p.pause(); if (ctx) ctx.suspend(); }
      else if (unlocked) { if (ctx) ctx.resume(); if (currentTrack && musicVol() > 0) p.play().catch(() => {}); }
    });
  }

  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { unlocked = true; return null; }
      ctx = new AC();
      sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol(); sfxGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
    return ctx;
  }

  /* ---------------- Efeitos sintetizados ---------------- */
  function tone(o) {
    const c = ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || o.dur));
    const vol = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.filter.freq;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(sfxGain);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  function meow() {
    const c = ctx, t = c.currentTime, d = 0.5;
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.linearRampToValueAtTime(820, t + 0.14);
    osc.frequency.exponentialRampToValueAtTime(440, t + d);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 4;
    f1.frequency.setValueAtTime(900, t);
    f1.frequency.linearRampToValueAtTime(2000, t + 0.16);
    f1.frequency.linearRampToValueAtTime(1100, t + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(f1); f1.connect(g); g.connect(sfxGain);
    osc.start(t); osc.stop(t + d + 0.05);
  }

  const notes = (seq, step, o) => seq.forEach((f, i) => tone(Object.assign({ freq: f, dur: step * 1.6, delay: i * step }, o)));

  const SYNTH = {
    select: () => tone({ type: 'triangle', freq: 880, dur: 0.06, vol: 0.12 }),
    click: () => tone({ type: 'square', freq: 1250, dur: 0.035, vol: 0.05, filter: { freq: 3000 } }),
    correct: () => notes([660, 990], 0.07, { type: 'triangle', vol: 0.2 }),
    error: () => { tone({ type: 'sawtooth', freq: 220, to: 120, dur: 0.28, vol: 0.18, filter: { freq: 900 } }); tone({ type: 'square', freq: 110, dur: 0.22, vol: 0.08, delay: 0.04, filter: { freq: 600 } }); },
    hint: () => notes([1046, 1318, 1568, 2093], 0.06, { type: 'sine', vol: 0.15 }),
    meow,
    reveal: () => notes([784, 1046, 1318], 0.07, { type: 'sine', vol: 0.12 }),
    unlock: () => notes([523, 659, 784, 1046, 1318], 0.08, { type: 'triangle', vol: 0.18 }),
    victory: () => notes([523, 659, 784, 1046], 0.12, { type: 'triangle', vol: 0.22 }),
    defeat: () => notes([523, 466, 415, 349], 0.2, { type: 'triangle', vol: 0.18, filter: { freq: 1800 } }),
    // encaixe de uma casa: "toc" curto e macio, que sobe de tom pela escala pentatônica
    snap: (o) => {
      const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
      const k = o && o.of > 1 ? Math.round((o.step / (o.of - 1)) * (scale.length - 1)) : 4;
      const f = scale[k];
      tone({ type: 'sine', freq: f * 1.5, to: f, glide: 0.03, dur: 0.12, vol: 0.05, attack: 0.002 });
      tone({ type: 'triangle', freq: f / 2, dur: 0.07, vol: 0.022, attack: 0.002, filter: { freq: 1200 } });
    },
    // tabuleiro pronto: duas notas suaves + um brilho bem baixo
    fit: () => {
      notes([783.99, 1174.66], 0.09, { type: 'sine', vol: 0.06 });
      tone({ type: 'sine', freq: 1567.98, dur: 0.6, vol: 0.022, delay: 0.18, attack: 0.02 });
    },
  };

  function play(id, opts) {
    if (!unlocked || !ctx || sfxVol() <= 0) return;
    try { if (SYNTH[id]) SYNTH[id](opts); } catch (e) { /* áudio nunca deve quebrar o jogo */ }
  }

  /* ---------------- Cache das músicas ---------------- */
  const canCache = () => typeof caches !== 'undefined' && /^https?:/.test(location.protocol);

  /** Fonte reproduzível de uma faixa: blob do Cache Storage, ou a própria URL. */
  async function sourceFor(id) {
    if (blobUrls.has(id)) return blobUrls.get(id);
    const url = trackUrl(id);
    if (!canCache()) return url;
    try {
      const cache = await caches.open(AUDIO_CACHE);
      let res = await cache.match(url);
      if (!res) {
        res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await cache.put(url, res.clone());
      }
      const obj = URL.createObjectURL(await res.blob());
      blobUrls.set(id, obj);
      if (blobUrls.size > 4) {
        const [oldId, oldUrl] = blobUrls.entries().next().value;
        if (oldId !== currentTrack) { URL.revokeObjectURL(oldUrl); blobUrls.delete(oldId); }
      }
      return obj;
    } catch (e) {
      console.warn('[CPD] Música sem cache, tocando direto:', id, e.message);
      return url;
    }
  }

  /** Quantas faixas já estão guardadas no navegador. */
  async function cachedCount() {
    if (!canCache()) return 0;
    try { return (await (await caches.open(AUDIO_CACHE)).keys()).length; } catch (e) { return 0; }
  }

  /* ---------------- Reprodução com crossfade ---------------- */
  /** Interrompe o fade em andamento de um player (e libera quem esperava por ele). */
  function cancelFade(p) {
    clearInterval(p._fade);
    if (p._fadeDone) { const done = p._fadeDone; p._fadeDone = null; done(); }
  }

  /** Muda o volume aos poucos, em curva suave (começa e termina devagar). */
  function fade(p, to, ms) {
    cancelFade(p);
    const from = p.volume;
    const start = performance.now();
    return new Promise((resolve) => {
      p._fadeDone = resolve;
      p._fade = setInterval(() => {
        const k = Math.min(1, (performance.now() - start) / ms);
        const eased = 0.5 - Math.cos(Math.PI * k) / 2;
        p.volume = Math.max(0, Math.min(1, from + (to - from) * eased));
        if (k >= 1) { clearInterval(p._fade); p._fadeDone = null; resolve(); }
      }, 40);
    });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Nos segundos finais da faixa, o volume desce sozinho (a próxima entra depois). */
  function fadeNearEnd(p) {
    if (p !== players[active] || p.loop || p._endFading || p.paused) return;
    const left = p.duration - p.currentTime;
    if (!isFinite(left) || left > END_FADE_S) return;
    p._endFading = true;
    fade(p, 0, Math.max(300, left * 1000 - 150));
  }

  async function playTrack(id, opts) {
    const o = opts || {};
    const t = TRACKS.find((x) => x.id === id);
    if (!t) return;
    ensureContext();
    pendingStart = false;
    const my = ++token;
    currentTrack = id;
    currentKey = o.key || 'preview:' + id;
    CPD.emit('music', { track: id, playing: true });
    if (musicVol() <= 0) { stopMusic(true); currentTrack = id; return; }
    const loading = sourceFor(id); // baixa a próxima enquanto a atual sai
    const out = players[active];
    const next = players[1 - active];
    // 1) a faixa atual sai devagar; 2) pausa curta; 3) a nova entra devagar
    if (!out.paused && out.volume > 0.01) {
      // se a saída já estava pela metade, termina no tempo proporcional
      const share = Math.min(1, out.volume / Math.max(musicVol(), 0.01));
      await fade(out, 0, Math.max(600, FADE_OUT_MS * share));
      if (my !== token) return; // outra troca começou durante a saída
      out.pause();
      await wait(GAP_MS);
    } else {
      const endedNaturally = out.ended;
      out.pause();
      if (endedNaturally) { await wait(GAP_MS); if (my !== token) return; }
    }
    const src = await loading;
    if (my !== token) return;
    cancelFade(next);
    next.src = src;
    next.loop = !o.once && (!!S().get('loop') || !!o.loopOne);
    next._once = !!o.once;
    next._endFading = false;
    next.volume = 0;
    try { await next.play(); } catch (e) { pendingStart = true; return; }
    if (my !== token) { next.pause(); return; }
    active = 1 - active;
    fade(next, musicVol(), FADE_IN_MS);
  }

  function onEnded(p) {
    if (p !== players[active] || p._once) return;
    // faixa da trilha (ou ouvida na tela Músicas) terminou: segue para a próxima
    if (currentKey === 'main' || isPreview()) playTrack(nextTrack(), { key: 'main' });
  }

  const isPreview = () => !!currentKey && currentKey.indexOf('preview:') === 0;

  function stopMusic(silent) {
    const my = ++token;
    // só pausa se nenhuma outra música começou durante a saída
    players.forEach((p) => fade(p, 0, STOP_MS).then(() => { if (my === token) p.pause(); }));
    currentTrack = null;
    currentKey = null;
    if (!silent) CPD.emit('music', { playing: false });
  }

  /** Próxima faixa da trilha: fila embaralhada; nenhuma repete antes de todas tocarem. */
  let queue = [];
  function nextTrack() {
    if (!queue.length) {
      queue = PLAYLISTS.main.tracks.slice();
      for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
      if (queue.length > 1 && queue[0] === currentTrack) queue.push(queue.shift());
    }
    return queue.shift();
  }

  /** Avisa a tela atual ('menu', 'game:intro', 'victory'…). Só inicia a trilha; não troca a música. */
  function setContext(context) {
    currentContext = context;
    if (!unlocked) { pendingStart = true; return; }
    if (S().get('trackMode') === 'manual') {
      const saved = S().get('manualTrack');
      // faixa salva pode ser de uma trilha antiga: cai na primeira do menu
      const id = TRACKS.some((t) => t.id === saved) ? saved : TRACKS[0].id;
      if (currentTrack === id && (currentKey === 'manual' || isPreview())) { currentKey = 'manual'; players[active].loop = true; return; }
      playTrack(id, { key: 'manual', loopOne: true });
      return;
    }
    // trilha contínua: se já há música tocando, ela continua
    if (currentTrack && (currentKey === 'main' || isPreview())) { currentKey = 'main'; return; }
    playTrack(nextTrack(), { key: 'main' });
  }

  CPD.on('settings', ({ key }) => {
    if (key === 'musicVolume' || key === 'muteMusic') {
      const p = players[active];
      cancelFade(p);
      p.volume = musicVol();
      if (musicVol() <= 0) players.forEach((x) => x.pause());
      else if (unlocked && currentTrack && p.paused) p.play().catch(() => {});
      else if (unlocked && !currentTrack) setContext(currentContext, true);
    }
    if (key === 'sfxVolume' || key === 'muteSfx') { if (sfxGain) sfxGain.gain.value = sfxVol(); }
    if (key === 'loop') { const p = players[active]; p.loop = !!S().get('loop') && !p._once; if (p.loop && p._endFading) { p._endFading = false; fade(p, musicVol(), 800); } }
    if (key === 'trackMode' || key === 'manualTrack') setContext(currentContext, true);
  });

  CPD.audio = {
    TRACKS, PLAYLISTS, SFX, MUSIC_DIR, AUDIO_CACHE,
    init, play, setContext, playTrack, stopMusic, trackUrl, cachedCount,
    current: () => currentTrack, currentKey: () => currentKey, isUnlocked: () => unlocked,
    _players: players,
  };
})(window.CPD = window.CPD || {});

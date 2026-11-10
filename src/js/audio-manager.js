/* CarolPawsDoku — Audio Manager (independente da lógica do Sudoku).
 * Músicas: arquivos MP3 do projeto em src/assets/audio/music/, organizados em
 *   listas por contexto. Troca com crossfade entre dois players — só uma faixa
 *   audível por vez. Cada faixa é guardada no Cache Storage na primeira vez que
 *   toca e, depois, lida do cache como blob (evita downloads repetidos e o
 *   problema de "range requests" de mídia em Service Workers).
 * Efeitos: sintetizados com Web Audio (seleção, acerto, erro, dica, miado…).
 * O áudio só começa após a primeira interação do usuário (política de autoplay).
 */
(function (CPD) {
  'use strict';

  const MUSIC_DIR = 'src/assets/audio/music/';
  const AUDIO_CACHE = 'cpd-audio-v1'; // mude o sufixo se substituir arquivos com o mesmo nome
  const FADE_MS = 1200;

  const TRACKS = [
    { id: 'manha-de-sol', name: 'Manhã de Sol' },
    { id: 'aroma-de-cafe', name: 'Aroma de Café' },
    { id: 'balanco-do-cafezinho', name: 'Balanço do Cafezinho' },
    { id: 'encontro-no-quintal', name: 'Encontro no Quintal' },
    { id: 'carrossel-colorido', name: 'Carrossel Colorido' },
    { id: 'roda-de-amigos', name: 'Roda de Amigos' },
    { id: 'tarde-de-domingo', name: 'Tarde de Domingo' },
    { id: 'tardes-de-sol', name: 'Tardes de Sol' },
    { id: 'afternoon-sun-and-shadows', name: 'Afternoon Sun & Shadows' },
    { id: 'seaside-breeze-bossa', name: 'Seaside Breeze Bossa' },
    { id: 'caminho-interno', name: 'Caminho Interno' },
    { id: 'reflexos-de-luz', name: 'Reflexos de Luz' },
    { id: 'misterio-do-sol', name: 'Mistério do Sol' },
    { id: 'misterio-do-sol-2', name: 'Mistério do Sol II' },
    { id: 'caminho-aberto', name: 'Caminho Aberto' },
    { id: 'tropicalia-dreams', name: 'Tropicália Dreams' },
    { id: 'batida-de-verao', name: 'Batida de Verão' },
    { id: 'roda-de-sol', name: 'Roda de Sol' },
    { id: 'horizontes-calmos', name: 'Horizontes Calmos' },
    { id: 'domingo-tranquilo', name: 'Domingo Tranquilo' },
  ];

  /* Listas por contexto. Edite aqui para trocar a música de cada momento. */
  const PLAYLISTS = {
    menu: { label: 'Tela inicial e menus', tracks: ['manha-de-sol', 'aroma-de-cafe', 'balanco-do-cafezinho'] },
    intro: { label: 'Partida · níveis 1–5', tracks: ['encontro-no-quintal', 'carrossel-colorido', 'roda-de-amigos'] },
    mid: { label: 'Partida · níveis 6–12', tracks: ['tarde-de-domingo', 'tardes-de-sol', 'afternoon-sun-and-shadows', 'seaside-breeze-bossa'] },
    adv: { label: 'Partida · níveis 13–20', tracks: ['caminho-interno', 'reflexos-de-luz', 'misterio-do-sol', 'misterio-do-sol-2'] },
    special: { label: 'Partida · níveis 21+', tracks: ['caminho-aberto', 'tropicalia-dreams', 'batida-de-verao'] },
    victory: { label: 'Vitória', tracks: ['roda-de-sol'], once: true },
    finale: { label: 'Conclusão da campanha', tracks: ['horizontes-calmos'], once: true },
    defeat: { label: 'Derrota', tracks: ['domingo-tranquilo'], once: true },
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
    { id: 'defeat', name: 'Derrota' },
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
  players.forEach((p) => { p.preload = 'auto'; p.addEventListener('ended', () => onEnded(p)); });
  let active = 0; // índice do player audível
  const blobUrls = new Map(); // id → objectURL (limitado a 4 para economizar memória)
  const lastPlayed = {};

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
  function fade(p, to, ms) {
    clearInterval(p._fade);
    const from = p.volume;
    const start = performance.now();
    return new Promise((resolve) => {
      p._fade = setInterval(() => {
        const k = Math.min(1, (performance.now() - start) / ms);
        p.volume = Math.max(0, Math.min(1, from + (to - from) * k));
        if (k >= 1) { clearInterval(p._fade); resolve(); }
      }, 40);
    });
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
    const src = await sourceFor(id);
    if (my !== token) return; // outra troca aconteceu enquanto carregava
    const out = players[active];
    const next = players[1 - active];
    next.src = src;
    next.loop = !o.once && (!!S().get('loop') || !!o.loopOne);
    next._once = !!o.once;
    next.volume = 0;
    try { await next.play(); } catch (e) { pendingStart = true; return; }
    if (my !== token) { next.pause(); return; }
    active = 1 - active;
    fade(next, musicVol(), FADE_MS);
    fade(out, 0, FADE_MS).then(() => { if (players[active] !== out) out.pause(); });
  }

  function onEnded(p) {
    if (p !== players[active] || p._once) return;
    const key = currentKey && PLAYLISTS[currentKey] ? currentKey : null;
    if (key) playTrack(pickFrom(key), { key });
  }

  function stopMusic(silent) {
    token++;
    players.forEach((p) => fade(p, 0, 500).then(() => p.pause()));
    currentTrack = null;
    currentKey = null;
    if (!silent) CPD.emit('music', { playing: false });
  }

  function pickFrom(key) {
    const list = PLAYLISTS[key].tracks;
    if (list.length === 1) return list[0];
    let id;
    do { id = list[Math.floor(Math.random() * list.length)]; } while (id === lastPlayed[key]);
    lastPlayed[key] = id;
    return id;
  }

  function keyFor(context) {
    if (context === 'victory' || context === 'finale' || context === 'defeat' || context === 'menu') return context;
    if (context && context.indexOf('game:') === 0) {
      const g = context.slice(5);
      return g === 'expansion' ? 'special' : (PLAYLISTS[g] ? g : 'mid');
    }
    return 'menu';
  }

  /** Define o contexto musical ('menu', 'game:intro', 'victory', 'finale', 'defeat'). */
  function setContext(context, force) {
    currentContext = context;
    if (!unlocked) { pendingStart = true; return; }
    if (S().get('trackMode') === 'manual') {
      const id = S().get('manualTrack');
      if (!force && currentTrack === id && currentKey === 'manual') return;
      playTrack(id, { key: 'manual', loopOne: true });
      return;
    }
    const key = keyFor(context);
    if (!force && key === currentKey && currentTrack) return;
    playTrack(pickFrom(key), { key, once: !!PLAYLISTS[key].once });
  }

  CPD.on('settings', ({ key }) => {
    if (key === 'musicVolume' || key === 'muteMusic') {
      const p = players[active];
      clearInterval(p._fade);
      p.volume = musicVol();
      if (musicVol() <= 0) players.forEach((x) => x.pause());
      else if (unlocked && currentTrack && p.paused) p.play().catch(() => {});
      else if (unlocked && !currentTrack) setContext(currentContext, true);
    }
    if (key === 'sfxVolume' || key === 'muteSfx') { if (sfxGain) sfxGain.gain.value = sfxVol(); }
    if (key === 'loop') players[active].loop = !!S().get('loop') && !players[active]._once;
    if (key === 'trackMode' || key === 'manualTrack') setContext(currentContext, true);
  });

  CPD.audio = {
    TRACKS, PLAYLISTS, SFX, MUSIC_DIR, AUDIO_CACHE,
    init, play, setContext, playTrack, stopMusic, trackUrl, cachedCount,
    current: () => currentTrack, currentKey: () => currentKey, isUnlocked: () => unlocked,
    _players: players,
  };
})(window.CPD = window.CPD || {});

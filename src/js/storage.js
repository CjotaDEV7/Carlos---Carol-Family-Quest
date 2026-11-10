/* CarolPawsDoku — armazenamento local.
 * LocalStorage guarda apenas dados pequenos: configurações, progresso e partida em andamento.
 * Imagens e músicas NÃO ficam aqui: elas são arquivos do projeto, guardados pelo
 * navegador no Cache Storage (ver sw.js e audio-manager.js).
 */
(function (CPD) {
  'use strict';

  const PREFIX = 'cpd.';

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  const local = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? clone(fallback) : JSON.parse(raw);
      } catch (e) {
        return clone(fallback);
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('[CPD] Falha ao salvar no LocalStorage', e);
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    },
  };

  /* ---------- Limpeza única dos dados da versão 1 ----------
   * A v2 não tem perfis nem personalização e começa o progresso do zero.
   * Remove perfis, partidas salvas por perfil, nomes personalizados e o banco
   * IndexedDB de imagens/músicas importadas, que não são mais usados.
   */
  const MIGRATION = 'migrated.v2';
  if (!local.get(MIGRATION, false)) {
    ['profiles', 'save.cjota', 'save.carol', 'characters', 'settings'].forEach((k) => local.remove(k));
    try { if (window.indexedDB) indexedDB.deleteDatabase('CarolPawsDoku'); } catch (e) { /* ignore */ }
    local.set(MIGRATION, true);
  }
  /* v3: o jogo virou o quebra-cabeça de regiões; as fases da v2 eram outros tabuleiros.
   * Remove o progresso/partida da v2 para não liberar fases indevidamente. */
  if (!local.get('migrated.v3', false)) {
    ['progress.v2', 'save.v2'].forEach((k) => local.remove(k));
    local.set('migrated.v3', true);
  }

  /* ---------------- Barramento de eventos ---------------- */
  const bus = new EventTarget();
  CPD.on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));
  CPD.emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

  /* ---------------- Configurações ---------------- */
  const SETTINGS_DEFAULTS = {
    musicVolume: 0.5,
    sfxVolume: 0.8,
    muteMusic: false,
    muteSfx: false,
    animations: true,
    reduceMotion: 'system', // system | on | off
    trackMode: 'auto', // auto | manual
    manualTrack: 'manha-de-sol',
    loop: false, // true: repete a faixa atual em vez de seguir a lista
  };

  let settingsCache = Object.assign({}, SETTINGS_DEFAULTS, local.get('settings', {}));

  const settings = {
    defaults: SETTINGS_DEFAULTS,
    get(key) { return settingsCache[key]; },
    all() { return Object.assign({}, settingsCache); },
    set(key, value) {
      if (settingsCache[key] === value) return;
      settingsCache[key] = value;
      local.set('settings', settingsCache);
      CPD.emit('settings', { key, value });
    },
  };

  CPD.storage = { local };
  CPD.settings = settings;
})(window.CPD = window.CPD || {});

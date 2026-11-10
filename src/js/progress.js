/* CarolPawsDoku — progresso único do jogo (sem perfis), salvo no navegador. */
(function (CPD) {
  'use strict';

  const KEY = 'progress.v3';
  const SAVE_KEY = 'save.v3';
  const HISTORY_MAX = 50;

  function blank() {
    return {
      unlocked: 1, levels: {}, wins: 0, losses: 0, games: 0,
      hintsUsed: 0, errors: 0, totalWinTime: 0, bestScore: 0, history: [],
      found: {}, // id do personagem → quantas vezes foi revelado
    };
  }

  let data = Object.assign(blank(), CPD.storage.local.get(KEY, {}));

  function save() { CPD.storage.local.set(KEY, data); CPD.emit('progress', {}); }
  function get() { return data; }

  function totalScore() {
    return Object.values(data.levels).reduce((s, l) => s + (l.best || 0), 0);
  }

  function stats() {
    return {
      totalScore: totalScore(),
      wins: data.wins, losses: data.losses, games: data.games,
      bestScore: data.bestScore,
      avgTime: data.wins ? Math.round(data.totalWinTime / data.wins) : 0,
      hintsUsed: data.hintsUsed, errors: data.errors,
      unlocked: data.unlocked,
      completed: Object.values(data.levels).filter((l) => l.wins > 0).length,
      stars: Object.values(data.levels).reduce((s, l) => s + (l.stars || 0), 0),
      foundCount: Object.keys(data.found).length,
    };
  }

  function levelInfo(levelId) { return data.levels[levelId] || null; }
  function isUnlocked(levelId) { return levelId <= data.unlocked; }

  /** Registra personagens revelados (coleção da tela Personagens). */
  function markFound(ids) {
    ids.forEach((id) => { data.found[id] = (data.found[id] || 0) + 1; });
    save();
  }
  function hasFound(id) { return !!data.found[id]; }

  /**
   * Registra uma partida finalizada.
   * outcome: { won, score, timeSec, errors, hints, reason, stars }
   * Pontuação acumulada = soma do MELHOR resultado de cada fase (anti-repetição).
   */
  function record(level, outcome) {
    const L = data.levels[level.id] || (data.levels[level.id] = { best: 0, bestTime: null, stars: 0, wins: 0, plays: 0 });
    const prevBest = L.best;
    const prevTotal = totalScore();
    let unlocked = null;
    L.plays++;
    data.games++;
    data.hintsUsed += outcome.hints;
    data.errors += outcome.errors;
    if (outcome.won) {
      L.wins++;
      data.wins++;
      data.totalWinTime += outcome.timeSec;
      L.best = Math.max(L.best, outcome.score);
      L.bestTime = L.bestTime == null ? outcome.timeSec : Math.min(L.bestTime, outcome.timeSec);
      L.stars = Math.max(L.stars, outcome.stars || 1);
      data.bestScore = Math.max(data.bestScore, outcome.score);
      const nxt = CPD.levels.next(level.id);
      if (nxt && data.unlocked < nxt.id) { data.unlocked = nxt.id; unlocked = nxt.id; }
    } else {
      data.losses++;
    }
    data.history.unshift({
      date: Date.now(), level: level.id, won: !!outcome.won, score: outcome.score,
      time: outcome.timeSec, errors: outcome.errors, hints: outcome.hints, reason: outcome.reason || null,
    });
    if (data.history.length > HISTORY_MAX) data.history.length = HISTORY_MAX;
    save();
    return { newBest: outcome.won && outcome.score > prevBest, prevBest, unlocked, totalGain: totalScore() - prevTotal };
  }

  function reset() { data = blank(); save(); CPD.storage.local.remove(SAVE_KEY); }

  /* Partida em andamento (continuar depois de recarregar). */
  function saveGame(state) { CPD.storage.local.set(SAVE_KEY, state); }
  function loadGame() { return CPD.storage.local.get(SAVE_KEY, null); }
  function clearGame() { CPD.storage.local.remove(SAVE_KEY); }

  CPD.progress = {
    get, stats, totalScore, levelInfo, isUnlocked, markFound, hasFound,
    record, reset, saveGame, loadGame, clearGame,
  };
})(window.CPD = window.CPD || {});

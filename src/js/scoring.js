/* CarolPawsDoku — pontuação.
 * +100 por figura correta colocada pelo jogador (dicas não pontuam)
 * +500 ao concluir · +300 sem erros · +300 sem dicas
 * Bônus de velocidade: até +200, proporcional à dificuldade da fase.
 * Anti-repetição: o total acumulado do perfil soma apenas o MELHOR resultado
 * de cada fase (ver progress.js) — repetir uma fase só soma se superar o recorde.
 */
(function (CPD) {
  'use strict';

  const POINTS = { placement: 100, completion: 500, noErrors: 300, noHints: 300, speedMax: 200 };

  /** Bônus máximo de velocidade conforme a dificuldade (1..10) → 56..200. */
  function speedCap(level) {
    return Math.round(40 + 16 * Math.max(1, Math.min(10, level.difficulty)));
  }

  /** Bônus integral até o tempo de referência; cai linearmente até zero em 3× esse tempo. */
  function speedBonus(level, timeSec) {
    const cap = speedCap(level);
    const par = level.par;
    if (timeSec <= par) return cap;
    const frac = 1 - (timeSec - par) / (2 * par);
    return Math.max(0, Math.round(cap * frac));
  }

  function breakdown(level, stats) {
    const out = {
      placements: stats.placements * POINTS.placement,
      completion: 0, noErrors: 0, noHints: 0, speed: 0,
    };
    if (stats.won) {
      out.completion = POINTS.completion;
      out.noErrors = stats.errors === 0 ? POINTS.noErrors : 0;
      out.noHints = stats.hints === 0 ? POINTS.noHints : 0;
      out.speed = speedBonus(level, stats.timeSec);
    }
    out.total = out.placements + out.completion + out.noErrors + out.noHints + out.speed;
    return out;
  }

  /** 1 a 3 estrelas: vencer · sem erros · sem dicas. */
  function stars(stats) {
    if (!stats.won) return 0;
    return 1 + (stats.errors === 0 ? 1 : 0) + (stats.hints === 0 ? 1 : 0);
  }

  CPD.scoring = { POINTS, speedCap, speedBonus, breakdown, stars };
})(window.CPD = window.CPD || {});

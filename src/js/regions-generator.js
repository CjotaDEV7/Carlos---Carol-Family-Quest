/* CarolPawsDoku — gerador do quebra-cabeça de regiões.
 *
 * Regras: tabuleiro N×N com N regiões coloridas. Cada linha, cada coluna e cada
 * região tem exatamente UM personagem, e dois personagens nunca se tocam
 * (nem na diagonal).
 *
 * Algoritmos separados:
 *  - randomPlacement(): posições da solução (1 por linha/coluna, sem toques)
 *  - growRegions():     regiões contíguas crescidas a partir de cada posição
 *  - countSolutions():  busca exaustiva (garante solução única)
 *  - logicalSolve():    resolvedor humano por técnicas (mede dificuldade, sem chute)
 *  - generatePuzzle():  orquestra tudo conforme o nível
 * Representação: reg[i] = região da célula i (i = linha*N + coluna); sol[r] = coluna da linha r.
 */
(function (CPD) {
  'use strict';

  /* ---------- RNG determinístico (mulberry32) ---------- */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------- Geometria ---------- */
  const geoCache = {};
  function geometry(n) {
    if (geoCache[n]) return geoCache[n];
    const cells = n * n;
    const neighbors8 = [], neighbors4 = [];
    for (let i = 0; i < cells; i++) {
      const r = Math.floor(i / n), c = i % n;
      const n8 = [], n4 = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          n8.push(rr * n + cc);
          if (!dr || !dc) n4.push(rr * n + cc);
        }
      }
      neighbors8.push(n8); neighbors4.push(n4);
    }
    geoCache[n] = { n, cells, neighbors8, neighbors4 };
    return geoCache[n];
  }

  /* ---------- 1. Posições da solução ---------- */
  function randomPlacement(n, rng) {
    const cols = new Array(n);
    const used = new Array(n).fill(false);
    (function bt(r) {
      if (r === n) return true;
      for (const c of shuffle(Array.from({ length: n }, (_, k) => k), rng)) {
        if (used[c] || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
        used[c] = true; cols[r] = c;
        if (bt(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return cols;
  }

  /* ---------- 2. Regiões contíguas ---------- */
  function growRegions(n, cols, rng) {
    const g = geometry(n);
    const reg = new Int8Array(g.cells).fill(-1);
    // pesos diferentes por região → regiões de tamanhos variados (pequenas são boas pistas)
    const weight = Array.from({ length: n }, () => 0.25 + rng() * 1.75);
    for (let r = 0; r < n; r++) reg[r * n + cols[r]] = r;
    let remaining = g.cells - n;
    while (remaining > 0) {
      const frontier = Array.from({ length: n }, () => []);
      for (let i = 0; i < g.cells; i++) {
        if (reg[i] >= 0) continue;
        for (const j of g.neighbors4[i]) if (reg[j] >= 0) frontier[reg[j]].push(i);
      }
      let total = 0;
      for (let k = 0; k < n; k++) if (frontier[k].length) total += weight[k];
      let pick = rng() * total, k = 0;
      for (; k < n; k++) {
        if (!frontier[k].length) continue;
        pick -= weight[k];
        if (pick <= 0) break;
      }
      if (k >= n) k = frontier.findIndex((f) => f.length);
      const cell = frontier[k][Math.floor(rng() * frontier[k].length)];
      reg[cell] = k;
      remaining--;
    }
    return reg;
  }

  /* ---------- 3. Contagem de soluções ---------- */
  function countSolutions(n, reg, limit) {
    const lim = limit || 2;
    let count = 0;
    (function bt(r, colMask, regMask, prev) {
      if (count >= lim) return;
      if (r === n) { count++; return; }
      for (let c = 0; c < n; c++) {
        if (colMask & (1 << c)) continue;
        if (prev >= 0 && Math.abs(prev - c) <= 1) continue;
        const k = reg[r * n + c];
        if (regMask & (1 << k)) continue;
        bt(r + 1, colMask | (1 << c), regMask | (1 << k), c);
      }
    })(0, 0, 0, -1);
    return count;
  }

  /** A região k continua conectada se a célula `without` sair dela? */
  function staysConnected(n, reg, k, without) {
    const g = geometry(n);
    const cells = [];
    for (let i = 0; i < g.cells; i++) if (reg[i] === k && i !== without) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop();
      for (const j of g.neighbors4[i]) {
        if (j !== without && reg[j] === k && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    return seen.size === cells.length;
  }

  /**
   * Reparo: move células de borda entre regiões vizinhas enquanto o número de soluções
   * não aumenta, até sobrar uma só. As células da solução nunca mudam de região,
   * então a solução original continua válida o tempo todo.
   */
  function repairUnique(n, reg, solution, rng, deadline) {
    const g = geometry(n);
    const fixed = new Set(solution);
    const CAP = 40;
    let count = countSolutions(n, reg, CAP);
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    for (let it = 0; it < 1500 && count > 1; it++) {
      if (deadline && now() > deadline) break;
      const i = Math.floor(rng() * g.cells);
      if (fixed.has(i)) continue;
      const others = g.neighbors4[i].filter((j) => reg[j] !== reg[i]);
      if (!others.length) continue;
      const k = reg[others[Math.floor(rng() * others.length)]];
      const from = reg[i];
      if (!staysConnected(n, reg, from, i)) continue;
      reg[i] = k;
      const c = countSolutions(n, reg, CAP);
      if (c <= count || rng() < 0.03) count = c; // aceita melhora/empate (e raramente piora, para não travar)
      else reg[i] = from;
    }
    return count === 1;
  }

  /** Célula i elimina j? (mesma linha, coluna, região ou vizinha) */
  function attacks(n, reg, i, j) {
    if (i === j) return false;
    const ri = Math.floor(i / n), ci = i % n, rj = Math.floor(j / n), cj = j % n;
    return ri === rj || ci === cj || reg[i] === reg[j] || (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1);
  }

  /* ---------- 4. Resolvedor lógico ----------
   * Nível 1: unidade (linha/coluna/região) com uma única célula possível.
   * Nível 2: candidatos de uma unidade confinados a outra (ex.: região toda numa linha).
   * Nível 3: célula que eliminaria todas as opções de outra unidade; e grupos de k regiões
   *          confinadas a k linhas/colunas.
   */
  function logicalSolve(n, reg, givens, maxTier) {
    const g = geometry(n);
    const cap = maxTier || 3;
    const cand = new Uint8Array(g.cells).fill(1);
    const queen = new Uint8Array(g.cells);
    const units = [];
    for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
    for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
    for (let k = 0; k < n; k++) units.push([]);
    for (let i = 0; i < g.cells; i++) units[2 * n + reg[i]].push(i);
    const unitsOf = (i) => [Math.floor(i / n), n + (i % n), 2 * n + reg[i]];
    const done = new Uint8Array(3 * n);
    let placed = 0, tier = 0, steps = 0, contradiction = false;

    function place(i) {
      queen[i] = 1; cand[i] = 0; placed++; steps++;
      unitsOf(i).forEach((u) => { done[u] = 1; units[u].forEach((j) => { cand[j] = 0; }); });
      g.neighbors8[i].forEach((j) => { cand[j] = 0; });
    }
    (givens || []).forEach(place);
    const candsOf = (u) => units[u].filter((j) => cand[j]);

    function singles() {
      for (let u = 0; u < units.length; u++) {
        if (done[u]) continue;
        const cs = candsOf(u);
        if (!cs.length) { contradiction = true; return false; }
        if (cs.length === 1) { place(cs[0]); return true; }
      }
      return false;
    }

    function confined() {
      let changed = false;
      for (let u = 0; u < units.length; u++) {
        if (done[u]) continue;
        const cs = candsOf(u);
        if (!cs.length) continue;
        unitsOf(cs[0]).forEach((v) => {
          if (v === u || done[v]) return;
          if (!cs.every((j) => unitsOf(j).includes(v))) return;
          units[v].forEach((j) => { if (cand[j] && !cs.includes(j)) { cand[j] = 0; changed = true; } });
        });
        if (changed) return true;
      }
      return false;
    }

    function lookahead() {
      for (let i = 0; i < g.cells; i++) {
        if (!cand[i]) continue;
        const own = unitsOf(i);
        for (let u = 0; u < units.length; u++) {
          if (done[u] || own.includes(u)) continue;
          const cs = candsOf(u);
          if (cs.length && cs.every((j) => attacks(n, reg, i, j))) { cand[i] = 0; return true; }
        }
      }
      return false;
    }

    function groups() {
      // k regiões cujos candidatos cabem em exatamente k linhas (ou colunas) → limpa o resto dessas linhas
      const open = [];
      for (let k = 0; k < n; k++) if (!done[2 * n + k]) open.push(k);
      for (const axis of [0, 1]) {
        const lineOf = (j) => (axis ? j % n : Math.floor(j / n));
        const masks = open.map((k) => candsOf(2 * n + k).reduce((m, j) => m | (1 << lineOf(j)), 0));
        const total = 1 << open.length;
        for (let s = 1; s < total; s++) {
          let bits = 0, m = 0;
          for (let t = 0; t < open.length; t++) if (s & (1 << t)) { bits++; m |= masks[t]; }
          if (bits < 2 || bits >= open.length) continue;
          let lines = 0;
          for (let x = m; x; x &= x - 1) lines++;
          if (lines !== bits) continue;
          const inSet = new Set(open.filter((_, t) => s & (1 << t)));
          let changed = false;
          for (let j = 0; j < g.cells; j++) {
            if (cand[j] && (m & (1 << lineOf(j))) && !inSet.has(reg[j])) { cand[j] = 0; changed = true; }
          }
          if (changed) return true;
        }
      }
      return false;
    }

    while (placed < n && !contradiction) {
      if (singles()) { tier = Math.max(tier, 1); continue; }
      if (contradiction) break;
      if (cap >= 2 && confined()) { tier = Math.max(tier, 2); continue; }
      if (cap >= 3 && (lookahead() || groups())) { tier = Math.max(tier, 3); continue; }
      break;
    }
    const solution = [];
    for (let i = 0; i < g.cells; i++) if (queen[i]) solution.push(i);
    return { solved: placed === n && !contradiction, tier, steps, solution };
  }

  /**
   * Gera um quebra-cabeça.
   * opts: { minTier, maxTier, givens (personagens já revelados), seed, timeBudget }
   * Retorna { n, reg, solution (índices das células), givens, tier, seed }.
   */
  function generatePuzzle(n, opts) {
    const o = opts || {};
    const seed = typeof o.seed === 'number' ? o.seed : randomSeed();
    const rng = makeRng(seed);
    const maxTier = o.maxTier || 3, minTier = o.minTier || 1, nGivens = o.givens || 0;
    const budget = o.timeBudget || 2500;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t0 = now();
    let best = null;
    for (let attempt = 0; ; attempt++) {
      const cols = randomPlacement(n, rng);
      const reg = growRegions(n, cols, rng);
      const solution = cols.map((c, r) => r * n + c);
      if (!repairUnique(n, reg, solution, rng, t0 + budget * 2) || countSolutions(n, reg, 2) !== 1) {
        if (now() - t0 > budget && best) break;
        continue;
      }
      // pistas iniciais: personagens já revelados (fases introdutórias)
      const givens = shuffle(solution.slice(), rng).slice(0, nGivens).sort((a, b) => a - b);
      const rating = logicalSolve(n, reg, givens, maxTier);
      if (!rating.solved) { if (now() - t0 > budget && best) break; continue; }
      const cand = { n, reg: Array.from(reg), solution, givens, tier: rating.tier, seed };
      const penalty = Math.max(0, minTier - rating.tier);
      if (!best || penalty < best.penalty) best = Object.assign(cand, { penalty });
      if (penalty === 0 || now() - t0 > budget) break;
    }
    return best;
  }

  CPD.regions = { makeRng, randomSeed, shuffle, geometry, randomPlacement, growRegions, countSolutions, staysConnected, repairUnique, attacks, logicalSolve, generatePuzzle };
})(window.CPD = window.CPD || {});

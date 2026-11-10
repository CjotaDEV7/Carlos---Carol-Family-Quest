/* CarolPawsDoku — sessão de jogo (lógica pura, sem DOM).
 *
 * Regras: cada linha, coluna e região tem exatamente um personagem; eles nunca se tocam.
 * Revelar na casa certa (validada contra a solução) mostra o personagem da região.
 * Revelar na casa errada custa 1 vida e a casa vira ✕. 3 erros = derrota.
 * 3 dicas por partida; usar a 3ª encerra a partida. Marcas ✕ nunca custam nada.
 */
(function (CPD) {
  'use strict';

  const MAX_ERRORS = 3;
  const MAX_HINTS = 3;

  class GameSession {
    constructor(init) {
      this.levelId = init.levelId;
      this.level = CPD.levels.get(init.levelId);
      this.size = this.level.size;
      const cells = this.size * this.size;
      this.reg = init.reg.slice();
      this.solution = init.solution.slice();
      this.solSet = new Set(this.solution);
      this.givens = (init.givens || []).slice();
      this.placed = init.placed ? init.placed.slice() : new Array(cells).fill(0);
      this.givens.forEach((i) => { this.placed[i] = 1; });
      this.marks = init.marks ? init.marks.slice() : new Array(cells).fill(0);
      this.revealed = init.revealed ? init.revealed.slice() : new Array(cells).fill(0);
      this.regionCast = Array.isArray(init.regionCast) && init.regionCast.length === this.size
        ? init.regionCast.slice()
        : CPD.characters.assignCast(this.size);
      this.errors = init.errors || 0;
      this.hintsUsed = init.hintsUsed || 0;
      this.placements = init.placements || 0;
      this.status = init.status || 'playing';
      this.lossReason = init.lossReason || null;
      this.elapsedMs = init.elapsedMs || 0;
      this.seed = init.seed;
      this.history = []; // pilha de desfazer (só marcas)
      this.runningSince = null;
    }

    static create(levelId, seed) {
      const level = CPD.levels.get(levelId);
      if (!level) throw new Error('Nível inexistente: ' + levelId);
      const p = CPD.regions.generatePuzzle(level.size, {
        minTier: level.minTier, maxTier: level.maxTier, givens: level.givens, seed, timeBudget: 2500,
      });
      return new GameSession({ levelId, reg: p.reg, solution: p.solution, givens: p.givens, seed: p.seed });
    }

    static fromJSON(o) { return new GameSession(o); }

    toJSON() {
      return {
        v: 3, levelId: this.levelId, reg: this.reg, solution: this.solution, givens: this.givens,
        placed: this.placed, marks: this.marks, revealed: this.revealed, regionCast: this.regionCast,
        errors: this.errors, hintsUsed: this.hintsUsed, placements: this.placements, status: this.status,
        lossReason: this.lossReason, elapsedMs: this.elapsed(), seed: this.seed,
      };
    }

    /* ---- cronômetro ---- */
    start() { if (this.runningSince == null && this.status === 'playing') this.runningSince = Date.now(); }
    pause() { if (this.runningSince != null) { this.elapsedMs += Date.now() - this.runningSince; this.runningSince = null; } }
    elapsed() { return this.elapsedMs + (this.runningSince != null ? Date.now() - this.runningSince : 0); }
    elapsedSec() { return Math.floor(this.elapsed() / 1000); }

    /* ---- consultas ---- */
    rowOf(i) { return Math.floor(i / this.size); }
    colOf(i) { return i % this.size; }
    isPlaced(i) { return this.placed[i] === 1; }
    isGiven(i) { return this.givens.includes(i); }
    /** Personagem revelado na casa, ou null. Vem da região (estrutura de dados), nunca da cor. */
    characterAt(i) { return this.placed[i] ? this.regionCast[this.reg[i]] : null; }
    /** Casa descartada por um personagem já revelado (mesma linha/coluna/região ou encostada). */
    eliminated(i) {
      if (this.placed[i]) return false;
      for (let j = 0; j < this.placed.length; j++) {
        if (this.placed[j] && CPD.regions.attacks(this.size, this.reg, j, i)) return true;
      }
      return false;
    }
    placedCount() { return this.placed.reduce((s, v) => s + v, 0); }
    castIds() { return this.regionCast.slice(); }
    foundIds() {
      const s = new Set();
      for (let i = 0; i < this.placed.length; i++) if (this.placed[i]) s.add(this.characterAt(i));
      return Array.from(s);
    }
    /** Fração dos personagens a descobrir que já foram descobertos (0..1). */
    progress() {
      const todo = this.size - this.givens.length;
      return todo ? (this.placedCount() - this.givens.length) / todo : 1;
    }
    liveScore() { return this.placements * CPD.scoring.POINTS.placement; }
    hintsLeft() { return MAX_HINTS - this.hintsUsed; }

    /* ---- marcas ✕ (grátis, com desfazer) ---- */
    setMark(i, value, group) {
      if (this.status !== 'playing' || this.placed[i] || this.marks[i] === value) return false;
      if (!group) this.history.push([[i, this.marks[i]]]);
      else group.push([i, this.marks[i]]);
      this.marks[i] = value;
      return true;
    }
    toggleMark(i) { return this.setMark(i, this.marks[i] ? 0 : 1); }
    /** Grupo de marcas feitas num único arraste (um só passo de desfazer). */
    beginGroup() { return []; }
    endGroup(group) { if (group && group.length) this.history.push(group); }
    undo() {
      const step = this.history.pop();
      if (!step) return null;
      for (let k = step.length - 1; k >= 0; k--) {
        const [i, prev] = step[k];
        if (!this.placed[i]) this.marks[i] = prev;
      }
      return step.map((s) => s[0]);
    }

    /* ---- revelar ---- */
    place(i) {
      if (this.status !== 'playing') return { type: 'ignored' };
      if (this.placed[i]) return { type: 'locked' };
      if (!this.solSet.has(i)) {
        this.errors++;
        this.marks[i] = 1; // a casa fica descartada automaticamente
        const res = { type: 'wrong', idx: i, errors: this.errors };
        if (this.errors >= MAX_ERRORS) this._lose('errors');
        res.lost = this.status === 'lost';
        return res;
      }
      this.placed[i] = 1;
      this.marks[i] = 0;
      this.placements++;
      const res = { type: 'correct', idx: i, character: this.characterAt(i) };
      if (this.placedCount() === this.size) this._win();
      res.won = this.status === 'won';
      return res;
    }

    /** Revela a casa certa de uma região: a da casa indicada, ou a região mais apertada. */
    useHint(preferredIdx) {
      if (this.status !== 'playing' || this.hintsLeft() <= 0) return null;
      const open = this.solution.filter((i) => !this.placed[i]);
      if (!open.length) return null;
      let idx = -1;
      if (preferredIdx != null && preferredIdx >= 0) idx = open.find((i) => this.reg[i] === this.reg[preferredIdx]);
      if (idx == null || idx < 0) {
        const free = (k) => this.reg.filter((r, j) => r === k && !this.eliminated(j) && !this.marks[j]).length;
        idx = open.slice().sort((a, b) => free(this.reg[a]) - free(this.reg[b]))[0];
      }
      this.placed[idx] = 1;
      this.marks[idx] = 0;
      this.revealed[idx] = 1;
      this.hintsUsed++;
      const res = { idx, character: this.characterAt(idx), hintsUsed: this.hintsUsed };
      if (this.hintsUsed >= MAX_HINTS) this._lose('hints');
      else if (this.placedCount() === this.size) this._win();
      res.lost = this.status === 'lost';
      res.won = this.status === 'won';
      return res;
    }

    _win() { this.status = 'won'; this.pause(); }
    _lose(reason) { this.status = 'lost'; this.lossReason = reason; this.pause(); }

    result() {
      const stats = {
        won: this.status === 'won', errors: this.errors, hints: this.hintsUsed,
        placements: this.placements, timeSec: this.elapsedSec(),
      };
      const bd = CPD.scoring.breakdown(this.level, stats);
      return Object.assign(stats, { breakdown: bd, score: bd.total, stars: CPD.scoring.stars(stats), reason: this.lossReason });
    }
  }

  CPD.GameSession = GameSession;
  CPD.MAX_ERRORS = MAX_ERRORS;
  CPD.MAX_HINTS = MAX_HINTS;
})(window.CPD = window.CPD || {});

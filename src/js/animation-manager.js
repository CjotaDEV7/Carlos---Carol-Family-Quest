/* CarolPawsDoku — animações curtas e reutilizáveis (opacity + transform).
 * Efeitos CSS: fx-fade-in, fx-fade-out, fx-pop, fx-shake, fx-celebrate.
 * A revelação acontece dentro da própria célula, sem mexer no resto do tabuleiro.
 */
(function (CPD) {
  'use strict';

  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /** 'full' | 'reduced' | 'off' */
  function mode() {
    if (!CPD.settings.get('animations')) return 'off';
    const rm = CPD.settings.get('reduceMotion');
    if (rm === 'on' || (rm === 'system' && mq && mq.matches)) return 'reduced';
    return 'full';
  }

  function applyRootClasses() {
    const m = mode();
    const root = document.documentElement;
    root.classList.toggle('anim-off', m === 'off');
    root.classList.toggle('reduce-motion', m === 'reduced');
  }

  /** Aplica um efeito CSS e resolve quando terminar (nunca bloqueia a interação). */
  function play(el, name, opts) {
    return new Promise((resolve) => {
      if (!el) return resolve();
      const m = mode();
      if (m === 'off' || (m === 'reduced' && (name === 'shake' || name === 'pop' || name === 'celebrate'))) return resolve();
      const cls = 'fx-' + name;
      el.classList.remove(cls);
      void el.offsetWidth;
      if (opts && opts.delay) el.style.animationDelay = opts.delay + 'ms';
      el.classList.add(cls);
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        el.removeEventListener('animationend', onEnd);
        if (!(opts && opts.keep)) el.classList.remove(cls);
        resolve();
      };
      const onEnd = (e) => { if (e.target === el) finish(); };
      el.addEventListener('animationend', onEnd);
      setTimeout(finish, ((opts && opts.timeout) || 900) + ((opts && opts.delay) || 0));
    });
  }

  /**
   * Revelação de um personagem numa célula (elemento .char com imgs .normal e .happy):
   * 1) entra com fade + leve escala; 2) troca para a expressão de alegria;
   * 3) volta à expressão normal, que permanece visível.
   */
  function reveal(charEl) {
    return new Promise((resolve) => {
      if (!charEl) return resolve();
      const m = mode();
      clearTimeout(charEl._t1); clearTimeout(charEl._t2);
      if (m === 'off') { charEl.classList.remove('entering', 'is-happy'); return resolve(); }
      charEl.classList.add('entering');
      void charEl.offsetWidth;
      charEl.classList.remove('entering'); // a transição CSS faz o fade/escala de entrada
      const hasHappy = !!charEl.querySelector('img.happy');
      charEl._t1 = setTimeout(() => {
        if (hasHappy) charEl.classList.add('is-happy');
        charEl._t2 = setTimeout(() => {
          charEl.classList.remove('is-happy');
          resolve();
        }, m === 'full' ? 850 : 650);
      }, 260);
    });
  }

  function shake(el) { return play(el, 'shake', { timeout: 500 }); }

  CPD.on('settings', (d) => { if (d.key === 'animations' || d.key === 'reduceMotion') applyRootClasses(); });
  if (mq && mq.addEventListener) mq.addEventListener('change', applyRootClasses);

  CPD.anim = { mode, play, reveal, shake, applyRootClasses };
})(window.CPD = window.CPD || {});

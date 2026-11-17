/* CarolPawsDoku — temas de cor (claro "Porcelana" e cinco escuros da mesma paleta).
 *
 * O tema fica em CPD.settings('theme'). O <head> do index.html aplica o tema salvo
 * antes de desenhar a página (evita piscar claro); este módulo cuida das trocas
 * em tempo real e do modo "Automático", que segue o aparelho.
 * As cores ficam em src/css/themes.css.
 */
(function (CPD) {
  'use strict';

  const THEMES = [
    { id: 'porcelana', name: 'Porcelana', note: 'Claro', dark: false, bg: '#FBF7F2', swatch: ['#FBF7F2', '#F6CFCB', '#A9CF99'] },
    { id: 'cafe', name: 'Café', note: 'Escuro', dark: true, bg: '#1C1916', swatch: ['#1C1916', '#E6DACB', '#93C083'] },
    { id: 'lavanda', name: 'Lavanda', note: 'Escuro', dark: true, bg: '#1B1824', swatch: ['#1B1824', '#DAD1F0', '#93C083'] },
    { id: 'menta', name: 'Menta', note: 'Escuro', dark: true, bg: '#151E19', swatch: ['#151E19', '#D2E8C6', '#93C083'] },
    { id: 'ceu', name: 'Céu', note: 'Escuro', dark: true, bg: '#141C26', swatch: ['#141C26', '#C8DCF1', '#93C083'] },
    { id: 'rose', name: 'Rosé', note: 'Escuro', dark: true, bg: '#211818', swatch: ['#211818', '#F6CFCB', '#93C083'] },
  ];
  const AUTO = { id: 'auto', name: 'Automático', note: 'Segue o aparelho' };
  const LIGHT = 'porcelana';
  const DARK = 'cafe';

  const byId = new Map(THEMES.map((t) => [t.id, t]));
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  /** Tema efetivo (resolve "auto" pela preferência do aparelho). */
  function resolve(id) {
    if (id === 'auto') return byId.get(mq && mq.matches ? DARK : LIGHT);
    return byId.get(id) || byId.get(LIGHT);
  }

  function apply() {
    const t = resolve(CPD.settings.get('theme'));
    const root = document.documentElement;
    root.dataset.theme = t.id;
    root.classList.toggle('theme-dark', t.dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.bg);
  }

  CPD.on('settings', (d) => { if (d.key === 'theme') apply(); });
  if (mq) {
    const onChange = () => { if (CPD.settings.get('theme') === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  apply();

  CPD.theme = { THEMES, AUTO, LIGHT, DARK, resolve, apply };
})(window.CPD = window.CPD || {});

/* CarolPawsDoku — utilitários de interface. */
(function (CPD) {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Cria elementos: el('div', {class:'x', onclick: fn}, 'texto', filho) */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('--')) node.style.setProperty(k, v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    children.flat().forEach((c) => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  }

  function icon(name, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    if (cls) svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  /**
   * Elemento de personagem: <div class="char"><img class="normal"><img class="happy"></div>.
   * Retorna null se a imagem do personagem não existir (nada é inventado no lugar).
   */
  function charEl(id, extraClass) {
    const normal = CPD.characters.url(id, 'normal');
    if (!normal) return null;
    const ch = CPD.characters.get(id);
    const box = el('div', { class: 'char' + (extraClass ? ' ' + extraClass : ''), dataset: { char: id } });
    box.appendChild(el('img', { class: 'normal', src: normal, alt: ch ? ch.name : '', draggable: 'false', decoding: 'async' }));
    const happy = CPD.characters.url(id, 'happy');
    if (happy) box.appendChild(el('img', { class: 'happy', src: happy, alt: '', draggable: 'false', decoding: 'async' }));
    return box;
  }

  function toast(msg, type) {
    const box = $('#toasts');
    const t = el('div', { class: 'toast' + (type ? ' ' + type : '') }, msg);
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 2600);
    setTimeout(() => t.remove(), 3000);
  }

  /* ---------- Overlays ---------- */
  const openStack = [];
  function openOverlay(id) {
    const o = document.getElementById(id);
    if (!o) return;
    o.hidden = false;
    if (!openStack.includes(id)) openStack.push(id);
    const focusable = o.querySelector('.btn-primary, button');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 30);
  }
  function closeOverlay(id) {
    const o = document.getElementById(id);
    if (o) o.hidden = true;
    const i = openStack.indexOf(id);
    if (i >= 0) openStack.splice(i, 1);
  }
  function topOverlay() { return openStack[openStack.length - 1] || null; }
  function anyOverlay() { return openStack.length > 0; }

  function confirm(opts) {
    return new Promise((resolve) => {
      const o = $('#ov-confirm');
      $('#confirm-title').textContent = opts.title || 'Tem certeza?';
      $('#confirm-text').innerHTML = opts.message || '';
      const ok = $('[data-act="ok"]', o), cancel = $('[data-act="cancel"]', o);
      ok.textContent = opts.okText || 'Confirmar';
      cancel.textContent = opts.cancelText || 'Cancelar';
      ok.classList.toggle('btn-danger', !!opts.danger);
      const done = (v) => {
        ok.onclick = cancel.onclick = null;
        closeOverlay('ov-confirm');
        resolve(v);
      };
      ok.onclick = () => done(true);
      cancel.onclick = () => done(false);
      o._cancel = () => done(false);
      openOverlay('ov-confirm');
    });
  }

  function loading(show, text) {
    if (text) $('#loading-text').textContent = text;
    if (show) openOverlay('ov-loading'); else closeOverlay('ov-loading');
  }

  /* ---------- Formatação ---------- */
  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  const nf = new Intl.NumberFormat('pt-BR');
  const fmt = (n) => nf.format(Math.round(n || 0));
  function formatDate(ts) {
    try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  /** Baixa um Blob como arquivo. */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /** Controles de configuração ligados a CPD.settings (data-setting). */
  function settingRow(label, desc, control) {
    return el('label', { class: 'setting' }, el('span', null, label, desc ? el('small', null, desc) : null), control);
  }
  function toggle(key, onChange) {
    const input = el('input', { type: 'checkbox', role: 'switch' });
    input.checked = !!CPD.settings.get(key);
    input.addEventListener('change', () => { CPD.settings.set(key, input.checked); CPD.audio.play('click'); if (onChange) onChange(input.checked); });
    input.dataset.setting = key;
    return el('span', { class: 'switch' }, input, el('i'));
  }
  function range(key) {
    const input = el('input', { type: 'range', min: '0', max: '100', step: '5' });
    input.value = Math.round(CPD.settings.get(key) * 100);
    input.dataset.setting = key;
    input.addEventListener('input', () => CPD.settings.set(key, Number(input.value) / 100));
    input.addEventListener('change', () => { if (key === 'sfxVolume') CPD.audio.play('correct'); });
    input.setAttribute('aria-label', key);
    return input;
  }
  function select(key, options) {
    const s = el('select', null, options.map((o) => el('option', { value: o.value }, o.label)));
    s.value = CPD.settings.get(key);
    s.dataset.setting = key;
    s.addEventListener('change', () => { CPD.settings.set(key, s.value); CPD.audio.play('click'); });
    return s;
  }

  // Mantém controles duplicados (tela de configurações × ajustes rápidos) sincronizados.
  CPD.on('settings', ({ key, value }) => {
    $$(`[data-setting="${key}"]`).forEach((n) => {
      if (n.type === 'checkbox') n.checked = !!value;
      else if (n.type === 'range') { if (Number(n.value) !== Math.round(value * 100)) n.value = Math.round(value * 100); }
      else if (n.value !== value) n.value = value;
    });
  });

  CPD.ui = {
    $, $$, el, icon, charEl, toast, openOverlay, closeOverlay, topOverlay, anyOverlay, confirm, loading,
    formatTime, fmt, formatDate, download, settingRow, toggle, range, select,
  };
})(window.CPD = window.CPD || {});

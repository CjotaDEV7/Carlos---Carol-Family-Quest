/* CarolPawsDoku — elenco de personagens e seus arquivos.
 *
 * Cada região colorida do tabuleiro esconde um personagem. A cada partida os
 * personagens são sorteados entre as regiões (assignCast): regionCast[região] = id.
 * A cor da região é só visual; a identidade vem dessa estrutura de dados.
 *
 * Arquivos esperados (um por expressão):
 *   src/assets/characters/<id>/normal.webp
 *   src/assets/characters/<id>/happy.webp
 * Arquivo ausente → o jogo não mostra imagem nenhuma (só a confirmação do acerto).
 */
(function (CPD) {
  'use strict';

  const CAST = [
    { id: 'carol', name: 'Carol', kind: 'person' },
    { id: 'sol', name: 'Sol', kind: 'cat' },
    { id: 'mezzo', name: 'Mezzo', kind: 'cat' },
    { id: 'jade', name: 'Jade', kind: 'cat' },
    { id: 'celso', name: 'Celso R.', kind: 'person' },
    { id: 'rose', name: 'Rose', kind: 'person' },
    { id: 'cjota', name: 'Cjota', kind: 'person' },
    { id: 'mamae', name: 'Mamãe', kind: 'person' },
    { id: 'dr-sandro', name: 'Sandro', kind: 'person' },
  ];
  const EXPRESSIONS = ['normal', 'happy'];
  const BASE = 'src/assets/characters/';

  const byId = new Map(CAST.map((c) => [c.id, c]));
  const available = new Map(); // caminho → true/false (após preload)

  function path(id, expr) { return `${BASE}${id}/${expr}.webp`; }
  function get(id) { return byId.get(id) || null; }
  function list() { return CAST.slice(); }

  /** Todos os caminhos de imagem do elenco (usado pelo Service Worker e pelo preload). */
  function allPaths() {
    const out = [];
    CAST.forEach((c) => EXPRESSIONS.forEach((e) => out.push(path(c.id, e))));
    return out;
  }

  /** URL da imagem se o arquivo existir; null se estiver ausente. */
  function url(id, expr) {
    const p = path(id, expr);
    return available.get(p) ? p : null;
  }
  function hasImages(id) { return !!url(id, 'normal'); }

  /** Pré-carrega as 14 imagens e registra quais existem. Nunca rejeita. */
  function preload() {
    if (typeof Image === 'undefined') return Promise.resolve();
    return Promise.all(allPaths().map((p) => new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { available.set(p, true); resolve(); };
      img.onerror = () => { available.set(p, false); resolve(); };
      img.src = p;
    }))).then(() => CPD.emit('characters-ready', {}));
  }

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * Sorteia o elenco para um tabuleiro com `size` regiões.
   * Retorna um array de ids distintos: posição k = personagem da região k.
   * (São 9 personagens e o maior tabuleiro é 9×9: ninguém se repete.)
   */
  function assignCast(size, rng) {
    return shuffle(CAST.map((c) => c.id), rng).slice(0, Math.min(size, CAST.length));
  }

  CPD.characters = { CAST, EXPRESSIONS, path, get, list, allPaths, url, hasImages, preload, assignCast };
})(window.CPD = window.CPD || {});

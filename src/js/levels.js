/* CarolPawsDoku — campanha do quebra-cabeça de regiões (5×5 a 9×9).
 * Dificuldade = tamanho + técnica lógica exigida (minTier/maxTier) + personagens já revelados (givens).
 * Personagens já revelados no início existem só nas fases 1–3.
 *   tier 1: só uma casa possível · tier 2: região confinada a uma linha/coluna
 *   tier 3: casa que eliminaria tudo de outra região; grupos de regiões
 * difficulty (1..10) controla o bônus de velocidade; par = tempo de referência (s).
 */
(function (CPD) {
  'use strict';

  const GROUPS = {
    intro: { label: 'Introdução', range: '1–5', sizes: '5×5' },
    mid: { label: 'Intermediário', range: '6–15', sizes: '6×6 e 7×7' },
    adv: { label: 'Avançado', range: '16–20', sizes: '8×8' },
    special: { label: 'Especial', range: '21–25', sizes: '9×9' },
  };

  // [id, nome, tamanho, revelados, minTier, maxTier, dificuldade, par(s), grupo, extras]
  const RAW = [
    [1, 'Primeiro Olhar', 5, 2, 1, 1, 1, 60, 'intro', { tutorial: 'basics' }],
    [2, 'Bom Dia, Sol', 5, 1, 1, 1, 1, 70, 'intro', { tutorial: 'marks' }],
    [3, 'Soneca da Mezzo', 5, 1, 1, 2, 2, 80, 'intro', { tutorial: 'touch' }],
    [4, 'Jade Curiosa', 5, 0, 1, 2, 2, 90, 'intro', { tutorial: 'confined' }],
    [5, 'Patinhas Juntas', 5, 0, 2, 2, 3, 100, 'intro', { tutorial: 'limits' }],

    [6, 'Café da Manhã', 6, 0, 1, 2, 3, 150, 'mid'],
    [7, 'Novelo de Lã', 6, 0, 1, 2, 3, 160, 'mid'],
    [8, 'Janela Ensolarada', 6, 0, 2, 2, 4, 170, 'mid'],
    [9, 'Caixa de Papelão', 6, 0, 2, 3, 4, 180, 'mid'],
    [10, 'Ronronar', 6, 0, 3, 3, 4, 200, 'mid'],
    [11, 'Passeio no Sofá', 7, 0, 1, 2, 5, 220, 'mid'],
    [12, 'Cochilo a Três', 7, 0, 2, 2, 5, 240, 'mid'],
    [13, 'Noite de Filme', 7, 0, 2, 3, 5, 260, 'mid'],
    [14, 'Pipoca Quentinha', 7, 0, 3, 3, 6, 280, 'mid'],
    [15, 'Varanda Florida', 7, 0, 3, 3, 6, 300, 'mid'],

    [16, 'Chuva na Janela', 8, 0, 2, 3, 6, 330, 'adv'],
    [17, 'Carta de Amor', 8, 0, 2, 3, 7, 360, 'adv'],
    [18, 'Dança na Cozinha', 8, 0, 3, 3, 7, 390, 'adv'],
    [19, 'Constelação', 8, 0, 3, 3, 8, 420, 'adv'],
    [20, 'Abraço Apertado', 8, 0, 3, 3, 8, 450, 'adv'],

    [21, 'Coração Acelerado', 9, 0, 3, 3, 9, 480, 'special', { special: 'Desafio clássico no 9×9.' }],
    [22, 'Às Cegas', 9, 0, 3, 3, 9, 510, 'special', { noAutoMark: true, special: 'Sem marcação automática: você marca tudo.' }],
    [23, 'Sem Rascunho', 9, 0, 3, 3, 9, 540, 'special', { noMarks: true, special: 'Sem marcas ✕: tudo de cabeça!' }],
    [24, 'Luz Apagada', 9, 0, 3, 3, 10, 570, 'special', { noLineHighlight: true, special: 'Linha e coluna não são destacadas.' }],
    [25, 'Para Sempre', 9, 0, 3, 3, 10, 600, 'special', { finale: true, special: 'O grande final da campanha.' }],
  ];

  const LEVELS = RAW.map((r) => Object.assign({
    id: r[0], name: r[1], size: r[2], givens: r[3], minTier: r[4], maxTier: r[5],
    difficulty: r[6], par: r[7], group: r[8],
  }, r[9] || {}));

  const CAMPAIGN_LENGTH = 25;

  const TUTORIALS = {
    basics: [
      { title: 'Bem-vindos ao Family Quest!', text: 'O tabuleiro é dividido em <b>regiões coloridas</b>. Em cada região mora <b>um personagem</b> escondido.' },
      { title: 'A regra', text: 'Cada <b>linha</b>, cada <b>coluna</b> e cada <b>região</b> tem exatamente <b>um</b> personagem. E eles <b>nunca se encostam</b> — nem na diagonal.' },
      { title: 'Como revelar', text: 'Toque <b>uma vez</b> para marcar ✕ (“aqui não”). Toque <b>de novo</b> na mesma casa para revelar um personagem. Acertou: ele aparece! Errou: você perde uma das <b>3 vidas</b>.' },
      { title: 'Vamos começar?', text: 'Alguns personagens já estão revelados para ajudar. Comece por eles e pela região que tiver menos espaço.', coach: true },
    ],
    marks: [
      { title: 'Marque sem medo', text: 'As marcas ✕ são só lembretes e nunca custam vida. <b>Arraste o dedo</b> para marcar várias casas de uma vez. Para revelar uma casa com ✕, toque uma vez para apagar o ✕ e outra para revelar.' },
    ],
    touch: [
      { title: 'Ninguém se encosta', text: 'Ao revelar um personagem, as casas ao redor dele (inclusive as diagonais) ficam marcadas automaticamente: ali não cabe mais ninguém. Revelar uma casa descartada também custa uma vida!' },
    ],
    confined: [
      { title: 'Região numa linha só', text: 'Se todas as casas livres de uma região estão na <b>mesma linha</b>, o personagem dela fica nessa linha — então o resto da linha pode receber ✕.' },
    ],
    limits: [
      { title: 'Último treino', text: 'Sem personagens revelados no início. Use as marcas com calma: não há relógio contra você. Depois desta fase vem o 6×6!' },
    ],
  };

  function get(id) { return LEVELS.find((l) => l.id === id) || null; }
  function next(id) { return get(id + 1); }
  function group(key) { return GROUPS[key]; }

  CPD.levels = { LEVELS, GROUPS, TUTORIALS, CAMPAIGN_LENGTH, get, next, group };
})(window.CPD = window.CPD || {});

/* Carlos & Carol Family Quest — campanha de apoio voluntário ao desenvolvedor.
 *
 * Tudo que precisa ser configurado fica em CONFIG, logo abaixo. O jogo nunca
 * inicia um pagamento sozinho e nenhuma função depende de contribuição.
 *
 *  - PAYMENT_URL: link externo de pagamento (https://...). Vazio = botão mostra "em breve".
 *  - PIX_KEY:     chave Pix (e-mail, telefone, CPF ou aleatória). Vazio = esconde a chave.
 *  - PIX_QR:      imagem do QR Code Pix verdadeiro. Arquivo ausente = esconde o QR.
 *  - PHOTO:       fotografia do desenvolvedor. Arquivo ausente = esconde a foto.
 *  - USD_BRL:     cotação usada só para a estimativa em reais. 0 = não mostra a conversão.
 *  - POPUP_EVERY: o aviso automático volta a aparecer a cada N fases concluídas.
 */
(function (CPD) {
  'use strict';

  const CONFIG = {
    PAYMENT_URL: 'https://mpago.la/2yHjUYS',
    PIX_KEY: '',
    PIX_QR: 'src/assets/images/qrcode-pix.png',
    PHOTO: 'src/assets/images/desenvolvedor.jpg',
    GOAL_USD: 25,
    USD_BRL: 0,
    POPUP_EVERY: 3,
    DEV_NAME: 'CjotaDev7',
  };

  const { $, el, icon } = CPD.ui;
  const local = CPD.storage.local;
  const KEY = 'support.v1';

  const state = Object.assign({ hidePopup: false, wins: 0, pending: false, shownOnce: false }, local.get(KEY, {}));
  function save() { local.set(KEY, { hidePopup: state.hidePopup, wins: state.wins, pending: state.pending }); }

  const money = (v, cur) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(v);
  const hasPayment = () => /^https:\/\/\S+$/i.test(CONFIG.PAYMENT_URL);

  /* ---------- Página ---------- */
  function renderPage() {
    const body = $('#support-body');
    body.innerHTML = '';

    const banner = el('img', { class: 'support-banner', src: 'src/assets/ui/apoio-banner.webp', alt: 'Apoie o projeto: ajude uma ideia a sair do papel!', decoding: 'async' });

    const photo = el('img', { class: 'support-photo', src: CONFIG.PHOTO, alt: `Foto de ${CONFIG.DEV_NAME}`, decoding: 'async' });
    photo.addEventListener('error', () => { photo.hidden = true; });

    const story = el('div', { class: 'card support-story' },
      el('div', { class: 'support-who' }, photo, el('div', null, el('h3', null, 'Por que estou pedindo seu apoio?'), el('p', { class: 'muted' }, `${CONFIG.DEV_NAME} · desenvolvedor independente`))),
      el('p', null, 'Estou aprofundando meus estudos em programação e inteligência artificial e transformando meus conhecimentos em projetos reais, como este jogo.'),
      el('p', null, 'Meu objetivo é dar os primeiros passos como desenvolvedor independente, criando e publicando meus próprios jogos e aplicativos.'),
      el('p', null, 'Para começar, preciso realizar meu cadastro na Google Play Console, cuja taxa inicial é de US$ 25.'),
      el('p', null, 'Qualquer contribuição voluntária me ajuda a alcançar essa primeira meta e continuar investindo no desenvolvimento de novos projetos.'),
      el('p', null, el('b', null, 'Obrigado por fazer parte dessa jornada!')));

    const goal = el('div', { class: 'card support-goal' },
      el('p', { class: 'result-kicker' }, 'Minha primeira meta'),
      el('p', { class: 'support-amount' }, money(CONFIG.GOAL_USD, 'USD')),
      el('p', { class: 'support-goal-what' }, 'Cadastro de desenvolvedor na Google Play Console.'),
      CONFIG.USD_BRL > 0 ? el('p', { class: 'support-brl' }, `≈ ${money(CONFIG.GOAL_USD * CONFIG.USD_BRL, 'BRL')}`) : null,
      el('p', { class: 'support-fine' }, 'O valor final pode variar conforme o câmbio e os encargos.'));

    const payBtn = el('button', { class: 'btn btn-accent btn-xl support-pay', id: 'support-pay' }, icon('heart'), hasPayment() ? 'Quero apoiar o projeto' : 'Link de apoio em breve');
    payBtn.disabled = !hasPayment();
    payBtn.addEventListener('click', openPayment);
    const pay = el('div', { class: 'card support-pay-card' },
      payBtn,
      el('p', { class: 'hint-text center' }, 'Contribua com qualquer quantia. Todo apoio é voluntário e recebido com gratidão.'),
      el('p', { class: 'support-reward' }, icon('star'), ' Quem apoia ganha uma surpresa: sua imagem no próximo jogo!'));

    const pix = el('div', { class: 'card support-pix', id: 'support-pix' }, el('h3', null, 'Ou apoie pelo Pix'));
    const qr = el('img', { class: 'support-qr', src: CONFIG.PIX_QR, alt: 'QR Code Pix', decoding: 'async' });
    qr.addEventListener('error', () => { qr.hidden = true; updatePix(); });
    pix.appendChild(qr);
    if (CONFIG.PIX_KEY) {
      const copy = el('button', { class: 'btn btn-sm', id: 'support-copy' }, 'Copiar chave');
      copy.addEventListener('click', () => copyText(CONFIG.PIX_KEY, copy));
      pix.appendChild(el('div', { class: 'support-key' }, el('code', null, CONFIG.PIX_KEY), copy));
    }
    pix.appendChild(el('p', { class: 'hint-text center' }, 'Abra o app do seu banco, escolha Pix e aponte a câmera para o código.'));
    function updatePix() { pix.hidden = qr.hidden && !CONFIG.PIX_KEY; }
    updatePix();

    const thanks = el('p', { class: 'support-thanks' }, 'Muito obrigado por jogar e por caminhar junto comigo. ♥');
    const back = el('button', { class: 'btn btn-primary btn-xl', 'data-nav': 'menu' }, icon('home'), 'Voltar ao jogo');

    body.append(banner, story, goal, pay, pix, thanks, el('div', { class: 'dialog-actions' }, back));
  }

  /** Abre o link configurado numa aba nova; se o navegador bloquear, navega na mesma. Nunca abre sozinho. */
  function openPayment() {
    if (!hasPayment()) { CPD.ui.toast('O link de apoio ainda não foi configurado.'); return; }
    CPD.audio.play('click');
    const w = window.open(CONFIG.PAYMENT_URL, '_blank', 'noopener,noreferrer');
    if (!w) location.href = CONFIG.PAYMENT_URL;
  }

  async function copyText(text, btn) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = el('textarea', { readonly: 'readonly' }, text);
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      CPD.ui.toast('Chave Pix copiada', 'ok');
      if (btn) { btn.textContent = 'Copiada!'; setTimeout(() => { btn.textContent = 'Copiar chave'; }, 1800); }
    } catch (e) { CPD.ui.toast('Não deu para copiar. Selecione a chave e copie manualmente.'); }
  }

  /* ---------- Popup (aviso automático) ---------- */
  let afterClose = null;

  function openPopup(onClose) {
    afterClose = onClose || null;
    $('#support-popup-goal').textContent = `${money(CONFIG.GOAL_USD, 'USD')}${CONFIG.USD_BRL > 0 ? ' · ≈ ' + money(CONFIG.GOAL_USD * CONFIG.USD_BRL, 'BRL') : ''}`;
    $('#support-popup-hide').checked = false;
    CPD.ui.openOverlay('ov-support');
    state.pending = false; state.shownOnce = true; save();
  }

  function closePopup(goToPage) {
    if ($('#support-popup-hide').checked && !state.hidePopup) { state.hidePopup = true; save(); }
    CPD.ui.closeOverlay('ov-support');
    const cb = afterClose; afterClose = null;
    if (goToPage) CPD.app.navigate('support');
    else if (cb) cb();
  }

  /** Chamado quando uma fase é vencida: a cada POPUP_EVERY vitórias, agenda o aviso. */
  function noteWin() {
    state.wins++;
    if (!state.hidePopup && state.wins % CONFIG.POPUP_EVERY === 0) state.pending = true;
    save();
  }

  const pending = () => !state.hidePopup && state.pending;

  /** Mostra o aviso pendente (fora de partida); no primeiro acesso da sessão, mostra uma vez. */
  function maybePopup() {
    if (state.hidePopup || CPD.ui.anyOverlay()) return;
    if (state.pending || !state.shownOnce) openPopup();
  }

  function bind() {
    $('#ov-support').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      CPD.audio.play('click');
      closePopup(b.dataset.act === 'open');
    });
  }

  function init() { bind(); }

  CPD.support = { CONFIG, init, renderPage, openPopup, closePopup, maybePopup, noteWin, pending, openPayment };
})(window.CPD = window.CPD || {});

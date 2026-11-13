/* CarolPawsDoku — Service Worker (camada de cache; os arquivos do projeto continuam sendo a fonte oficial).
 *
 * - Código (HTML/CSS/JS): servido do cache na hora e atualizado em segundo plano.
 * - Imagens dos personagens e ícones: cache-first (baixadas uma vez).
 * - Músicas: NÃO passam por aqui — o audio-manager.js guarda cada faixa no cache
 *   'cpd-audio-v1' na primeira reprodução (evita problemas de range request).
 *
 * Para publicar arquivos novos ou alterados, aumente VERSION: o cache antigo é apagado.
 */
const VERSION = 'v3.4.0';
const SHELL_CACHE = 'cpd-shell-' + VERSION;
const AUDIO_CACHE = 'cpd-audio-v1';

const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'src/css/main.css', 'src/css/menu.css', 'src/css/board.css', 'src/css/animations.css', 'src/css/support.css', 'src/css/responsive.css',
  'src/js/storage.js', 'src/js/characters.js', 'src/js/regions-generator.js',
  'src/js/levels.js', 'src/js/scoring.js', 'src/js/progress.js', 'src/js/game.js',
  'src/js/animation-manager.js', 'src/js/audio-manager.js', 'src/js/ui.js', 'src/js/board-ui.js', 'src/js/support.js', 'src/js/app.js',
  'src/assets/icons/favicon.svg', 'src/assets/icons/icon-192.png', 'src/assets/icons/icon-512.png', 'src/assets/icons/icon-maskable-512.png', 'src/assets/icons/apple-touch-icon.png',
  'src/assets/ui/menu-hero.webp', 'src/assets/ui/apoio-banner.webp', 'src/assets/ui/apoio-teaser.webp',
];
const CHARACTERS = ['carol', 'sol', 'mezzo', 'jade', 'celso', 'rose', 'cjota', 'mamae', 'dr-sandro'];
// opcionais: podem não existir ainda (foto do desenvolvedor e QR Code Pix)
const IMAGES = ['src/assets/images/desenvolvedor.jpg', 'src/assets/images/qrcode-pix.png'];
CHARACTERS.forEach((id) => ['normal', 'happy'].forEach((e) => IMAGES.push(`src/assets/characters/${id}/${e}.webp`)));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(CORE);
    // imagens podem ainda não existir: cada uma é opcional
    await Promise.all(IMAGES.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fontes do Google etc.
  if (url.pathname.includes('/assets/audio/')) return; // músicas: audio-manager.js

  const isImage = /\/assets\/(characters|icons|ui|images)\//.test(url.pathname);
  if (isImage) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // stale-while-revalidate para o código do jogo
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { event.waitUntil(network); return hit; }
    const res = await network;
    return res || new Response('Sem conexão e sem cache para este arquivo.', { status: 503 });
  })());
});

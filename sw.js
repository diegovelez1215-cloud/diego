// United 2026 — installable static shell.
// Official/live data is never served from cache. /api routes go network-only so
// stale fixtures, scores, scorers, or provider responses cannot masquerade as
// current World Cup truth.

const STATIC_CACHE = 'u26-static-v4';
const STATIC_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.png',
  '/icon-180.png',
  '/src/app.js',
  '/src/styles/tokens.css',
  '/src/styles/shell.css',
  '/src/styles/real-world.css',
  '/src/styles/play.css',
  '/src/styles/responsive.css',
];

function isApiTruth(pathname) {
  return pathname.startsWith('/api/');
}

function isStaticAsset(pathname) {
  return pathname === '/'
    || pathname === '/index.html'
    || pathname === '/manifest.webmanifest'
    || pathname.endsWith('.js')
    || pathname.endsWith('.css')
    || pathname.endsWith('.png')
    || pathname.endsWith('.webp')
    || pathname.endsWith('.woff2');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isApiTruth(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (!isStaticAsset(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  })());
});

// United 2026 — minimal service worker.
// Exists for installability only. It NEVER caches /api/ responses and never
// serves stale application code: no fetch handler means the browser talks
// straight to the network. Activation drops every legacy cache so stale
// monolith-era shells cannot survive an upgrade.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Sori Bloom caches only its public app shell. API responses and private records never enter this cache. */
/* global self, caches, fetch, URL */
const CACHE = 'sori-bloom-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch('/index.html', { cache: 'reload' });
    if (!page.ok) throw new Error('Cannot prepare the offline app shell.');
    const html = await page.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
    await cache.put('/index.html', page);
    await cache.addAll(['/favicon.svg', '/manifest.webmanifest', ...assets]);
  })());
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('sori-bloom-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/mcp' || url.pathname.startsWith('/oauth/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put('/index.html', copy)));
      }
      return response;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  if (!url.pathname.startsWith('/assets/') && !['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)) return;
  event.respondWith(caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  })));
});

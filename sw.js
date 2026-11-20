// Service worker: tiene una copia dei file dell'app per aprirla anche senza rete.
// Non intercetta mai Firebase, Anthropic, OpenStreetMap (ricerca) né le mappe: passano direttamente.
const VERSION = 'v1';
const CACHE = `attivita-eventi-${VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/util.js', './js/config.js', './js/store.js', './js/ui.js', './js/geo.js',
  './js/mapview.js', './js/calendar.js', './js/forms.js', './js/sections.js', './js/capture.js', './js/settings.js',
  './icons/icon-192.png', './icons/icon-512.png',
];
const CDN_OK = ['https://unpkg.com/', 'https://www.gstatic.com/firebasejs/', 'https://cdn.jsdelivr.net/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('attivita-eventi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cdn = CDN_OK.some((p) => req.url.startsWith(p));
  if (!sameOrigin && !cdn) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    const net = fetch(req).then((res) => {
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});

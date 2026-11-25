// Service worker: tiene una copia dei file dell'app per aprirla anche senza rete.
// Non intercetta mai Firebase, Anthropic, OpenStreetMap (ricerca) né le mappe: passano direttamente.
const VERSION = '1.7.0';   // = APP_VERSION in js/version.js (controllato dal test)
const CACHE = `attivita-eventi-${VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/util.js', './js/config.js', './js/store.js', './js/ui.js', './js/geo.js',
  './js/version.js', './js/mapview.js', './js/calendar.js', './js/forms.js', './js/sections.js', './js/capture.js', './js/settings.js', './js/share.js', './js/sharelinks.js', './js/news.js',
  './img/sfondo.jpg', './icons/icon-192.png', './icons/icon-512.png',
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
    // File dell'app: prima la rete (così un aggiornamento arriva subito), poi la copia salvata (così funziona anche offline).
    // Librerie esterne (mappa, Firebase, OCR): prima la copia salvata, e si aggiorna in sottofondo.
    if (sameOrigin) {
      try {
        const res = await Promise.race([
          fetch(req, { cache: 'no-cache' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 5000)),
        ]);
        if (res && res.ok) { if (!url.search) cache.put(req, res.clone()); return res; }   // i link con testo condiviso non si salvano
        if (res && res.status === 404) return res;
      } catch { /* rete assente o lenta: si usa la copia salvata */ }
      const hit = await cache.match(req, { ignoreSearch: true });
      return hit || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => {
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});

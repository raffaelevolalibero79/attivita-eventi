// mapview.js — mappa interattiva con OpenStreetMap (libreria Leaflet).
// Leaflet viene cercata prima nella cartella lib/leaflet dell'app (se l'hai scaricata) e poi sul sito unpkg,
// con controllo di integrità (SRI): se il file scaricato non coincide con quello atteso, il browser lo rifiuta.
import { el, clear } from './ui.js';
import { CATEGORIES, STATUSES } from './util.js';
import { openShareSheet } from './share.js';

const V = '1.9.4';
const CDN = {
  css: [`https://unpkg.com/leaflet@${V}/dist/leaflet.css`, 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='],
  js: [`https://unpkg.com/leaflet@${V}/dist/leaflet.js`, 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='],
};

function loadTag(make) {
  return new Promise((resolve, reject) => {
    const t = make();
    t.addEventListener('load', () => resolve(t));
    t.addEventListener('error', () => { t.remove(); reject(new Error('load')); });
    document.head.append(t);
  });
}
let leafletPromise = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = (async () => {
      try {
        await loadTag(() => el('link', { rel: 'stylesheet', href: 'lib/leaflet/leaflet.css' }));
        await loadTag(() => el('script', { src: 'lib/leaflet/leaflet.js' }));
      } catch {
        await loadTag(() => el('link', { rel: 'stylesheet', href: CDN.css[0], integrity: CDN.css[1], crossorigin: 'anonymous' }));
        await loadTag(() => el('script', { src: CDN.js[0], integrity: CDN.js[1], crossorigin: 'anonymous' }));
      }
      if (!window.L) throw new Error('Leaflet mancante');
      return window.L;
    })().catch((e) => { leafletPromise = null; throw e; });
  }
  return leafletPromise;
}

const catKey = (c) => (CATEGORIES[c] ? c : 'attivita');
const stKey = (s) => (STATUSES[s] ? s : 'da_valutare');

function pinElement(item) {
  const c = catKey(item.category), s = stKey(item.status);
  const box = el('div', { class: `cat-${c}` }, el('div', { class: `pin st-${s}` }, el('span', { text: s === 'fatto' ? '✓' : CATEGORIES[c].icon })));
  return box;
}

export async function createMapView(container, { buttonsHost, bannerHost, onOpen, onLongPress, getHome }) {
  let L;
  try { L = await loadLeaflet(); } catch {
    clear(container).append(el('div', { class: 'map-msg' },
      el('p', { text: 'La mappa non si è caricata. Serve la connessione internet la prima volta.' }),
      el('button', { class: 'btn small', text: 'Riprova', onclick: () => location.reload() })));
    return null;
  }
  clear(container);
  const map = L.map(container, { zoomControl: true, tap: true }).setView([45.7, 11.75], 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  let meMarker = null, picking = false, firstFit = true;

  map.on('contextmenu', (e) => { if (!picking && onLongPress) onLongPress({ lat: e.latlng.lat, lng: e.latlng.lng }); });

  const api = {
    map,
    setItems(items) {
      layer.clearLayers();
      const pts = [];
      for (const it of items) {
        if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) continue;
        const icon = L.divIcon({ className: 'mk', html: pinElement(it), iconSize: [36, 40], iconAnchor: [18, 38], popupAnchor: [0, -34] });
        const m = L.marker([it.lat, it.lng], { icon, title: it.title, keyboard: true, riseOnHover: true });
        const pop = el('div', null,
          el('div', { class: 'pop-title', text: `${CATEGORIES[catKey(it.category)].icon} ${it.title}` }),
          el('div', { text: it.subtitle || '' }),
          el('button', { class: 'pop-btn', text: 'Apri scheda', onclick: () => { map.closePopup(); onOpen(it); } }),
          el('button', { class: 'pop-btn alt', text: '📤 Condividi / Naviga', onclick: () => openShareSheet({ name: it.title, address: it.subtitle, lat: it.lat, lng: it.lng }) }));
        m.bindPopup(pop, { closeButton: true, autoPanPadding: [30, 60] });
        m.addTo(layer);
        pts.push([it.lat, it.lng]);
      }
      if (firstFit && pts.length) { firstFit = false; map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 }); }
    },
    fit(items) {
      const pts = items.filter((i) => Number.isFinite(i.lat)).map((i) => [i.lat, i.lng]);
      if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    },
    flyTo(lat, lng, zoom = 15) { map.flyTo([lat, lng], zoom, { duration: 0.8 }); container.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    showMe(lat, lng) {
      if (meMarker) meMarker.remove();
      meMarker = L.marker([lat, lng], { icon: L.divIcon({ className: 'mk', html: el('div', { class: 'me-dot' }), iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false }).addTo(map);
    },
    invalidate() { map.invalidateSize(); },
    pick(message = 'Tocca la mappa nel punto giusto') {
      return new Promise((resolve) => {
        picking = true;
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const done = (v) => { picking = false; map.off('click', onClick); container.style.cursor = ''; bannerHost.hidden = true; clear(bannerHost); resolve(v); };
        const onClick = (e) => done({ lat: e.latlng.lat, lng: e.latlng.lng });
        clear(bannerHost).append(el('span', { text: message }), el('button', { type: 'button', text: 'Annulla', onclick: () => done(null) }));
        bannerHost.hidden = false;
        container.style.cursor = 'crosshair';
        map.once('click', onClick);
      });
    },
  };

  clear(buttonsHost).append(
    el('button', { 'aria-label': 'Dove sono', title: 'Dove sono', text: '📍', onclick: () => buttonsHost.dispatchEvent(new CustomEvent('locate')) }),
    el('button', { 'aria-label': 'Vai a casa', title: 'Casa', text: '🏠', onclick: () => { const h = getHome(); if (h) map.flyTo([h.lat, h.lng], 12); else buttonsHost.dispatchEvent(new CustomEvent('nohome')); } }),
  );
  new ResizeObserver(() => map.invalidateSize()).observe(container);
  return api;
}

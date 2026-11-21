// geo.js — ricerca luoghi (OpenStreetMap / Nominatim, gratuita) e posizione GPS.
// Nominatim chiede di non superare 1 richiesta al secondo: le richieste vengono distanziate.
import { haversineKm, cleanAddress, cityFromAddress } from './util.js';

const BASE = 'https://nominatim.openstreetmap.org';
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nominatim(path) {
  const wait = Math.max(0, last + 1100 - Date.now());
  if (wait) await sleep(wait);
  last = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${BASE}/${path}`, { headers: { Accept: 'application/json' }, signal: ctrl.signal, referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!r.ok) throw new Error(`Il servizio di ricerca ha risposto con errore ${r.status}.`);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('La ricerca ha impiegato troppo tempo. Controlla la connessione.');
    if (e instanceof TypeError) throw new Error('Non riesco a raggiungere il servizio di ricerca: controlla la connessione internet.');
    throw e;
  } finally { clearTimeout(timer); }
}

const toResult = (r) => ({ lat: +r.lat, lng: +r.lon, label: String(r.display_name || '').slice(0, 300), name: String(r.name || '').slice(0, 200), type: r.type || '' });

// near = { lat, lng } (facoltativo): i risultati vicini a quel punto passano avanti, ma si trova anche il resto del mondo.
export async function geocode(query, { limit = 6, near = null } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  let view = '';
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
    const dLat = 1.2, dLng = 1.6;
    view = `&viewbox=${(near.lng - dLng).toFixed(4)},${(near.lat + dLat).toFixed(4)},${(near.lng + dLng).toFixed(4)},${(near.lat - dLat).toFixed(4)}&bounded=0`;
  }
  const data = await nominatim(`search?format=jsonv2&limit=${limit}&accept-language=it&addressdetails=0${view}&q=${encodeURIComponent(q.slice(0, 250))}`);
  return (Array.isArray(data) ? data : []).map(toResult).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

// Cerca un luogo da nome e/o indirizzo (anche quelli copiati da Google Maps).
// Prova prima l'indirizzo ripulito, poi "nome, città", poi "nome, indirizzo", poi il solo nome:
// si ferma alla prima ricerca che trova qualcosa e restituisce fino a 5 candidati diversi tra loro.
export async function geocodePlace(name, address, { near = null } = {}) {
  const addr = cleanAddress(address), city = cityFromAddress(address);
  const n = String(name || '').trim();
  const tries = [];
  if (addr) tries.push(addr);
  if (n && city) tries.push(`${n}, ${city}`);
  if (n && addr && addr !== city) tries.push(`${n}, ${addr}`);
  if (n) tries.push(n);
  const seen = new Set();
  let lastError = null;
  for (const q of tries) {
    if (seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    let r = [];
    try { r = await geocode(q, { limit: 5, near }); } catch (e) { lastError = e; continue; }
    const out = [];
    for (const x of r) if (!out.some((o) => haversineKm(o, x) < 0.15)) out.push(x);
    if (out.length) {
      if (near) for (const x of out) x.km = haversineKm(near, x);
      return out;
    }
  }
  if (lastError) throw lastError;
  return [];
}

export async function reverseGeocode(lat, lng) {
  const d = await nominatim(`reverse?format=jsonv2&zoom=18&accept-language=it&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`);
  return d && d.display_name ? { label: String(d.display_name).slice(0, 300), name: String(d.name || '').slice(0, 200) } : null;
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Questo telefono non fornisce la posizione.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Permesso di posizione negato: attivalo nelle impostazioni del browser.' : 'Non riesco a trovare la tua posizione.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

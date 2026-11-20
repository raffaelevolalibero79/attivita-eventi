// geo.js — ricerca luoghi (OpenStreetMap / Nominatim, gratuita) e posizione GPS.
// Nominatim chiede di non superare 1 richiesta al secondo: le richieste vengono distanziate.
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

export async function geocode(query, { limit = 6 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const data = await nominatim(`search?format=jsonv2&limit=${limit}&accept-language=it&addressdetails=0&q=${encodeURIComponent(q.slice(0, 250))}`);
  return (Array.isArray(data) ? data : []).map(toResult).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

// Prova "nome, indirizzo" e poi solo l'indirizzo: così i locali piccoli si trovano più spesso.
export async function geocodePlace(name, address) {
  const tries = [];
  if (name && address) tries.push(`${name}, ${address}`);
  if (address) tries.push(address);
  if (name) tries.push(name);
  for (const q of tries) {
    const r = await geocode(q, { limit: 5 });
    if (r.length) return r;
  }
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

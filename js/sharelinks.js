// sharelinks.js — costruisce i collegamenti per condividere una posizione (solo numeri e testo codificato).
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fix = (v) => v.toFixed(6);
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function locationLinks({ name, address, lat, lng }) {
  const la = num(lat), lo = num(lng);
  if (la == null || lo == null || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  const ll = `${fix(la)},${fix(lo)}`;
  const label = clean(name, 80);
  const addr = clean(address, 160);
  const maps = `https://www.google.com/maps/search/?api=1&query=${ll}`;
  const text = [label, addr, maps].filter(Boolean).join('\n');
  return {
    ll, text, maps,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
    gmapsNav: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    geo: `geo:${ll}?q=${ll}${label ? `(${encodeURIComponent(label)})` : ''}`,
    title: label || 'Posizione',
  };
}

export function hasLocation(item) { return !!item && locationLinks(item) !== null; }


// Testo della lista "Cose da portare" da inviare ad altre app (Google Keep, WhatsApp…): una voce per riga, senza simboli,
// così Keep la trasforma facilmente in elenco con le caselle. Si inviano solo le voci non ancora messe in valigia.
export function packingText(trip) {
  const items = (trip && Array.isArray(trip.packing) ? trip.packing : []).filter((p) => p && p.text);
  const todo = items.filter((p) => !p.done);
  const list = todo.length ? todo : items;
  const title = `🧳 ${String((trip && trip.name) || 'Viaggio').slice(0, 80)} — cose da portare`;
  return { title, body: list.map((p) => String(p.text).replace(/\s+/g, ' ').trim()).join('\n'), count: list.length, skipped: items.length - list.length };
}

// mapsresolver.js — legge la posizione vera dietro un link breve di Google Maps (maps.app.goo.gl),
// chiedendola al "lettore" che l'utente ha creato nel proprio account Google (vedi resolvercode.js).
import * as U from './util.js';

export const RESOLVER_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,200}\/exec$/;
export const isResolverUrl = (u) => RESOLVER_URL_RE.test(String(u || '').trim());

const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !U.isDefaultView(lat, lng);

async function call(resolverUrl, query, { timeoutMs = 15000, fetchImpl } = {}) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await f(`${resolverUrl}?${query}`, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', signal: ctl ? ctl.signal : undefined });
    if (!res || !res.ok) throw new Error(`risposta ${res ? res.status : 'vuota'}`);
    let data;
    try { data = await res.json(); } catch { throw new Error('risposta non valida (il lettore va pubblicato come "App web" con accesso a "Chiunque")'); }
    return data;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('il lettore non ha risposto in tempo');
    throw e;
  } finally { if (t) clearTimeout(t); }
}

// Prova veloce dalle Impostazioni: il lettore risponde?
export async function pingResolver(resolverUrl, opts = {}) {
  if (!isResolverUrl(resolverUrl)) throw new Error('L\'indirizzo del lettore non sembra giusto: deve iniziare con https://script.google.com/macros/s/ e finire con /exec');
  const d = await call(String(resolverUrl).trim(), 'ping=1', opts);
  if (!d || d.ok !== true || d.ping !== true) throw new Error('il lettore ha risposto in modo inatteso');
  return true;
}

// Restituisce { lat, lng, name, address, title, url, from, hops } (lat/lng possono mancare) oppure lancia un errore in italiano.
export async function resolveMapsLink(shortUrl, resolverUrl, opts = {}) {
  if (!isResolverUrl(resolverUrl)) throw new Error('lettore dei link non configurato');
  const safe = U.safeUrl(shortUrl);
  const p = safe ? U.parseMapsUrl(safe) : null;
  if (!p || !p.short) throw new Error('non è un link breve di Google Maps');
  let d;
  try { d = await call(String(resolverUrl).trim(), `u=${encodeURIComponent(safe)}`, opts); }
  catch (e) { throw new Error(`Lettore dei link: ${e.message}`); }
  if (!d || d.ok !== true) throw new Error(`Lettore dei link: ${(d && d.error) || 'nessuna risposta'}`);
  const out = { lat: null, lng: null, name: '', address: '', title: '', url: '', from: String(d.from || '').slice(0, 30), hops: Number.isFinite(+d.hops) ? +d.hops : 0 };
  const finalUrl = typeof d.url === 'string' ? U.safeUrl(d.url) : '';
  const parsed = finalUrl ? U.parseMapsUrl(finalUrl) : null;
  if (parsed && !parsed.short) {
    out.url = finalUrl;
    out.name = parsed.name || '';
    if (parsed.lat != null) { out.lat = parsed.lat; out.lng = parsed.lng; }
  }
  if (out.lat == null && d.lat != null && d.lng != null && inRange(+d.lat, +d.lng)) { out.lat = +d.lat; out.lng = +d.lng; }
  if (typeof d.title === 'string') {
    out.title = d.title.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    // il titolo di Google è "Nome · Indirizzo": l'indirizzo serve a cercare il posto anche se la posizione esatta non arriva
    const parts = out.title.split(/\s·\s/).map((x) => x.trim()).filter(Boolean);
    if (!out.name) out.name = (parts[0] || '').slice(0, 200);
    if (parts.length > 1) out.address = parts.slice(1).join(', ').slice(0, 300);
  }
  return out;
}

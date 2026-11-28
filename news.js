// news.js — "novità" tra i due telefoni (senza server, gratis): chi ha aggiunto cosa e cosa non hai ancora visto.
// Ogni evento/luogo nuovo porta il nome di chi l'ha creato (campo "by", solo il nome di battesimo).
// Qui c'è la logica pura (senza DOM): si ricorda in locale cosa hai già visto; niente di questo esce dal telefono.
const KEY = 'ae.seen';
const MAX_IDS = 600;

export function authorLabel(user) {
  if (!user) return '';
  const name = String(user.displayName || '').trim().split(/\s+/)[0] || String(user.email || '').split('@')[0] || '';
  return name.replace(/[^\p{L}\p{N} ._'-]/gu, '').slice(0, 40);
}

function read(storage) {
  try { const o = JSON.parse(storage.getItem(KEY) || 'null'); if (o && typeof o === 'object') return { base: Number(o.base) || 0, ids: Array.isArray(o.ids) ? o.ids.filter((x) => typeof x === 'string') : [] }; } catch { /* ignora */ }
  return null;
}
function write(storage, st) { try { storage.setItem(KEY, JSON.stringify({ base: st.base, ids: st.ids.slice(-MAX_IDS) })); } catch { /* ignora */ } }

// Al primo avvio con questa funzione, tutto ciò che c'è già conta come "visto"
export function loadSeen(storage, now = Date.now()) {
  let st = read(storage);
  if (!st) { st = { base: now, ids: [] }; write(storage, st); }
  return st;
}
export const isNew = (doc, me, st) => !!doc && !!doc.by && doc.by !== me && Number(doc.createdAt) > st.base && !st.ids.includes(doc.id);
export function markSeen(storage, st, id) { if (!st.ids.includes(id)) { st.ids.push(id); write(storage, st); } return st; }
export function markAllSeen(storage, st, now = Date.now()) { st.base = now; write(storage, st); return st; }   // gli id già visti restano: servono se l'orologio dell'altro telefono va avanti

// Frase per l'avviso: "Elena ha aggiunto: Sagra" / "Elena ha aggiunto 3 novità"
export function describe(docs) {
  const list = docs.filter(Boolean);
  if (!list.length) return '';
  const names = [...new Set(list.map((d) => d.by))];
  const who = names.length === 1 ? names[0] : names.slice(0, 2).join(' e ') + (names.length > 2 ? ' e altri' : '');
  if (list.length === 1) return `${who} ha aggiunto: ${String(list[0].title || list[0].name || 'una novità').slice(0, 60)}`;
  return `${who} ${names.length === 1 ? 'ha' : 'hanno'} aggiunto ${list.length} novità`;
}

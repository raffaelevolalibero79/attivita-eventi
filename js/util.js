// util.js — logica pura (senza DOM): date, ricorrenze, link Maps, lettura testi, pulizia dati.
// Tutte le date sono stringhe "AAAA-MM-GG" e le ore "HH:MM" (ora locale, nessun fuso).

export const CATEGORIES = {
  mangiare: { label: 'Mangiare', color: '#e8590c', icon: '🍽️' },
  attivita: { label: 'Attività', color: '#2f9e44', icon: '🎯' },
  vedere: { label: 'Da vedere', color: '#1c7ed6', icon: '🏛️' },
};
export const CAT_KEYS = Object.keys(CATEGORIES);

export const STATUSES = {
  da_valutare: { label: 'Da valutare', short: 'Da valutare', icon: '❔' },
  interessa: { label: 'Mi interessa', short: 'Mi interessa', icon: '⭐' },
  non_interessa: { label: 'Non mi interessa', short: 'Non mi interessa', icon: '✕' },
  fatto: { label: 'Fatto / partecipato', short: 'Fatto', icon: '✓' },
};
export const STATUS_KEYS = Object.keys(STATUSES);

export const DOW_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
export const DOW_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const MONTH_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONTH_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// ---------- id ----------
export function uid() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(20);
  (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => (bytes[i] = Math.floor(Math.random() * 256)));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// ---------- date ----------
export const pad = (n) => String(n).padStart(2, '0');
export const toYmd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}
const utcMs = (s) => { const p = parseYmd(s); return Date.UTC(p.y, p.m - 1, p.d); };

export function addDays(s, n) {
  const dt = new Date(utcMs(s) + n * 86400000);
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
export const diffDays = (a, b) => Math.round((utcMs(a) - utcMs(b)) / 86400000);
// 0 = lunedì … 6 = domenica
export const weekday = (s) => (new Date(utcMs(s)).getUTCDay() + 6) % 7;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const localToday = (now = new Date()) => toYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());

export function addMonths(y, m, delta) {
  const t = y * 12 + (m - 1) + delta;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}
export function monthGrid(y, m) {
  const first = toYmd(y, m, 1);
  const start = addDays(first, -weekday(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function formatDateIt(s, withYear = true) {
  const p = parseYmd(s);
  if (!p) return '';
  const base = `${DOW_SHORT[weekday(s)]} ${p.d} ${MONTH_SHORT[p.m - 1]}`;
  return withYear ? `${base} ${p.y}` : base;
}
export function formatRangeIt(start, end) {
  if (!start) return '';
  if (!end || end === start) return formatDateIt(start);
  return `${formatDateIt(start, false)} → ${formatDateIt(end)}`;
}
export function monthTitle(y, m) {
  const t = MONTH_LONG[m - 1];
  return `${t[0].toUpperCase()}${t.slice(1)} ${y}`;
}
// n = 1..4 oppure -1 (ultimo); wd 0 = lunedì
export function nthWeekdayOfMonth(y, m, wd, n) {
  const dim = daysInMonth(y, m);
  if (n > 0) {
    const first = weekday(toYmd(y, m, 1));
    const day = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
    return day > dim ? null : day;
  }
  const last = weekday(toYmd(y, m, dim));
  return dim - ((last - wd + 7) % 7);
}
export function nthIndexOf(s) {
  const p = parseYmd(s);
  if (p.d + 7 > daysInMonth(p.y, p.m)) return -1;
  return Math.ceil(p.d / 7);
}

// ---------- ricorrenze ----------
export function* rawStarts(rec, start, interval) {
  const p = parseYmd(start);
  switch (rec.freq) {
    case 'daily':
      for (let i = 0; ; i++) yield addDays(start, i * interval);
      break;
    case 'weekly': {
      const days = rec.byWeekday && rec.byWeekday.length ? [...new Set(rec.byWeekday)].sort((a, b) => a - b) : [weekday(start)];
      const monday = addDays(start, -weekday(start));
      for (let w = 0; ; w += interval) {
        for (const wd of days) {
          const d = addDays(monday, w * 7 + wd);
          if (d >= start) yield d;
        }
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'monthly': {
      const wdStart = weekday(start);
      for (let k = 0; ; k += interval) {
        const t = p.y * 12 + (p.m - 1) + k;
        const y = Math.floor(t / 12), m = (t % 12) + 1;
        let d;
        if (rec.monthlyMode === 'nth') {
          const day = nthWeekdayOfMonth(y, m, wdStart, rec.nth || nthIndexOf(start));
          if (day == null) continue;
          d = toYmd(y, m, day);
        } else {
          d = toYmd(y, m, Math.min(p.d, daysInMonth(y, m)));
        }
        if (d >= start) yield d;
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'yearly':
      for (let k = 0; ; k += interval) {
        const y = p.y + k;
        yield toYmd(y, p.m, Math.min(p.d, daysInMonth(y, p.m)));
      }
    // eslint-disable-next-line no-fallthrough
    default:
      yield start;
  }
}

// Occorrenze dell'evento che toccano l'intervallo [from, to] (estremi inclusi).
export function expandOccurrences(ev, from, to, limit = 2000) {
  const out = [];
  if (!parseYmd(ev.startDate)) return out;
  const dur = ev.endDate && parseYmd(ev.endDate) ? Math.max(0, diffDays(ev.endDate, ev.startDate)) : 0;
  const rec = ev.rec || { freq: 'none' };
  const push = (s) => {
    const e = addDays(s, dur);
    if (e >= from && s <= to) out.push({ date: s, endDate: e, startTime: ev.startTime || '', endTime: ev.endTime || '', ev });
  };
  if (!rec.freq || rec.freq === 'none') { push(ev.startDate); return out; }
  const interval = Math.max(1, Math.floor(+rec.interval || 1));
  const ex = new Set(rec.exdates || []);
  let count = 0, guard = 0;
  for (const s of rawStarts(rec, ev.startDate, interval)) {
    if (++guard > 20000) break;
    if (rec.until && s > rec.until) break;
    if (rec.count > 0 && count >= rec.count) break;
    count++;
    if (s > to) break;
    if (ex.has(s)) continue;
    push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export function nextOccurrence(ev, fromStr) {
  const occ = expandOccurrences(ev, fromStr, addDays(fromStr, 3700), 1);
  return occ[0] || null;
}

export function describeRecurrence(rec, startDate) {
  if (!rec || !rec.freq || rec.freq === 'none') return '';
  const n = Math.max(1, +rec.interval || 1);
  let t = '';
  if (rec.freq === 'daily') t = n === 1 ? 'Ogni giorno' : `Ogni ${n} giorni`;
  if (rec.freq === 'weekly') {
    const days = (rec.byWeekday && rec.byWeekday.length ? rec.byWeekday : [weekday(startDate || '2026-01-05')]).map((d) => DOW_SHORT[d]).join(', ');
    t = (n === 1 ? 'Ogni settimana' : `Ogni ${n} settimane`) + ` (${days})`;
  }
  if (rec.freq === 'monthly') {
    if (rec.monthlyMode === 'nth' && startDate && parseYmd(startDate)) {
      const k = rec.nth || nthIndexOf(startDate);
      const ord = { 1: 'primo', 2: 'secondo', 3: 'terzo', 4: 'quarto', '-1': 'ultimo' }[k] || `${k}°`;
      t = `${n === 1 ? 'Ogni mese' : `Ogni ${n} mesi`}, ${ord} ${DOW_LONG[weekday(startDate)]}`;
    } else {
      t = n === 1 ? 'Ogni mese' : `Ogni ${n} mesi`;
    }
  }
  if (rec.freq === 'yearly') t = n === 1 ? 'Ogni anno' : `Ogni ${n} anni`;
  if (rec.until) t += `, fino al ${formatDateIt(rec.until)}`;
  else if (rec.count > 0) t += `, ${rec.count} volte`;
  return t;
}

// ---------- distanze ----------
export function haversineKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------- link ----------
export function extractUrls(text) {
  return (String(text || '').match(/(?:https?:\/\/|\bwww\.)[^\s<>"']+/gi) || []).map((u) => u.replace(/[).,;!?]+$/, ''));
}

export function safeUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  if (/^www\./i.test(s)) s = 'https://' + s;
  try {
    const x = new URL(s);
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return '';
    return x.href.slice(0, 2000);
  } catch { return ''; }
}

export function linkKind(u) {
  let host = '';
  try { host = new URL(u).hostname.toLowerCase(); } catch { return 'altro'; }
  if (/(^|\.)(facebook\.com|fb\.me|fb\.com|fb\.watch)$/.test(host)) return 'facebook';
  if (/(^|\.)(instagram\.com|instagr\.am)$/.test(host)) return 'instagram';
  if (/(^|\.)maps\.app\.goo\.gl$/.test(host) || host === 'goo.gl' || host === 'g.co') return 'maps';
  if (/(^|\.)google\.[a-z.]+$/.test(host) && /\/maps/.test(u)) return 'maps';
  return 'altro';
}

const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Legge le coordinate da un link lungo di Google Maps. I link corti non si possono aprire dall'app.
export function parseMapsUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const short = /(^|\.)maps\.app\.goo\.gl$/.test(host) || (host === 'goo.gl' && /^\/maps/.test(u.pathname)) || host === 'g.co';
  const isGoogle = /(^|\.)google\.[a-z.]+$/.test(host) && /^\/maps/.test(u.pathname);
  if (!short && !isGoogle) return null;
  const out = { short, lat: null, lng: null, name: '', query: '' };
  if (short) return out;
  const href = decodeURIComponent(u.href.replace(/\+/g, ' '));
  let m = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(href) || /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(href);
  if (m && inRange(+m[1], +m[2])) { out.lat = +m[1]; out.lng = +m[2]; }
  for (const key of ['q', 'query', 'll', 'center', 'destination']) {
    const v = u.searchParams.get(key);
    if (!v) continue;
    const c = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(v);
    if (c) { if (out.lat == null && inRange(+c[1], +c[2])) { out.lat = +c[1]; out.lng = +c[2]; } }
    else if (!out.query && (key === 'q' || key === 'query')) out.query = v.slice(0, 200);
  }
  const place = /\/maps\/place\/([^/@]+)/.exec(u.pathname);
  if (place) {
    try { out.name = decodeURIComponent(place[1].replace(/\+/g, ' ')).slice(0, 200); } catch { /* ignora */ }
  }
  return out;
}

// Testo condiviso da Google Maps: nome, indirizzo e link. Restituisce righe utili e link.
export function parseSharedPlaceText(text) {
  const urls = extractUrls(text);
  let body = String(text || '');
  for (const u of urls) body = body.replace(u, '');
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
  return { urls, name: lines[0] || '', address: lines.slice(1).join(', ') };
}

// ---------- lettura testi di locandine / didascalie (regole, in italiano) ----------
const MONTHS = {
  gennaio: 1, gen: 1, febbraio: 2, feb: 2, marzo: 3, mar: 3, aprile: 4, apr: 4, maggio: 5, mag: 5,
  giugno: 6, giu: 6, luglio: 7, lug: 7, agosto: 8, ago: 8, settembre: 9, sett: 9, set: 9,
  ottobre: 10, ott: 10, novembre: 11, nov: 11, dicembre: 12, dic: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const monthNum = (s) => MONTHS[s.toLowerCase().replace('.', '')];

const CAT_WORDS = {
  mangiare: /\b(sagra|cena|pranzo|degustazion\w*|men[uù]|ristorante|pizzeria|aperitiv\w*|apericena|street ?food|osteria|trattoria|vino|vini|birra|brunch|colazione|food|cantina|gelato|agriturismo|polenta|baccal[aà]|risotto)\b/gi,
  vedere: /\b(mostra|museo|castello|visita guidata|panorama|monument\w*|chiesa|villa|parco|cascata|lago|belvedere|esposizione|galleria|abbazia|borgo|rocca|cattedrale|giardini)\b/gi,
  attivita: /\b(concerto|spettacolo|laboratorio|escursione|passeggiata|torneo|corsa|gara|festival|teatro|cinema|workshop|lezione|trekking|camminata|bici|pedalata|mercatino|mercato|festa|musica|dj|live|tombola|gioco|giochi)\b/gi,
};

export function guessCategory(text) {
  let best = 'attivita', bestScore = 0;
  for (const [k, re] of Object.entries(CAT_WORDS)) {
    const n = (String(text).match(re) || []).length;
    if (n > bestScore) { best = k; bestScore = n; }
  }
  return best;
}

export function parseEventText(text, opts = {}) {
  const today = opts.today || localToday();
  const raw = String(text || '').replace(/ /g, ' ').replace(/\r/g, '').trim();
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const flat = lines.join(' \n ');
  const res = {
    title: '', startDate: '', startTime: '', endDate: '', endTime: '', venue: '', address: '', price: '',
    phone: '', email: '', link: '', description: raw.slice(0, 8000), category: guessCategory(raw), found: [],
  };
  const ty = +today.slice(0, 4);
  const fullYear = (y) => (y < 100 ? 2000 + y : y);
  const guessYear = (d, m, y) => {
    if (y) return fullYear(y);
    let yy = ty;
    const s = toYmd(yy, m, Math.min(d, 28));
    if (s < addDays(today, -30)) yy = ty + 1;
    return yy;
  };
  const mk = (d, m, y) => { const s = toYmd(guessYear(d, m, y), m, d); return parseYmd(s) ? s : ''; };

  let m;
  // intervalli di date
  const WD = '(?:(?:luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)\\.?\\s+)?';
  const reRangeSame = new RegExp(`\\b(\\d{1,2})\\s*(?:\\bal?\\b|-|–|—|\\be\\b)\\s*${WD}(\\d{1,2})\\s+(${MONTH_RE})\\b\\.?(?:\\s+(\\d{4}))?`, 'i');
  const reRangeCross = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})\\b\\.?\\s*(?:\\bal?\\b|-|–|—)\\s*${WD}(\\d{1,2})\\s+(${MONTH_RE})\\b\\.?(?:\\s+(\\d{4}))?`, 'i');
  const reSingle = new RegExp(`\\b(\\d{1,2})\\s*[°º]?\\s+(${MONTH_RE})\\b\\.?(?:\\s+(\\d{4}))?`, 'i');
  const reIso = /\b(\d{4})-(\d{2})-(\d{2})\b/;
  const reSlash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
  const reDotYear = /\b(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})\b/;

  if ((m = reIso.exec(flat)) && parseYmd(m[0])) {
    res.startDate = m[0];
  } else if ((m = reRangeCross.exec(flat))) {
    const a = mk(+m[1], monthNum(m[2]), m[5] ? +m[5] : 0);
    let b = mk(+m[3], monthNum(m[4]), m[5] ? +m[5] : 0);
    if (a && b && b < a) b = mk(+m[3], monthNum(m[4]), (m[5] ? +m[5] : ty) + 1);
    res.startDate = a; res.endDate = b;
  } else if ((m = reRangeSame.exec(flat)) && +m[1] < +m[2] && +m[2] <= 31) {
    res.startDate = mk(+m[1], monthNum(m[3]), m[4] ? +m[4] : 0);
    res.endDate = mk(+m[2], monthNum(m[3]), m[4] ? +m[4] : 0);
  } else if ((m = reSingle.exec(flat))) {
    res.startDate = mk(+m[1], monthNum(m[2]), m[3] ? +m[3] : 0);
  } else if ((m = reDotYear.exec(flat)) || (m = reSlash.exec(flat))) {
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) res.startDate = mk(+m[1], +m[2], m[3] ? +m[3] : 0);
  }
  if (res.startDate) res.found.push('data');
  if (res.endDate && res.endDate === res.startDate) res.endDate = '';

  // orari
  const hh = '([01]?\\d|2[0-3])';
  const mm = '([0-5]\\d)';
  const sep = '\\s*(?:-|–|—|\\balle(?:\\s+ore)?\\b|\\ba\\b)\\s*';
  const t = (a, b) => `${pad(+a)}:${b == null || b === '' ? '00' : b}`;
  let tm;
  if ((tm = new RegExp(`\\b${hh}:${mm}${sep}${hh}:${mm}\\b`, 'i').exec(flat))) { res.startTime = t(tm[1], tm[2]); res.endTime = t(tm[3], tm[4]); }
  else if ((tm = new RegExp(`\\b(?:ore|h|dalle|dalle ore)\\s*${hh}[.:]${mm}${sep}${hh}[.:]${mm}`, 'i').exec(flat))) { res.startTime = t(tm[1], tm[2]); res.endTime = t(tm[3], tm[4]); }
  else if ((tm = new RegExp(`\\b(?:dalle|ore)\\s*${hh}\\s*(?:alle|-|–)\\s*${hh}\\b(?![.:])`, 'i').exec(flat))) { res.startTime = t(tm[1]); res.endTime = t(tm[2]); }
  else if ((tm = new RegExp(`\\b${hh}:${mm}\\b`).exec(flat))) { res.startTime = t(tm[1], tm[2]); }
  else if ((tm = new RegExp(`\\b(?:ore|alle|h)\\s*\\.?\\s*${hh}[.:]${mm}\\b`, 'i').exec(flat))) { res.startTime = t(tm[1], tm[2]); }
  else if ((tm = new RegExp(`\\b(?:ore|alle|h)\\s*\\.?\\s*${hh}\\b(?![.:/\\-]\\d)`, 'i').exec(flat))) { res.startTime = t(tm[1]); }
  if (res.startTime) res.found.push('ora');

  // prezzo
  const reFree = /\b(ingresso\s+(?:libero|gratuito)|entrata\s+libera|ingresso\s+free|gratuito|gratis)\b/i;
  const rePrice = /(?:€|\beur(?:o)?\b)\s*(\d{1,4}(?:[.,]\d{1,2})?)|(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|\beuro\b)/i;
  if ((m = rePrice.exec(flat))) res.price = `${(m[1] || m[2]).replace('.', ',')} €`;
  else if (reFree.test(flat)) res.price = 'Gratuito';
  if (res.price) res.found.push('prezzo');

  // contatti e link
  const urls = extractUrls(raw);
  if (urls.length) { res.link = safeUrl(urls[0]); res.found.push('link'); }
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(raw);
  if (email) res.email = email[0];
  const phone = /(?:\+39[\s.]?)?(?:\b3\d{2}[\s.]?\d{6,7}\b|\b0\d{1,3}[\s./-]?\d{5,8}\b)/.exec(raw.replace(/https?:\/\/\S+/g, ''));
  if (phone) res.phone = phone[0].trim();

  // luogo
  const reAddr = /\b(via|viale|piazza|piazzale|corso|largo|vicolo|strada|contrada|località|loc\.|v\.le|p\.zza|borgo|riva|lungomare)\s+[^\n]{2,}/i;
  const reVenue = /^(?:presso|c\/o|@|location\s*:|luogo\s*:|dove\s*:|indirizzo\s*:)\s*(.+)$/i;
  for (const line of lines) {
    if (/https?:\/\/|\bwww\./i.test(line)) continue;
    const v = reVenue.exec(line);
    if (v && !res.venue) {
      const parts = v[1].split(',').map((x) => x.trim());
      if (reAddr.test(parts[0])) { res.address = res.address || v[1]; }
      else { res.venue = parts[0]; if (parts.length > 1 && !res.address) res.address = parts.slice(1).join(', '); }
      continue;
    }
    if (!res.address && reAddr.test(line)) res.address = line.replace(/^(?:luogo|dove|indirizzo)\s*:\s*/i, '');
  }
  if (res.venue || res.address) res.found.push('luogo');

  // titolo: prima riga che non sia data, ora, prezzo, indirizzo, link
  const looksNoise = (l) => {
    if (/https?:\/\/|\bwww\./i.test(l)) return true;
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(l)) return true;
    if (reAddr.test(l) || reVenue.test(l)) return true;
    if (l.length < 48 && (reSingle.test(l) || reRangeSame.test(l) || reSlash.test(l) || reIso.test(l))) return true;
    if (/^(?:ore|h|alle|dalle)\b/i.test(l) && l.length < 25) return true;
    if (l.length < 32 && (rePrice.test(l) || reFree.test(l))) return true;
    if (/^(?:#\w+\s*)+$/.test(l)) return true;
    if (/^(?:evento|interessati|partecipa|condividi|invita)$/i.test(l)) return true;
    return false;
  };
  const cand = lines.find((l) => !looksNoise(l));
  res.title = (cand || lines[0] || '').replace(/^["“«]+|["”»]+$/g, '').slice(0, 120);
  if (res.title) res.found.push('titolo');
  return res;
}

// ---------- pulizia dei dati (usata su ogni scrittura, importazione e lettura da foto) ----------
const cap = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const num = (v, min, max) => { const x = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(x) && x >= min && x <= max ? x : null; };
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const dateStr = (v) => (parseYmd(v) ? v : '');
const timeStr = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : '');
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

export function sanitizeRec(r) {
  if (!r || typeof r !== 'object' || !['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq)) return { freq: 'none' };
  const out = {
    freq: r.freq,
    interval: Math.min(99, Math.max(1, Math.floor(+r.interval || 1))),
    byWeekday: arr(r.byWeekday, 7).map((x) => +x).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6),
    monthlyMode: r.monthlyMode === 'nth' ? 'nth' : 'dom',
    nth: [1, 2, 3, 4, -1].includes(+r.nth) ? +r.nth : 0,
    until: dateStr(r.until),
    count: Math.min(999, Math.max(0, Math.floor(+r.count || 0))),
    exdates: arr(r.exdates, 200).filter((x) => parseYmd(x)),
  };
  return out;
}

function geo(o) {
  let lat = num(o.lat, -90, 90), lng = num(o.lng, -180, 180);
  if (lat == null || lng == null) { lat = null; lng = null; }
  return { lat, lng };
}

export function sanitizeDoc(coll, o) {
  o = o && typeof o === 'object' ? o : {};
  const base = {
    id: cap(o.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || uid(),
    createdAt: num(o.createdAt, 0, 9e15) || Date.now(),
    updatedAt: num(o.updatedAt, 0, 9e15) || Date.now(),
  };
  if (coll === 'places') {
    return {
      ...base,
      name: cap(o.name, 200) || 'Senza nome',
      category: oneOf(o.category, CAT_KEYS, 'attivita'),
      status: oneOf(o.status, STATUS_KEYS, 'da_valutare'),
      description: cap(o.description, 10000),
      address: cap(o.address, 300),
      ...geo(o),
      link: safeUrl(o.link),
      phone: cap(o.phone, 60),
      hours: cap(o.hours, 400),
      price: cap(o.price, 100),
      rating: num(o.rating, 0, 5) || 0,
      notes: cap(o.notes, 4000),
      tripId: cap(o.tripId, 40),
      hasThumb: !!o.hasThumb,
    };
  }
  if (coll === 'events') {
    return {
      ...base,
      title: cap(o.title, 200) || 'Senza titolo',
      category: oneOf(o.category, CAT_KEYS, 'attivita'),
      status: oneOf(o.status, STATUS_KEYS, 'da_valutare'),
      description: cap(o.description, 10000),
      startDate: dateStr(o.startDate),
      startTime: timeStr(o.startTime),
      endDate: dateStr(o.endDate),
      endTime: timeStr(o.endTime),
      allDay: !!o.allDay,
      rec: sanitizeRec(o.rec),
      venue: cap(o.venue, 200),
      address: cap(o.address, 300),
      ...geo(o),
      link: safeUrl(o.link),
      price: cap(o.price, 100),
      organizer: cap(o.organizer, 200),
      contacts: cap(o.contacts, 300),
      notes: cap(o.notes, 4000),
      tripId: cap(o.tripId, 40),
      source: oneOf(o.source, ['manuale', 'foto', 'testo', 'link', 'condivisione'], 'manuale'),
      hasThumb: !!o.hasThumb,
    };
  }
  if (coll === 'trips') {
    return {
      ...base,
      name: cap(o.name, 200) || 'Viaggio',
      startDate: dateStr(o.startDate),
      endDate: dateStr(o.endDate),
      notes: cap(o.notes, 6000),
      budget: arr(o.budget, 200).map((b) => ({ id: cap(b && b.id, 40) || uid(), label: cap(b && b.label, 120), amount: num(b && b.amount, 0, 1e9) || 0, paid: !!(b && b.paid) })),
      packing: arr(o.packing, 300).map((p) => ({ id: cap(p && p.id, 40) || uid(), text: cap(p && p.text, 200), done: !!(p && p.done) })),
      itinerary: arr(o.itinerary, 500).map((i) => ({
        id: cap(i && i.id, 40) || uid(), date: dateStr(i && i.date), time: timeStr(i && i.time), text: cap(i && i.text, 300),
        refType: oneOf(i && i.refType, ['place', 'event', ''], ''), refId: cap(i && i.refId, 40),
      })),
    };
  }
  throw new Error('Collezione sconosciuta: ' + coll);
}

// Dati proposti da OCR o da Claude → evento pronto da rivedere (mai salvato in automatico)
export function eventFromExtracted(x, source) {
  x = x && typeof x === 'object' ? x : {};
  const raw = {
    title: x.title, description: x.description, startDate: x.startDate, startTime: x.startTime,
    endDate: x.endDate, endTime: x.endTime, venue: x.venue, address: x.address, link: x.link || x.website,
    price: x.price, organizer: x.organizer,
    contacts: [x.phone || x.phones, x.email, x.contacts].filter((v) => typeof v === 'string' && v).join(' · '),
    category: x.category, status: 'da_valutare', source,
  };
  if (x.recurrenceNote && typeof x.recurrenceNote === 'string') raw.notes = 'Ricorrenza indicata: ' + x.recurrenceNote;
  return sanitizeDoc('events', raw);
}

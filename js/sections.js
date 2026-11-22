// sections.js — righe riutilizzabili e sezioni a tendina.
// Dove finisce ogni cosa (ogni elemento sta in UN solo riquadro, secondo lo stato):
//   • "da valutare"      → solo in "Da valutare" (eventi e luoghi di qualsiasi categoria, tranne i segnaposto "Luoghi")
//   • categoria "Luoghi" → semplici segnaposto GPS: stanno subito nel riquadro "Luoghi" (non serve valutarli), tranne se segnati "non mi interessa"
//   • "mi interessa"     → eventi e luoghi "attività" in "Prossimi eventi"; luoghi "da vedere" in "Da vedere"; luoghi "mangiare" in "Mangiare"
//   • "fatto"            → i luoghi "da vedere" e "mangiare" restano nel loro riquadro con l'etichetta; le attività vanno in "Luoghi";
//                          gli eventi escono da "Prossimi eventi" (restano nel calendario)
//   • "non mi interessa" → solo in "Non mi interessa"
//   • il calendario mostra sempre tutti gli eventi che hanno una data.
import { el, clear } from './ui.js';
import * as U from './util.js';

const cat = (c) => U.CATEGORIES[c] || U.CATEGORIES.attivita;
const sk = (s) => (U.STATUSES[s] ? s : 'da_valutare');

function quickActs(item, onStatus) {
  const s = item.status;
  const star = el('button', { type: 'button', class: 'yes', 'aria-label': 'Mi interessa', 'aria-pressed': String(s === 'interessa'), text: '⭐', onclick: (e) => { e.stopPropagation(); onStatus(s === 'interessa' ? 'da_valutare' : 'interessa'); } });
  const no = el('button', { type: 'button', class: 'no', 'aria-label': 'Non mi interessa', 'aria-pressed': String(s === 'non_interessa'), text: '✕', onclick: (e) => { e.stopPropagation(); onStatus(s === 'non_interessa' ? 'da_valutare' : 'non_interessa'); } });
  return el('div', { class: 'acts' }, star, no);
}

export function timeText(o) {
  if (o.allDay) return 'tutto il giorno';
  if (o.startTime && o.endTime) return `${o.startTime}–${o.endTime}`;
  return o.startTime || '';
}

// occ = { ev, date, endDate, startTime, endTime }  oppure un evento senza data: { ev, date: '' }
export function eventRow(occ, { onOpen, onStatus, isNew }) {
  const ev = occ.ev;
  const when = occ.date ? [U.formatRangeIt(occ.date, occ.endDate && occ.endDate !== occ.date ? occ.endDate : ''), timeText(ev.startTime ? ev : occ)].filter(Boolean).join(' · ') : 'Data da definire';
  const where = [ev.venue, ev.address].filter(Boolean).join(', ');
  const rec = U.describeRecurrence(ev.rec, ev.startDate);
  const tags = [el('span', { class: 'tag', text: `${cat(ev.category).icon} ${cat(ev.category).label}` })];
  if (rec) tags.push(el('span', { class: 'tag', text: '↻ ricorrente' }));
  if (ev.hasThumb) tags.push(el('span', { class: 'tag', text: '📷 locandina' }));
  if (isNew && isNew(ev)) tags.unshift(el('span', { class: 'tag new', text: `🆕 nuovo · ${ev.by}` }));
  if (ev.status !== 'interessa') tags.push(el('span', { class: 'tag', text: U.STATUSES[sk(ev.status)].short }));
  return el('div', { class: `row cat-${U.CATEGORIES[ev.category] ? ev.category : 'attivita'} st-${sk(ev.status)}` },
    el('div', { class: 'stripe' }),
    el('button', { type: 'button', class: 'main', onclick: () => onOpen(ev, occ.date) },
      el('div', { class: 'title', text: ev.title }), el('div', { class: 'meta', text: when }), where ? el('div', { class: 'meta', text: where }) : null, el('div', null, tags)),
    quickActs(ev, (st) => onStatus('events', ev, st)));
}

export function placeRow(p, { onOpen, onStatus, home, isNew }) {
  const km = home && Number.isFinite(p.lat) ? U.haversineKm(home, p) : null;
  const tags = [el('span', { class: 'tag', text: `${cat(p.category).icon} ${cat(p.category).label}` })];
  if (km != null) tags.push(el('span', { class: 'tag', text: `${km < 10 ? km.toFixed(1) : Math.round(km)} km da casa` }));
  if (p.status !== 'interessa' && !(p.category === 'luoghi' && p.status === 'da_valutare')) tags.push(el('span', { class: 'tag', text: U.STATUSES[sk(p.status)].short }));
  if (isNew && isNew(p)) tags.unshift(el('span', { class: 'tag new', text: `🆕 nuovo · ${p.by}` }));
  if (p.rating) tags.push(el('span', { class: 'tag', text: '★'.repeat(Math.round(p.rating)) }));
  return el('div', { class: `row cat-${U.CATEGORIES[p.category] ? p.category : 'attivita'} st-${sk(p.status)}` },
    el('div', { class: 'stripe' }),
    el('button', { type: 'button', class: 'main', onclick: () => onOpen(p) },
      el('div', { class: 'title', text: p.name }), p.address ? el('div', { class: 'meta', text: p.address }) : null, el('div', null, tags)),
    quickActs(p, (st) => onStatus('places', p, st)));
}

const OPEN_KEY = 'ae.open';
const readOpen = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch { return new Set(); } };
const writeOpen = (s) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s])); } catch { /* ignora */ } };

// ctx: { data() → {fEvents, fPlaces, allEvents, allPlaces, trips}, home(), openEvent, openPlace, openTrip, newTrip, setStatus }
export function createSections(host, ctx) {
  const open = readOpen();
  const placesOf = (d, cats, sts) => d.fPlaces.filter((p) => sts.includes(p.status) && cats(p.category));
  const isSee = (c) => c === 'vedere';
  const isEat = (c) => c === 'mangiare';
  const isPin = (c) => c === 'luoghi';
  const isOther = (c) => !isSee(c) && !isEat(c) && !isPin(c);       // attività (e qualunque categoria sconosciuta)
  const DONE = ['interessa', 'fatto'];
  const defs = [
    { id: 'next', title: '📅 Prossimi eventi', build: buildNext, count: (d) => nextOccs(d).length + nextPlaces(d).length },
    { id: 'eval', title: '❔ Da valutare', build: buildEval, count: (d) => evalItems(d).events.length + evalItems(d).places.length },
    { id: 'see', title: '🏛️ Da vedere', build: (d) => buildCat(d, isSee, 'Nessun luogo "da vedere" che ti interessa. Segna ⭐ un luogo in "Da valutare" e arriva qui.'), count: (d) => placesOf(d, isSee, DONE).length },
    { id: 'eat', title: '🍽️ Mangiare', build: (d) => buildCat(d, isEat, 'Nessun posto dove mangiare che ti interessa. Segna ⭐ un luogo in "Da valutare" e arriva qui.'), count: (d) => placesOf(d, isEat, DONE).length },
    { id: 'places', title: '📍 Luoghi', build: buildPins, count: (d) => pinItems(d).length },
    { id: 'no', title: '🚫 Non mi interessa', build: buildNo, count: (d) => noItems(d).events.length + noItems(d).places.length },
    { id: 'trips', title: '🧳 Viaggi', build: buildTrips, count: (d) => d.trips.length },
  ];
  const nodes = {};
  for (const def of defs) {
    const badge = el('span', { class: 'badge' });
    const body = el('div', { class: 'sec-body' });
    const d = el('details', { class: 'sec', dataset: { id: def.id } }, el('summary', null, def.title, badge), body);
    d.open = open.has(def.id);
    d.addEventListener('toggle', () => { d.open ? open.add(def.id) : open.delete(def.id); writeOpen(open); if (d.open) fill(def); });
    host.append(d);
    nodes[def.id] = { d, badge, body };
  }
  const today = () => U.localToday();

  function nextOccs(data) {
    const t = today();
    const occ = data.fEvents.filter((ev) => ev.status === 'interessa').flatMap((ev) => U.expandOccurrences(ev, t, U.addDays(t, 120), 60));
    occ.sort((a, b) => (a.date + (a.startTime || '99')).localeCompare(b.date + (b.startTime || '99')));
    return occ.slice(0, 60);
  }
  function evalItems(data) {
    const t = today();
    const events = data.fEvents.filter((e) => e.status === 'da_valutare').map((ev) => {
      if (!ev.startDate) return { ev, date: '' };
      const n = U.nextOccurrence(ev, t);
      return n;
    }).filter(Boolean).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const places = data.fPlaces.filter((p) => p.status === 'da_valutare' && !isPin(p.category)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    return { events, places };
  }

  const evH = () => ({ onOpen: ctx.openEvent, onStatus: ctx.setStatus, isNew: ctx.isNew });
  const plH = () => ({ onOpen: ctx.openPlace, onStatus: ctx.setStatus, home: ctx.home(), isNew: ctx.isNew });
  const empty = (t) => el('div', { class: 'empty', text: t });

  const nextPlaces = (data) => placesOf(data, isOther, ['interessa']).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  function buildNext(data) {
    const occ = nextOccs(data);
    const acts = nextPlaces(data);
    if (!occ.length && !acts.length) return [empty('Nessun evento o attività che ti interessa. Segna ⭐ qualcosa in "Da valutare" e arriva qui.')];
    const out = occ.map((o) => eventRow(o, evH()));
    if (acts.length) { if (occ.length) out.push(el('div', { class: 'sub', text: 'Attività (senza data)' })); out.push(...acts.map((p) => placeRow(p, plH()))); }
    return out;
  }
  function buildEval(data) {
    const { events, places } = evalItems(data);
    const out = [];
    if (!events.length && !places.length) return [empty('Niente da valutare: bel lavoro! 🎉')];
    out.push(el('div', { class: 'hint', text: 'Tocca ⭐ se ti interessa o ✕ se non ti interessa: in questo modo l\'elemento esce da questo elenco.' }));
    if (events.length) { out.push(el('div', { class: 'sub', text: 'Eventi' })); out.push(...events.map((o) => eventRow(o, evH()))); }
    if (places.length) { out.push(el('div', { class: 'sub', text: 'Luoghi' })); out.push(...places.map((p) => placeRow(p, plH()))); }
    return out;
  }
  function noItems(data) {
    const t = today();
    const events = data.fEvents.filter((e) => e.status === 'non_interessa').map((ev) => (ev.startDate ? (U.nextOccurrence(ev, t) || { ev, date: ev.startDate }) : { ev, date: '' }))
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const places = data.fPlaces.filter((p) => p.status === 'non_interessa').sort((a, b) => a.name.localeCompare(b.name, 'it'));
    return { events, places };
  }
  function buildNo(data) {
    const { events, places } = noItems(data);
    if (!events.length && !places.length) return [empty('Qui finisce quello che segni con ✕. Se cambi idea, tocca ⭐ o di nuovo ✕ per rimetterlo in "Da valutare".')];
    const out = [];
    if (events.length) { out.push(el('div', { class: 'sub', text: 'Eventi' })); out.push(...events.map((o) => eventRow(o, evH()))); }
    if (places.length) { out.push(el('div', { class: 'sub', text: 'Luoghi' })); out.push(...places.map((p) => placeRow(p, plH()))); }
    return out;
  }
  // "Luoghi": i segnaposto semplici (categoria Luoghi) + le attività già fatte
  function pinItems(data) {
    return data.fPlaces.filter((p) => (isPin(p.category) && p.status !== 'non_interessa') || (isOther(p.category) && p.status === 'fatto'))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }
  function buildPins(data) {
    const list = pinItems(data);
    return list.length ? list.map((p) => placeRow(p, plH())) : [empty('Qui trovi i segnaposto GPS che classifichi come "Luoghi" (creati nell\'app o importati da Google Maps) e le attività già fatte.')];
  }
  function buildCat(data, cats, emptyText, sts = DONE) {
    const order = { interessa: 0, fatto: 1 };
    const list = placesOf(data, cats, sts).sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0) || a.name.localeCompare(b.name, 'it'));
    return list.length ? list.map((p) => placeRow(p, plH())) : [empty(emptyText)];
  }
  function buildTrips(data) {
    const out = [el('button', { class: 'btn small', type: 'button', text: '＋ Nuovo viaggio', onclick: ctx.newTrip })];
    const trips = [...data.trips].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || a.name.localeCompare(b.name, 'it'));
    if (!trips.length) out.push(empty('Nessun viaggio. Crea una lista per raggruppare luoghi, itinerario, budget e valigia.'));
    for (const t of trips) {
      const n = data.allPlaces.filter((p) => p.tripId === t.id).length + data.allEvents.filter((e) => e.tripId === t.id).length;
      out.push(el('div', { class: 'row cat-vedere' }, el('div', { class: 'stripe' }),
        el('button', { type: 'button', class: 'main', onclick: () => ctx.openTrip(t) },
          el('div', { class: 'title', text: t.name }),
          el('div', { class: 'meta', text: [U.formatRangeIt(t.startDate, t.endDate), `${n} luoghi/eventi`].filter(Boolean).join(' · ') })),
        el('div')));
    }
    return out;
  }
  function fill(def) {
    const data = ctx.data();
    const n = nodes[def.id];
    clear(n.body);
    for (const k of def.build(data)) if (k) n.body.append(k);
  }
  function render() {
    const data = ctx.data();
    for (const def of defs) {
      const n = nodes[def.id];
      const c = def.count(data);
      n.badge.textContent = c == null ? '' : String(c);
      n.badge.hidden = c == null;
      if (n.d.open) fill(def);
    }
  }
  return { render, openSection(id) { nodes[id].d.open = true; nodes[id].d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
}

// forms.js — moduli (luogo, evento, viaggio) e schede di dettaglio.
import { el, clear, openSheet, toast, confirmDialog, chip, field, select, thumbImg } from './ui.js';
import * as U from './util.js';
import { geocodePlace, reverseGeocode, getPosition } from './geo.js';
import { eventRow, placeRow } from './sections.js';

const catOf = (c) => U.CATEGORIES[c] || U.CATEGORIES.attivita;
const text = (v, ph, extra) => el('input', { type: 'text', value: v || '', placeholder: ph || '', autocomplete: 'off', ...(extra || {}) });
const area = (v, ph, rows) => el('textarea', { value: v || '', placeholder: ph || '', rows: rows || 4 });
const money = (n) => (+n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const clone = (o) => JSON.parse(JSON.stringify(o));
const telHref = (s) => (/^[+\d\s().-]{5,25}$/.test(s || '') ? 'tel:' + s.replace(/[^\d+]/g, '') : '');

function extLink(url, label) {
  const u = U.safeUrl(url);
  return u ? el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', class: 'btn small', text: label || 'Apri il link' }) : null;
}

// ---------- selettori riutilizzabili ----------
function catPicker(initial) {
  let cur = U.CATEGORIES[initial] ? initial : 'attivita';
  const wrap = el('div', { class: 'seg' });
  const render = () => {
    clear(wrap);
    for (const k of U.CAT_KEYS) wrap.append(chip(`${U.CATEGORIES[k].icon} ${U.CATEGORIES[k].label}`, cur === k, () => { cur = k; render(); wrap.dispatchEvent(new Event('change', { bubbles: true })); }, `cat-${k}`));
  };
  render();
  return { node: wrap, get value() { return cur; }, set(v) { if (U.CATEGORIES[v]) { cur = v; render(); } } };
}
const statusSelect = (v) => select(U.STATUS_KEYS.map((k) => [k, `${U.STATUSES[k].icon} ${U.STATUSES[k].label}`]), U.STATUSES[v] ? v : 'da_valutare');
const tripSelect = (ctx, v) => select([['', 'Nessun viaggio'], ...ctx.data().trips.map((t) => [t.id, t.name])], v || '');

// Blocco "dove si trova": indirizzo + coordinate con 4 modi per impostarle
function locationBlock(ctx, init, getName, getSheet) {
  let geo = { lat: Number.isFinite(init.lat) ? init.lat : null, lng: Number.isFinite(init.lng) ? init.lng : null };
  const addr = text(init.address, 'Via, numero, città');
  const info = el('div', { class: 'hint' });
  const results = el('div', { class: 'menu-list' });
  const changed = () => addr.dispatchEvent(new Event('change', { bubbles: true }));
  const refresh = () => { info.textContent = geo.lat != null ? `📍 Posizione sulla mappa: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : 'Nessuna posizione sulla mappa ancora.'; };
  const set = (lat, lng) => { geo = { lat, lng }; refresh(); clear(results); changed(); };
  const busy = (b, on) => { b.disabled = on; };

  const find = async (b, auto) => {
    clear(results);
    if (!addr.value.trim() && !getName().trim()) { if (!auto) toast('Scrivi un indirizzo o il nome del posto.', 'error'); return; }
    busy(b, true);
    try {
      const r = await geocodePlace(getName().trim(), addr.value.trim(), { near: ctx.home() });
      if (!r.length) { if (!auto) results.append(el('div', { class: 'hint', text: 'Nessun risultato: prova a scrivere città e via, oppure scegli sulla mappa.' })); return; }
      if (auto) { set(r[0].lat, r[0].lng); toast('Posizione trovata dall\'indirizzo: controllala sulla mappa'); return; }
      results.append(el('div', { class: 'hint', text: 'Scegli il risultato giusto:' }));
      for (const x of r) results.append(el('button', { type: 'button', class: 'btn small', text: x.label, onclick: () => { set(x.lat, x.lng); if (!addr.value.trim()) { addr.value = x.label; } } }));
    } catch (e) { toast(e.message, 'error'); } finally { busy(b, false); }
  };
  const btnFind = el('button', { type: 'button', class: 'btn small', text: '🔎 Trova da indirizzo', onclick: () => find(btnFind, false) });
  const btnGps = el('button', { type: 'button', class: 'btn small', text: '📡 Uso il GPS', onclick: async () => {
    busy(btnGps, true);
    try {
      const p = await getPosition(); set(p.lat, p.lng);
      if (!addr.value.trim()) { try { const r = await reverseGeocode(p.lat, p.lng); if (r) addr.value = r.label; } catch { /* facoltativo */ } }
    } catch (e) { toast(e.message, 'error'); } finally { busy(btnGps, false); }
  } });
  const btnPick = el('button', { type: 'button', class: 'btn small', text: '🗺️ Scelgo sulla mappa', onclick: async () => {
    const sh = getSheet(); sh.hide(true);
    const p = await ctx.pickOnMap('Tocca la mappa nel punto giusto');
    sh.hide(false);
    if (p) {
      set(p.lat, p.lng);
      if (!addr.value.trim()) { try { const r = await reverseGeocode(p.lat, p.lng); if (r) addr.value = r.label; } catch { /* facoltativo */ } }
    }
  } });
  const btnClear = el('button', { type: 'button', class: 'btn small', text: 'Togli posizione', onclick: () => { geo = { lat: null, lng: null }; refresh(); changed(); } });
  refresh();
  const node = el('div', { class: 'field' }, el('label', { text: 'Indirizzo' }), addr, info, el('div', { class: 'seg' }, btnFind, btnGps, btnPick, btnClear), results);
  return { node, addr, get geo() { return geo; }, set, autoFind: () => find(btnFind, true) };
}

// Ricorrenza libera
function recurrenceEditor(initial, getStart) {
  const rec = U.sanitizeRec(initial);
  const freq = select([['none', 'Non si ripete'], ['daily', 'Ogni giorno'], ['weekly', 'Ogni settimana'], ['monthly', 'Ogni mese'], ['yearly', 'Ogni anno']], rec.freq);
  const interval = el('input', { type: 'number', min: 1, max: 99, value: String(rec.interval || 1), inputmode: 'numeric' });
  let wds = new Set(rec.byWeekday || []);
  const wdWrap = el('div', { class: 'seg' });
  const mode = el('select');
  const endKind = select([['never', 'Non finisce mai'], ['until', 'Fino al giorno'], ['count', 'Per un numero di volte']], rec.until ? 'until' : rec.count ? 'count' : 'never');
  const until = el('input', { type: 'date', value: rec.until || '' });
  const count = el('input', { type: 'number', min: 1, max: 999, value: String(rec.count || 10), inputmode: 'numeric' });
  const summary = el('div', { class: 'hint' });
  const box = el('div', { class: 'field' });

  const drawWd = () => {
    clear(wdWrap);
    U.DOW_SHORT.forEach((d, i) => wdWrap.append(chip(d, wds.has(i), () => { wds.has(i) ? wds.delete(i) : wds.add(i); drawWd(); update(); })));
  };
  const drawMode = () => {
    const keep = mode.value || rec.monthlyMode;
    clear(mode);
    const s = getStart();
    const n = s ? U.nthIndexOf(s) : 1;
    const ord = { 1: 'primo', 2: 'secondo', 3: 'terzo', 4: 'quarto', '-1': 'ultimo' }[n] || 'primo';
    mode.append(el('option', { value: 'dom', text: s ? `Il giorno ${U.parseYmd(s).d} di ogni mese` : 'Lo stesso giorno del mese' }));
    mode.append(el('option', { value: 'nth', text: s ? `Il ${ord} ${U.DOW_LONG[U.weekday(s)]} del mese` : 'Es. il primo sabato del mese' }));
    mode.value = keep === 'nth' ? 'nth' : 'dom';
  };
  const get = () => {
    if (freq.value === 'none') return { freq: 'none' };
    const s = getStart();
    return U.sanitizeRec({
      freq: freq.value, interval: +interval.value || 1, byWeekday: [...wds], monthlyMode: mode.value,
      nth: mode.value === 'nth' && s ? U.nthIndexOf(s) : 0,
      until: endKind.value === 'until' ? until.value : '', count: endKind.value === 'count' ? +count.value || 0 : 0, exdates: rec.exdates,
    });
  };
  function update() {
    const f = freq.value;
    interval.parentElement.hidden = f === 'none';
    wdWrap.parentElement.hidden = f !== 'weekly';
    mode.parentElement.hidden = f !== 'monthly';
    endKind.parentElement.hidden = f === 'none';
    until.hidden = endKind.value !== 'until' || f === 'none';
    count.hidden = endKind.value !== 'count' || f === 'none';
    const s = getStart();
    summary.textContent = f === 'none' ? '' : (s ? U.describeRecurrence(get(), s) : 'Imposta prima la data di inizio.');
  }
  drawWd(); drawMode();
  box.append(el('div', { class: 'lbl', text: 'Ripetizione' }), freq,
    field('Ogni quanti (giorni / settimane / mesi / anni)', interval), field('Nei giorni', wdWrap), field('Come ripetere nel mese', mode),
    field('Fine', endKind), until, count, summary);
  freq.addEventListener('change', update); interval.addEventListener('input', update); mode.addEventListener('change', update);
  endKind.addEventListener('change', update); until.addEventListener('input', update); count.addEventListener('input', update);
  update();
  return { node: box, get, refresh() { drawMode(); update(); } };
}

// ============================================================
//   EVENTO
// ============================================================
export function openEventForm(ctx, draft = {}, { isNew = true, thumb = null, note = '' } = {}) {
  const d = U.sanitizeDoc('events', { ...draft });
  if (isNew) { d.title = draft.title || ''; }      // una bozza letta da foto/testo ha già un id, ma il titolo vuoto resta vuoto
  let dirty = !!note || isNew && !!draft.title;
  let sh;
  const state = { thumb };
  const title = text(d.title, 'Titolo dell\'evento');
  const cat = catPicker(d.category);
  const status = statusSelect(d.status);
  const allDay = el('input', { type: 'checkbox', checked: d.allDay, style: { width: '22px', height: '22px', minHeight: 0 } });
  const sDate = el('input', { type: 'date', value: d.startDate }), sTime = el('input', { type: 'time', value: d.startTime });
  const eDate = el('input', { type: 'date', value: d.endDate }), eTime = el('input', { type: 'time', value: d.endTime });
  const venue = text(d.venue, 'Nome del posto (es. Piazza Libertà)');
  const loc = locationBlock(ctx, d, () => venue.value || title.value, () => sh);
  const link = el('input', { type: 'url', value: d.link, placeholder: 'https://…', autocomplete: 'off' });
  const price = text(d.price, 'es. Gratuito, 5 €');
  const organizer = text(d.organizer, 'Chi lo organizza');
  const contacts = text(d.contacts, 'Telefono, e-mail, …');
  const desc = area(d.description, 'Descrizione completa: programma, ospiti, cosa portare…', 8);
  const notes = area(d.notes, 'Note personali', 3);
  const trip = tripSelect(ctx, d.tripId);
  const rec = recurrenceEditor(d.rec, () => sDate.value);
  const thumbBox = el('div');
  const noteBox = el('div');

  const drawThumb = () => {
    clear(thumbBox);
    if (state.thumb) thumbBox.append(el('div', { class: 'lbl', text: 'Locandina (tocca per ingrandire)' }), thumbImg(state.thumb));
  };
  const drawNote = (t, kind = 'warn') => { clear(noteBox); if (t) noteBox.append(el('div', { class: kind, text: t })); };
  drawThumb(); drawNote(note);
  const timeRow = el('div', { class: 'grid2' }, field('Ora di inizio', sTime), field('Ora di fine', eTime));
  const syncAllDay = () => { timeRow.hidden = allDay.checked; };
  allDay.addEventListener('change', syncAllDay); syncAllDay();
  sDate.addEventListener('input', () => { if (eDate.value && eDate.value < sDate.value) eDate.value = ''; rec.refresh(); });

  function applyDraft(x, newThumb) {
    const set = (inp, v) => { if (v) inp.value = v; };
    set(title, x.title); set(sDate, x.startDate); set(sTime, x.startTime); set(eDate, x.endDate); set(eTime, x.endTime);
    set(venue, x.venue); set(loc.addr, x.address); set(link, x.link); set(price, x.price); set(organizer, x.organizer); set(contacts, x.contacts);
    set(desc, x.description); if (x.notes && !notes.value) notes.value = x.notes;
    if (x.category) cat.set(x.category);
    if (Number.isFinite(x.lat) && Number.isFinite(x.lng)) loc.set(x.lat, x.lng);
    if (newThumb) { state.thumb = newThumb; drawThumb(); }
    rec.refresh();
    dirty = true;
    if (!loc.geo.lat && loc.addr.value.trim()) loc.autoFind();
  }

  const autoBtns = isNew ? el('div', { class: 'grid2' },
    el('button', { type: 'button', class: 'btn small', text: '📸 Compila da foto', onclick: async () => {
      const f = await ctx.pickImage(); if (!f) return;
      try { const r = await ctx.readImage(f, (m) => drawNote(m, 'hint')); drawNote(r.note); applyDraft(r.draft, r.thumb); } catch (e) { drawNote(e.message, 'err'); }
    } }),
    el('button', { type: 'button', class: 'btn small', text: '📋 Compila da testo/link', onclick: () => {
      const ta = area('', 'Incolla qui il testo dell\'evento o un link…', 6);
      const go = el('button', { type: 'button', class: 'btn primary', text: 'Leggi' });
      const s2 = openSheet({ title: 'Compila da testo o link', body: [ta], footer: [go] });
      go.addEventListener('click', async () => { try { const r = await ctx.readText(ta.value); s2.forceClose(); drawNote(r.note); applyDraft(r.draft); } catch (e) { toast(e.message, 'error'); } });
    } })) : null;

  const body = [
    autoBtns, noteBox, thumbBox,
    field('Titolo *', title), field('Categoria', cat.node), field('Stato', status),
    el('div', { class: 'grid2' }, field('Data di inizio', sDate), field('Data di fine (se più giorni)', eDate)),
    el('label', { class: 'chk' }, allDay, el('span', { text: 'Tutto il giorno' })), timeRow,
    rec.node,
    field('Nome del posto', venue), loc.node,
    field('Link dell\'evento', link), field('Prezzo', price), field('Organizzatore', organizer), field('Contatti', contacts),
    field('Descrizione', desc), field('Note personali', notes), field('Viaggio', trip),
  ];

  const save = async () => {
    if (!title.value.trim()) { toast('Scrivi il titolo.', 'error'); title.focus(); return; }
    if (link.value.trim() && !U.safeUrl(link.value)) { toast('Il link non è valido (deve iniziare con https://).', 'error'); return; }
    if (sDate.value && eDate.value && eDate.value < sDate.value) { toast('La data di fine è prima di quella di inizio.', 'error'); return; }
    const doc = U.sanitizeDoc('events', {
      ...(isNew ? {} : draft), id: draft.id, createdAt: draft.createdAt,
      title: title.value, category: cat.value, status: status.value, description: desc.value, notes: notes.value,
      startDate: sDate.value, startTime: allDay.checked ? '' : sTime.value, endDate: eDate.value, endTime: allDay.checked ? '' : eTime.value, allDay: allDay.checked,
      rec: rec.get(), venue: venue.value, address: loc.addr.value, lat: loc.geo.lat, lng: loc.geo.lng,
      link: link.value, price: price.value, organizer: organizer.value, contacts: contacts.value, tripId: trip.value,
      source: draft.source || 'manuale', hasThumb: !!state.thumb || !!draft.hasThumb,
    });
    ctx.store.put('events', doc);
    if (state.thumb && state.thumb !== thumb) { try { await ctx.store.putThumb(doc.id, state.thumb); } catch (e) { toast('Evento salvato, ma non l\'anteprima: ' + e.message, 'error'); } }
    else if (state.thumb && isNew) { try { await ctx.store.putThumb(doc.id, state.thumb); } catch { /* ignora */ } }
    dirty = false; sh.forceClose();
    toast(isNew ? 'Evento salvato' : 'Evento aggiornato');
    ctx.afterSave('events', doc);
  };
  const footer = [el('button', { type: 'button', class: 'btn primary', text: 'Salva', onclick: save })];
  if (!isNew) footer.unshift(el('button', { type: 'button', class: 'btn danger', text: 'Elimina', onclick: async () => {
    if (await confirmDialog(`Eliminare "${draft.title}"?`, { ok: 'Elimina', danger: true })) { ctx.store.remove('events', draft.id); dirty = false; sh.forceClose(); toast('Evento eliminato'); }
  } }));
  sh = openSheet({ title: isNew ? 'Nuovo evento' : 'Modifica evento', body, footer, guard: () => dirty, backdropClose: false });
  sh.body.addEventListener('input', () => { dirty = true; });
  sh.body.addEventListener('change', () => { dirty = true; });
  if (isNew && loc.addr.value.trim() && loc.geo.lat == null) loc.autoFind();
  return sh;
}

// ============================================================
//   LUOGO
// ============================================================
export function openPlaceForm(ctx, draft = {}, { isNew = true, thumb = null, note = '' } = {}) {
  const d = U.sanitizeDoc('places', { ...draft });
  if (isNew) d.name = draft.name || '';
  let dirty = !!note || (isNew && !!draft.name);
  let sh;
  const name = text(d.name, 'Nome del luogo');
  const cat = catPicker(d.category);
  const status = statusSelect(d.status);
  const loc = locationBlock(ctx, d, () => name.value, () => sh);
  const link = el('input', { type: 'url', value: d.link, placeholder: 'https://…', autocomplete: 'off' });
  const phone = text(d.phone, 'Telefono');
  const hours = text(d.hours, 'es. Lun–Ven 9–18, chiuso domenica');
  const price = text(d.price, 'es. € 10–20 a persona');
  const rating = select([['0', 'Nessun voto'], ['1', '★'], ['2', '★★'], ['3', '★★★'], ['4', '★★★★'], ['5', '★★★★★']], String(d.rating || 0));
  const desc = area(d.description, 'Descrizione completa: cosa c\'è, cosa provare, consigli…', 8);
  const notes = area(d.notes, 'Note personali', 3);
  const trip = tripSelect(ctx, d.tripId);
  const noteBox = note ? el('div', { class: 'warn', text: note }) : null;
  const body = [noteBox, field('Nome *', name), field('Categoria', cat.node), field('Stato', status), loc.node, field('Link / sito', link), field('Telefono', phone), field('Orari di apertura', hours), field('Prezzo', price), field('Il tuo voto', rating), field('Descrizione', desc), field('Note personali', notes), field('Viaggio', trip)];
  const save = () => {
    if (!name.value.trim()) { toast('Scrivi il nome.', 'error'); name.focus(); return; }
    if (link.value.trim() && !U.safeUrl(link.value)) { toast('Il link non è valido (deve iniziare con https://).', 'error'); return; }
    const doc = U.sanitizeDoc('places', {
      ...(isNew ? {} : draft), id: draft.id, createdAt: draft.createdAt,
      name: name.value, category: cat.value, status: status.value, description: desc.value, notes: notes.value, address: loc.addr.value,
      lat: loc.geo.lat, lng: loc.geo.lng, link: link.value, phone: phone.value, hours: hours.value, price: price.value, rating: +rating.value, tripId: trip.value,
    });
    ctx.store.put('places', doc);
    dirty = false; sh.forceClose();
    toast(isNew ? 'Luogo salvato' : 'Luogo aggiornato');
    ctx.afterSave('places', doc);
  };
  const footer = [el('button', { type: 'button', class: 'btn primary', text: 'Salva', onclick: save })];
  if (!isNew) footer.unshift(el('button', { type: 'button', class: 'btn danger', text: 'Elimina', onclick: async () => {
    if (await confirmDialog(`Eliminare "${draft.name}"?`, { ok: 'Elimina', danger: true })) { ctx.store.remove('places', draft.id); dirty = false; sh.forceClose(); toast('Luogo eliminato'); }
  } }));
  sh = openSheet({ title: isNew ? 'Nuovo luogo' : 'Modifica luogo', body, footer, guard: () => dirty, backdropClose: false });
  sh.body.addEventListener('input', () => { dirty = true; });
  sh.body.addEventListener('change', () => { dirty = true; });
  if (isNew && loc.geo.lat == null && (loc.addr.value.trim() || name.value.trim())) loc.autoFind();
  return sh;
}

// ============================================================
//   SCHEDE DI DETTAGLIO
// ============================================================
function statusChips(current, onPick) {
  return el('div', { class: 'seg' }, U.STATUS_KEYS.map((k) => chip(`${U.STATUSES[k].icon} ${U.STATUSES[k].label}`, current === k, () => onPick(k), `st-${k}`)));
}
const kv = (rows) => el('dl', { class: 'kv' }, rows.filter((r) => r && r[1]).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', null, v)]));

function liveSheet(ctx, { title, render, getItem, footer }) {
  const sh = openSheet({ title, body: [], footer, onClose: () => off() });
  const off = ctx.store.onChange(() => {
    if (!sh.open) return;
    if (!getItem()) { sh.forceClose(); return; }
    sh.setTitle(title(getItem()));
    sh.setBody(...render(getItem(), sh));
  });
  return sh;
}

export function openEventDetail(ctx, id, occDate) {
  const get = () => ctx.data().allEvents.find((e) => e.id === id);
  if (!get()) return null;
  const render = (ev, sh) => {
    const dur = ev.endDate && ev.startDate ? U.diffDays(ev.endDate, ev.startDate) : 0;
    const start = occDate || ev.startDate;
    const when = start ? [U.formatRangeIt(start, dur ? U.addDays(start, dur) : ''), ev.allDay ? 'tutto il giorno' : [ev.startTime, ev.endTime].filter(Boolean).join('–')].filter(Boolean).join(' · ') : 'Data da definire';
    const rec = U.describeRecurrence(ev.rec, ev.startDate);
    const tripName = (ctx.data().trips.find((t) => t.id === ev.tripId) || {}).name;
    const out = [
      el('div', null, el('span', { class: `tag cat-${U.CATEGORIES[ev.category] ? ev.category : 'attivita'}`, text: `${catOf(ev.category).icon} ${catOf(ev.category).label}` })),
      statusChips(ev.status, (k) => ctx.setStatus('events', ev, k)),
      kv([['Quando', when], ['Ripetizione', rec], ['Dove', [ev.venue, ev.address].filter(Boolean).join('\n')], ['Prezzo', ev.price], ['Organizzatore', ev.organizer], ['Contatti', ev.contacts], ['Viaggio', tripName]]),
    ];
    if (ev.description) out.push(el('div', { class: 'field' }, el('div', { class: 'lbl', text: 'Descrizione' }), el('div', { text: ev.description, style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } })));
    if (ev.notes) out.push(el('div', { class: 'field' }, el('div', { class: 'lbl', text: 'Note personali' }), el('div', { text: ev.notes, style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } })));
    const acts = [extLink(ev.link, '🔗 Apri il link dell\'evento')];
    if (Number.isFinite(ev.lat)) acts.push(el('button', { type: 'button', class: 'btn small', text: '🗺️ Mostra sulla mappa', onclick: () => { sh.forceClose(); ctx.showOnMap(ev.lat, ev.lng); } }));
    if (Number.isFinite(ev.lat)) acts.push(el('a', { class: 'btn small', target: '_blank', rel: 'noopener noreferrer', href: `https://www.openstreetmap.org/?mlat=${ev.lat}&mlon=${ev.lng}#map=17/${ev.lat}/${ev.lng}`, text: '↗ Apri in OpenStreetMap' }));
    out.push(el('div', { class: 'seg' }, acts));
    if (ev.rec && ev.rec.freq !== 'none' && occDate) {
      out.push(el('button', { type: 'button', class: 'btn small', text: `Salta solo questa data (${U.formatDateIt(occDate, false)})`, onclick: async () => {
        if (await confirmDialog('Questa data verrà tolta dal calendario; le altre restano.', { ok: 'Salta questa data' })) {
          const c = clone(ev); c.rec.exdates = [...new Set([...(c.rec.exdates || []), occDate])]; ctx.store.put('events', c); sh.forceClose();
        }
      } }));
    }
    if (ev.hasThumb) {
      const holder = el('div', null, el('div', { class: 'hint', text: 'Carico l\'anteprima…' }));
      ctx.store.getThumb(ev.id).then((img) => { clear(holder); if (img) holder.append(el('div', { class: 'lbl', text: 'Locandina (tocca per ingrandire)' }), thumbImg(img)); else holder.append(el('div', { class: 'hint', text: 'L\'anteprima della locandina non è disponibile (non ancora sincronizzata o rimossa).' })); });
      out.push(holder);
    }
    return out;
  };
  return liveSheet(ctx, {
    title: (ev) => ev.title, render, getItem: get,
    footer: [el('button', { type: 'button', class: 'btn primary', text: '✎ Modifica', onclick: () => { const ev = get(); if (ev) openEventForm(ctx, ev, { isNew: false }); } })],
  });
}

export function openPlaceDetail(ctx, id) {
  const get = () => ctx.data().allPlaces.find((p) => p.id === id);
  if (!get()) return null;
  const render = (p, sh) => {
    const tripName = (ctx.data().trips.find((t) => t.id === p.tripId) || {}).name;
    const km = ctx.home() && Number.isFinite(p.lat) ? U.haversineKm(ctx.home(), p) : null;
    const tel = telHref(p.phone);
    const out = [
      el('div', null, el('span', { class: `tag cat-${U.CATEGORIES[p.category] ? p.category : 'attivita'}`, text: `${catOf(p.category).icon} ${catOf(p.category).label}` })),
      statusChips(p.status, (k) => ctx.setStatus('places', p, k)),
      kv([['Indirizzo', p.address], ['Distanza', km != null ? `${km < 10 ? km.toFixed(1) : Math.round(km)} km da casa (in linea d'aria)` : ''], ['Orari', p.hours], ['Prezzo', p.price],
        ['Telefono', tel ? el('a', { href: tel, text: p.phone }) : p.phone], ['Il tuo voto', p.rating ? '★'.repeat(Math.round(p.rating)) : ''], ['Viaggio', tripName]]),
    ];
    if (p.description) out.push(el('div', { class: 'field' }, el('div', { class: 'lbl', text: 'Descrizione' }), el('div', { text: p.description, style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } })));
    if (p.notes) out.push(el('div', { class: 'field' }, el('div', { class: 'lbl', text: 'Note personali' }), el('div', { text: p.notes, style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } })));
    const acts = [extLink(p.link, '🔗 Apri il sito')];
    if (Number.isFinite(p.lat)) {
      acts.push(el('button', { type: 'button', class: 'btn small', text: '🗺️ Mostra sulla mappa', onclick: () => { sh.forceClose(); ctx.showOnMap(p.lat, p.lng); } }));
      acts.push(el('a', { class: 'btn small', target: '_blank', rel: 'noopener noreferrer', href: `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`, text: '↗ Apri in OpenStreetMap' }));
    }
    out.push(el('div', { class: 'seg' }, acts));
    return out;
  };
  return liveSheet(ctx, {
    title: (p) => p.name, render, getItem: get,
    footer: [el('button', { type: 'button', class: 'btn primary', text: '✎ Modifica', onclick: () => { const p = get(); if (p) openPlaceForm(ctx, p, { isNew: false }); } })],
  });
}

// ============================================================
//   VIAGGI
// ============================================================
export function openTripForm(ctx, draft = {}) {
  const isNew = !draft.id;
  const d = U.sanitizeDoc('trips', { ...draft });
  const name = text(isNew ? '' : d.name, 'es. Giappone 2027');
  const sDate = el('input', { type: 'date', value: d.startDate }), eDate = el('input', { type: 'date', value: d.endDate });
  const notes = area(d.notes, 'Note generali, prenotazioni, contatti utili…', 5);
  const sh = openSheet({
    title: isNew ? 'Nuovo viaggio' : 'Modifica viaggio',
    body: [field('Nome *', name), el('div', { class: 'grid2' }, field('Partenza', sDate), field('Ritorno', eDate)), field('Note', notes)],
    footer: [el('button', { type: 'button', class: 'btn primary', text: 'Salva', onclick: () => {
      if (!name.value.trim()) return toast('Scrivi il nome del viaggio.', 'error');
      if (sDate.value && eDate.value && eDate.value < sDate.value) return toast('Il ritorno è prima della partenza.', 'error');
      const t = U.sanitizeDoc('trips', { ...(isNew ? {} : draft), id: draft.id, createdAt: draft.createdAt, name: name.value, startDate: sDate.value, endDate: eDate.value, notes: notes.value });
      ctx.store.put('trips', t); sh.forceClose(); toast('Viaggio salvato');
      if (isNew) openTripView(ctx, t.id);
    } })],
  });
}

export function openTripView(ctx, id) {
  const get = () => ctx.data().trips.find((t) => t.id === id);
  if (!get()) return null;
  const update = (fn) => { const t = clone(get()); fn(t); ctx.store.put('trips', t); };
  const render = (t, sh) => {
    const items = [...ctx.data().allPlaces.filter((p) => p.tripId === id).map((p) => ({ kind: 'place', p })), ...ctx.data().allEvents.filter((e) => e.tripId === id).map((e) => ({ kind: 'event', e }))];
    const out = [];
    out.push(kv([['Date', U.formatRangeIt(t.startDate, t.endDate)], ['Note', t.notes]]));
    out.push(el('div', { class: 'seg' },
      el('button', { type: 'button', class: 'btn small', text: '✎ Modifica', onclick: () => openTripForm(ctx, t) }),
      el('button', { type: 'button', class: 'btn small', text: '🗺️ Solo questo viaggio sulla mappa', onclick: () => { sh.forceClose(); ctx.filterTrip(id); } }),
      el('button', { type: 'button', class: 'btn small danger', text: 'Elimina viaggio', onclick: async () => {
        if (!(await confirmDialog(`Eliminare il viaggio "${t.name}"? Luoghi ed eventi collegati restano salvati.`, { ok: 'Elimina', danger: true }))) return;
        for (const p of ctx.data().allPlaces.filter((x) => x.tripId === id)) ctx.store.put('places', { ...p, tripId: '' });
        for (const e of ctx.data().allEvents.filter((x) => x.tripId === id)) ctx.store.put('events', { ...e, tripId: '' });
        ctx.store.remove('trips', id); sh.forceClose(); toast('Viaggio eliminato');
      } })));

    // --- luoghi ed eventi collegati ---
    out.push(el('div', { class: 'sub', text: `Luoghi ed eventi (${items.length})` }));
    for (const it of items) {
      out.push(it.kind === 'place'
        ? placeRow(it.p, { onOpen: (p) => openPlaceDetail(ctx, p.id), onStatus: ctx.setStatus, home: ctx.home() })
        : eventRow({ ev: it.e, date: it.e.startDate || '', endDate: it.e.endDate }, { onOpen: (e) => openEventDetail(ctx, e.id, ''), onStatus: ctx.setStatus }));
    }
    const free = [...ctx.data().allPlaces.filter((p) => !p.tripId).map((p) => ['place:' + p.id, `📍 ${p.name}`]), ...ctx.data().allEvents.filter((e) => !e.tripId).map((e) => ['event:' + e.id, `📅 ${e.title}`])];
    if (free.length) {
      const sel = select([['', 'Collega un luogo o evento già salvato…'], ...free], '');
      sel.addEventListener('change', () => {
        const [k, rid] = sel.value.split(':');
        if (k === 'place') { const p = ctx.data().allPlaces.find((x) => x.id === rid); if (p) ctx.store.put('places', { ...p, tripId: id }); }
        if (k === 'event') { const e = ctx.data().allEvents.find((x) => x.id === rid); if (e) ctx.store.put('events', { ...e, tripId: id }); }
      });
      out.push(sel);
    }

    // --- itinerario giorno per giorno ---
    out.push(el('div', { class: 'sub', text: 'Itinerario giorno per giorno' }));
    const byDate = new Map();
    for (const i of t.itinerary) { const k = i.date || ''; if (!byDate.has(k)) byDate.set(k, []); byDate.get(k).push(i); }
    for (const k of [...byDate.keys()].sort()) {
      out.push(el('div', { class: 'day-head', text: k ? U.formatDateIt(k) : 'Senza data' }));
      for (const i of byDate.get(k).sort((a, b) => (a.time || '').localeCompare(b.time || ''))) {
        out.push(el('div', { class: 'chk' }, el('span', { text: `${i.time ? i.time + ' — ' : ''}${i.text}` }),
          el('button', { type: 'button', class: 'x-btn', 'aria-label': 'Togli', text: '✕', onclick: () => update((x) => { x.itinerary = x.itinerary.filter((y) => y.id !== i.id); }) })));
      }
    }
    const iDate = el('input', { type: 'date', value: t.startDate || '' }), iTime = el('input', { type: 'time' }), iText = text('', 'Cosa fai (es. Visita al castello)');
    const refs = select([['', 'Collega a un luogo/evento (facoltativo)'], ...items.map((it) => (it.kind === 'place' ? ['place:' + it.p.id, '📍 ' + it.p.name] : ['event:' + it.e.id, '📅 ' + it.e.title]))], '');
    out.push(el('div', { class: 'field' }, el('div', { class: 'grid2' }, iDate, iTime), iText, refs,
      el('button', { type: 'button', class: 'btn small', text: '＋ Aggiungi all\'itinerario', onclick: () => {
        const [rt, rid] = refs.value ? refs.value.split(':') : ['', ''];
        const label = iText.value.trim() || (rt === 'place' ? (items.find((z) => z.p && z.p.id === rid) || {}).p?.name : rt === 'event' ? (items.find((z) => z.e && z.e.id === rid) || {}).e?.title : '');
        if (!label) return toast('Scrivi cosa fai o scegli un luogo.', 'error');
        update((x) => { x.itinerary.push({ id: U.uid(), date: iDate.value, time: iTime.value, text: label, refType: rt, refId: rid || '' }); });
        iText.value = '';
      } })));

    // --- budget ---
    const total = t.budget.reduce((s, b) => s + b.amount, 0), paid = t.budget.filter((b) => b.paid).reduce((s, b) => s + b.amount, 0);
    out.push(el('div', { class: 'sub', text: `Budget — totale ${money(total)}, già pagato ${money(paid)}` }));
    for (const b of t.budget) {
      out.push(el('div', { class: 'chk' + (b.paid ? ' done' : '') },
        el('input', { type: 'checkbox', checked: b.paid, 'aria-label': 'Pagato', onchange: (e) => update((x) => { x.budget.find((y) => y.id === b.id).paid = e.target.checked; }) }),
        el('span', { text: `${b.label} — ${money(b.amount)}` }),
        el('button', { type: 'button', class: 'x-btn', 'aria-label': 'Togli', text: '✕', onclick: () => update((x) => { x.budget = x.budget.filter((y) => y.id !== b.id); }) })));
    }
    const bLabel = text('', 'Voce (es. Volo, Hotel)'), bAmt = el('input', { type: 'number', min: 0, step: '0.01', inputmode: 'decimal', placeholder: 'Importo €' });
    out.push(el('div', { class: 'field' }, el('div', { class: 'grid2' }, bLabel, bAmt),
      el('button', { type: 'button', class: 'btn small', text: '＋ Aggiungi voce', onclick: () => {
        if (!bLabel.value.trim()) return toast('Scrivi la voce.', 'error');
        update((x) => { x.budget.push({ id: U.uid(), label: bLabel.value.trim(), amount: +bAmt.value || 0, paid: false }); });
        bLabel.value = ''; bAmt.value = '';
      } })));

    // --- valigia ---
    const done = t.packing.filter((p) => p.done).length;
    out.push(el('div', { class: 'sub', text: `Cose da portare — ${done}/${t.packing.length}` }));
    for (const p of t.packing) {
      out.push(el('div', { class: 'chk' + (p.done ? ' done' : '') },
        el('input', { type: 'checkbox', checked: p.done, 'aria-label': p.text, onchange: (e) => update((x) => { x.packing.find((y) => y.id === p.id).done = e.target.checked; }) }),
        el('span', { text: p.text }),
        el('button', { type: 'button', class: 'x-btn', 'aria-label': 'Togli', text: '✕', onclick: () => update((x) => { x.packing = x.packing.filter((y) => y.id !== p.id); }) })));
    }
    const pText = text('', 'es. Passaporto, caricabatterie');
    out.push(el('div', { class: 'field' }, pText, el('button', { type: 'button', class: 'btn small', text: '＋ Aggiungi', onclick: () => {
      if (!pText.value.trim()) return;
      update((x) => { x.packing.push({ id: U.uid(), text: pText.value.trim(), done: false }); });
      pText.value = '';
    } })));
    return out;
  };
  return liveSheet(ctx, { title: (t) => `🧳 ${t.name}`, render, getItem: get });
}

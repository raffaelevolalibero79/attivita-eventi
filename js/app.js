// app.js — avvio dell'app: collega archivio, calendario, mappa, filtri ed elenchi.
import { el, clear, $, toast, openSheet, closeAllSheets, chip, select } from './ui.js';
import * as U from './util.js';
import { createStore, cloudConfigured, setLocalOnly } from './store.js';
import { createCalendar } from './calendar.js';
import { createMapView } from './mapview.js';
import { createSections } from './sections.js';
import { openEventForm, openPlaceForm, openEventDetail, openPlaceDetail, openTripForm, openTripView } from './forms.js';
import { openAddMenu, readImage, readText, openPlaceFromMaps, pickImageFromUser, takePhoto } from './capture.js';
import { loadSeen, isNew as isNewDoc, markSeen as markSeenDoc, markAllSeen, describe } from './news.js';
import { openSettings, getHome, getSettings, statusText } from './settings.js';
import { getPosition, reverseGeocode } from './geo.js';
import { initEditTools } from './edittools.js';

const FILTER_KEY = 'ae.filters';
const defaultFilters = () => ({ cats: [...U.CAT_KEYS], status: 'all', km: 0, trip: '', q: '', more: false });
function loadFilters() {
  try {
    const o = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}');
    const f = defaultFilters();
    if (Array.isArray(o.cats)) { f.cats = o.cats.filter((c) => U.CATEGORIES[c]); if (o.v !== 2 && !f.cats.includes('luoghi')) f.cats.push('luoghi'); }   // v2: esiste la categoria "Luoghi"
    if (['all', ...U.STATUS_KEYS].includes(o.status)) f.status = o.status;
    if ([0, 5, 10, 25, 50, 100, 250].includes(o.km)) f.km = o.km;
    return f;
  } catch { return defaultFilters(); }
}
const saveFilters = (f) => { try { localStorage.setItem(FILTER_KEY, JSON.stringify({ v: 2, cats: f.cats, status: f.status, km: f.km })); } catch { /* ignora */ } };

async function main() {
  initEditTools();
  const store = createStore();
  const gate = $('#gate');
  const showGate = (...kids) => { clear(gate).append(...kids); gate.hidden = false; };
  const hideGate = () => { gate.hidden = true; };

  let initInfo;
  try { initInfo = await store.init(); } catch (e) {
    console.error(e);
    showGate(el('h2', { text: 'Non riesco a collegarmi' }),
      el('p', { text: store.mode === 'cloud' ? 'Non riesco a raggiungere il servizio di sincronizzazione. Controlla la connessione e riprova.' : 'Non riesco ad aprire l\'archivio di questo telefono.' }),
      el('button', { class: 'btn primary', text: 'Riprova', onclick: () => location.reload() }),
      store.mode === 'cloud' ? el('button', { class: 'btn', text: 'Usa solo questo telefono', onclick: () => { setLocalOnly(true); location.reload(); } }) : null);
    return;
  }

  // ---------- accesso (solo con sincronizzazione) ----------
  const loginGate = () => showGate(
    el('h2', { text: 'Attività ed eventi' }),
    el('p', { text: 'Accedi con il tuo account Google per vedere e modificare luoghi ed eventi della famiglia. Solo gli indirizzi autorizzati possono entrare.' }),
    el('button', { class: 'btn primary', text: 'Accedi con Google', onclick: async () => { try { await store.signIn(); } catch (e) { toast('Accesso non riuscito: ' + (e.code || e.message), 'error'); } } }),
    cloudConfigured() ? el('button', { class: 'btn small', text: 'Usa solo questo telefono', onclick: () => { setLocalOnly(true); location.reload(); } }) : null);
  const deniedGate = () => showGate(
    el('h2', { text: 'Account non autorizzato' }),
    el('p', { text: `L'indirizzo ${store.user ? store.user.email : ''} non è nell'elenco della famiglia (o l'elenco non è ancora stato creato). Chiedi all'altra persona di aggiungerlo dalle Impostazioni, oppure controlla la guida.` }),
    el('button', { class: 'btn primary', text: 'Esci e usa un altro account', onclick: () => store.signOut() }));

  if (store.mode === 'cloud') {
    store.onAuth((u) => { if (!u) loginGate(); else if (store.status !== 'denied') hideGate(); });
    if (initInfo.needsLogin) loginGate();
  }

  // ---------- stato e filtri ----------
  const filters = loadFilters();
  let data = { allEvents: [], allPlaces: [], trips: [], fEvents: [], calEvents: [], fPlaces: [] };
  const seenState = loadSeen(localStorage);
  let stale = true;   // true = i dati filtrati vanno ricalcolati prima di essere usati
  store.onChange(() => { stale = true; });   // registrato per primo: le schede aperte leggono sempre dati aggiornati

  const text = (...v) => v.filter(Boolean).join(' ').toLowerCase();
  const evText = (e) => text(e.title, e.venue, e.address, e.description, e.organizer, e.notes);
  function applyFilters() {
    stale = false;
    const s = store.state;
    const home = getHome();
    const q = filters.q.trim().toLowerCase();
    const okCat = (x) => filters.cats.includes(x.category);
    const okSt = (x) => filters.status === 'all' || x.status === filters.status;
    const okTrip = (x) => !filters.trip || x.tripId === filters.trip;
    const okKm = (x) => !filters.km || !home || (Number.isFinite(x.lat) && U.haversineKm(home, x) <= filters.km);
    const okQ = (hay) => !q || hay.includes(q);
    data = {
      allEvents: s.events, allPlaces: s.places, trips: s.trips,
      fEvents: s.events.filter((e) => okCat(e) && okSt(e) && okTrip(e) && okKm(e) && okQ(evText(e))),
      // Il calendario mostra sempre ogni evento con una data, qualunque sia il suo stato (il filtro "stato" non lo nasconde)
      calEvents: s.events.filter((e) => okCat(e) && okTrip(e) && okKm(e) && okQ(evText(e))),
      fPlaces: s.places.filter((p) => okCat(p) && okSt(p) && okTrip(p) && okKm(p) && okQ(text(p.name, p.address, p.description, p.notes))),
    };
  }

  // ---------- contesto condiviso dai moduli ----------
  let mapApi = null;
  const ctx = {
    store, data: () => { if (stale) applyFilters(); return data; }, home: getHome,
    // novità aggiunte dall'altro telefono e non ancora viste
    isNew: (doc) => isNewDoc(doc, store.authorName(), seenState),
    markSeen: (id) => { const was = seenState.ids.length; markSeenDoc(localStorage, seenState, id); if (seenState.ids.length !== was) { renderNews(); refresh(); } },
    pickOnMap: (m) => (mapApi ? mapApi.pick(m) : Promise.resolve(null)),
    showOnMap: (lat, lng) => { if (mapApi) mapApi.flyTo(lat, lng); },
    pickImage: () => new Promise((resolve) => {
      let chosen = false;       // se si è scelta una delle due voci, la finestra si chiude ma la risposta arriva dopo, a file scelto
      const pick = (fn) => async () => { chosen = true; sh.forceClose(); resolve(await fn()); };
      const sh = openSheet({
        title: 'Da dove prendo la foto?',
        body: el('div', { class: 'menu-list' },
          el('button', { class: 'btn', type: 'button', text: '📷 Scatta ora', onclick: pick(takePhoto) }),
          el('button', { class: 'btn', type: 'button', text: '🖼️ Scegli dalla galleria', onclick: pick(pickImageFromUser) })),
        onClose: () => { if (!chosen) resolve(null); },
      });
    }),
    readImage, readText,
    setStatus: (coll, item, status) => { store.put(coll, { ...item, status }); },
    afterSave: (coll, doc) => {
      if (coll === 'events' && doc.startDate) { calendar.render(ctx.data().calEvents); calendar.goToDate(doc.startDate); }
      if (Number.isFinite(doc.lat) && mapApi) mapApi.flyTo(doc.lat, doc.lng, 14);
    },
    filterTrip: (id) => { filters.trip = id; filters.more = true; renderFilters(); refresh(); toast('Mostro solo questo viaggio: togli il filtro dai "Filtri".'); },
    openEventForm: (d, o) => openEventForm(ctx, d, o),
    openPlaceForm: (d, o) => openPlaceForm(ctx, d, o),
    newPlaceAt: async (p) => {
      let r = null; try { r = await reverseGeocode(p.lat, p.lng); } catch { /* facoltativo */ }
      openPlaceForm(ctx, { name: (r && r.name) || '', address: (r && r.label) || '', lat: p.lat, lng: p.lng }, { isNew: true });
    },
    // Testo o link che arriva da "Condividi" o dall'incolla
    handleIncoming: async (raw, { forDate = '' } = {}) => {
      const urls = U.extractUrls(raw).map(U.safeUrl).filter(Boolean);
      const mapsUrl = urls.find((u) => U.linkKind(u) === 'maps') || null;
      const looksPlace = !!mapsUrl || urls.some((u) => U.parseMapsUrl(u)) || (!urls.length && !!U.parseCoords(raw) && raw.trim().length < 80);
      if (looksPlace) { await openPlaceFromMaps(ctx, raw); return; }
      const r = await readText(raw);
      if (forDate && !r.draft.startDate) r.draft.startDate = forDate;
      openEventForm(ctx, r.draft, { isNew: true, note: r.note });
    },
  };

  // ---------- calendario ----------
  const calendar = createCalendar($('#calendar'), {
    onOpenEvent: (ev, date) => openEventDetail(ctx, ev.id, date),
    onStatus: ctx.setStatus,
    onAddForDate: (d) => openAddMenu(ctx, { forDate: d }),
  });

  // ---------- elenchi a tendina ----------
  const sections = createSections($('#sections'), {
    data: () => ctx.data(), home: getHome, isNew: (d) => ctx.isNew(d),
    openEvent: (ev, date) => openEventDetail(ctx, ev.id, date),
    openPlace: (p) => openPlaceDetail(ctx, p.id),
    openTrip: (t) => openTripView(ctx, t.id),
    newTrip: () => openTripForm(ctx),
    setStatus: ctx.setStatus,
  });

  // ---------- mappa ----------
  function mapItems() {
    ctx.data();
    const t = U.localToday();
    const items = [];
    for (const p of data.fPlaces) if (Number.isFinite(p.lat)) items.push({ kind: 'place', id: p.id, lat: p.lat, lng: p.lng, category: p.category, status: p.status, title: p.name, subtitle: p.address || 'Luogo' });
    for (const e of data.fEvents) {
      if (!Number.isFinite(e.lat)) continue;
      const n = e.startDate ? U.nextOccurrence(e, t) : null;
      const when = n ? U.formatRangeIt(n.date, n.endDate !== n.date ? n.endDate : '') + (e.startTime ? ' · ' + e.startTime : '') : (e.startDate ? 'Evento passato' : 'Data da definire');
      items.push({ kind: 'event', id: e.id, date: n ? n.date : '', lat: e.lat, lng: e.lng, category: e.category, status: e.status, title: e.title, subtitle: `Evento · ${when}` });
    }
    return items;
  }
  const mapHost = $('#mapBtns');
  mapApi = await createMapView($('#map'), {
    buttonsHost: mapHost, bannerHost: $('#pickBanner'), getHome,
    onOpen: (it) => (it.kind === 'place' ? openPlaceDetail(ctx, it.id) : openEventDetail(ctx, it.id, it.date)),
    onLongPress: (p) => ctx.newPlaceAt(p),
  });
  if (mapApi) {
    mapHost.addEventListener('nohome', () => toast('Imposta la posizione di casa dalle Impostazioni.'));
    mapHost.addEventListener('locate', async () => {
      try { const p = await getPosition(); mapApi.showMe(p.lat, p.lng); mapApi.flyTo(p.lat, p.lng, 15); } catch (e) { toast(e.message, 'error'); }
    });
  }

  // ---------- filtri ----------
  const filtersHost = $('#filters');
  function renderFilters() {
    clear(filtersHost);
    const row = el('div', { class: 'chips' });
    for (const k of U.CAT_KEYS) {
      row.append(chip(`${U.CATEGORIES[k].icon} ${U.CATEGORIES[k].label}`, filters.cats.includes(k), () => {
        filters.cats = filters.cats.includes(k) ? filters.cats.filter((x) => x !== k) : [...filters.cats, k];
        saveFilters(filters); renderFilters(); refresh();
      }, `cat-${k}`));
    }
    const active = filters.status !== 'all' || filters.km || filters.trip || filters.q;
    row.append(chip(`Filtri${active ? ' •' : ''} ${filters.more ? '▴' : '▾'}`, false, () => { filters.more = !filters.more; renderFilters(); }, 'ghost'));
    filtersHost.append(row);
    if (filters.more) {
      const st = select([['all', 'Tutti gli stati'], ...U.STATUS_KEYS.map((k) => [k, `${U.STATUSES[k].icon} ${U.STATUSES[k].label}`])], filters.status);
      st.addEventListener('change', () => { filters.status = st.value; saveFilters(filters); renderFilters(); refresh(); });
      const km = select([['0', 'Qualsiasi distanza'], ...[5, 10, 25, 50, 100, 250].map((n) => [String(n), `Entro ${n} km da casa`])], String(filters.km));
      km.addEventListener('change', () => {
        filters.km = +km.value;
        if (filters.km && !getHome()) { toast('Imposta prima la posizione di casa dalle Impostazioni.', 'error'); filters.km = 0; }
        saveFilters(filters); renderFilters(); refresh();
      });
      const tr = select([['', 'Tutti i viaggi'], ...data.trips.map((t) => [t.id, `🧳 ${t.name}`])], filters.trip);
      tr.addEventListener('change', () => { filters.trip = tr.value; renderFilters(); refresh(); });
      const q = el('input', { type: 'search', placeholder: 'Cerca per titolo, luogo, descrizione…', value: filters.q, autocomplete: 'off' });
      q.addEventListener('input', () => { filters.q = q.value; refresh(); });
      filtersHost.append(el('div', { class: 'filters-more' }, st, km, tr, q, el('div', { class: 'hint full', text: filters.km ? 'Con il filtro distanza restano nascosti gli elementi senza posizione sulla mappa.' : '' })));
    }
  }

  // ---------- novità dall'altro telefono ----------
  const newsEl = $('#news');
  function renderNews() {
    const all = [...store.state.events, ...store.state.places].filter((d) => ctx.isNew(d));
    all.sort((a, b) => b.createdAt - a.createdAt);
    clear(newsEl);
    newsEl.hidden = !all.length;
    if (all.length) {
      newsEl.append(el('span', { text: `🆕 ${describe(all)}` }),
        el('button', { type: 'button', class: 'btn small', text: 'Segna come viste', onclick: () => { markAllSeen(localStorage, seenState); for (const d of all) markSeenDoc(localStorage, seenState, d.id); renderNews(); refresh(); } }));   // anche se l'orologio dell'altro telefono va avanti
    }
    try { if (all.length && navigator.setAppBadge) navigator.setAppBadge(all.length); else if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch { /* facoltativo */ }
  }
  // Avviso quando l'altro telefono aggiunge qualcosa mentre l'app è aperta (più novità ravvicinate = un solo avviso)
  let pendingNews = [], newsTimer = 0;
  store.onRemote(({ doc }) => {
    if (!doc.by || doc.by === store.authorName()) return;
    pendingNews.push(doc);
    clearTimeout(newsTimer);
    newsTimer = setTimeout(() => { const l = pendingNews; pendingNews = []; if (l.length) toast(`🆕 ${describe(l)}`); }, 1500);
  });

  // ---------- aggiornamento ----------
  let raf = 0;
  function refresh() {
    cancelAnimationFrame(raf);
    stale = true;
    raf = requestAnimationFrame(() => {
      applyFilters();
      calendar.render(data.calEvents);
      sections.render();
      renderNews();
      if (mapApi) mapApi.setItems(mapItems());
    });
  }
  store.onChange(refresh);

  // ---------- stato sincronizzazione ----------
  const syncEl = $('#syncState');
  store.onStatus((s) => {
    syncEl.className = 'sync ' + s;
    syncEl.textContent = { local: 'Su questo telefono', connecting: 'Connessione…', ok: 'Sincronizzato', syncing: 'Sincronizzo…', offline: 'Offline', denied: 'Non autorizzato', error: 'Errore' }[s] || '';
    syncEl.title = statusText(s);
    if (s === 'denied') deniedGate(); else if (store.mode === 'cloud' && store.user && !gate.hidden && gate.querySelector('h2') && gate.querySelector('h2').textContent === 'Account non autorizzato') hideGate();
  });

  // ---------- pulsanti ----------
  $('#btnSettings').addEventListener('click', () => openSettings({ store, onChanged: () => { renderFilters(); refresh(); } }));
  const fab = $('#fab');
  fab.hidden = false;
  fab.addEventListener('click', () => openAddMenu(ctx));

  renderFilters();
  applyFilters();
  refresh();

  // ---------- link o testo condiviso verso l'app ("Condividi" → Attività ed eventi) ----------
  const params = new URLSearchParams(location.search);
  if (params.has('title') || params.has('text') || params.has('url')) {
    const incoming = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join('\n').slice(0, 20000);
    history.replaceState(null, '', location.pathname);
    if (incoming.trim()) setTimeout(() => ctx.handleIncoming(incoming).catch((e) => { console.error('Condivisione non riuscita:', e); toast(e.message, 'error'); }), 300);
  }

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker non attivo', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('App aggiornata: chiudila e riaprila per usare la versione nuova.'); });
  }
}

main().catch((e) => { console.error(e); const g = document.getElementById('gate'); g.hidden = false; clear(g).append(el('h2', { text: 'Qualcosa è andato storto' }), el('p', { text: String(e && e.message || e) }), el('button', { class: 'btn primary', text: 'Ricarica', onclick: () => location.reload() })); });

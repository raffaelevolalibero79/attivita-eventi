import assert from 'node:assert/strict';
import * as U from '../js/util.js';
import { readFileSync } from 'node:fs';
import { APP_VERSION, CHANGELOG } from '../js/version.js';
import { locationLinks, hasLocation } from '../js/sharelinks.js';
import { authorLabel, loadSeen, isNew, markSeen, markAllSeen, describe } from '../js/news.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n  ', e.message); process.exitCode = 1; } };

t('date base', () => {
  assert.equal(U.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(U.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(U.weekday('2026-11-19'), 3); // giovedì
  assert.equal(U.diffDays('2026-12-25', '2026-12-01'), 24);
  assert.equal(U.parseYmd('2026-02-30'), null);
  assert.equal(U.formatDateIt('2026-11-22'), 'dom 22 nov 2026');
});
t('griglia mese', () => {
  const g = U.monthGrid(2026, 11);
  assert.equal(g.length, 42);
  assert.equal(U.weekday(g[0]), 0);
  assert.ok(g.includes('2026-11-01') && g.includes('2026-11-30'));
  assert.deepEqual(U.addMonths(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(U.addMonths(2026, 1, -1), { y: 2025, m: 12 });
});
t('n-esimo giorno della settimana', () => {
  assert.equal(U.nthWeekdayOfMonth(2026, 11, 5, 1), 7);   // primo sabato nov 2026
  assert.equal(U.nthWeekdayOfMonth(2026, 11, 6, -1), 29); // ultima domenica
  assert.equal(U.nthWeekdayOfMonth(2026, 2, 0, 5), null);
  assert.equal(U.nthIndexOf('2026-11-07'), 1);
  assert.equal(U.nthIndexOf('2026-11-28'), -1);
});
t('ricorrenza settimanale (mercato del sabato)', () => {
  const ev = { startDate: '2026-11-07', rec: { freq: 'weekly', interval: 1 } };
  const o = U.expandOccurrences(ev, '2026-11-01', '2026-11-30').map((x) => x.date);
  assert.deepEqual(o, ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28']);
});
t('settimanale più giorni, ogni 2 settimane', () => {
  const ev = { startDate: '2026-11-02', rec: { freq: 'weekly', interval: 2, byWeekday: [0, 3] } }; // lun e gio
  const o = U.expandOccurrences(ev, '2026-11-01', '2026-11-30').map((x) => x.date);
  assert.deepEqual(o, ['2026-11-02', '2026-11-05', '2026-11-16', '2026-11-19', '2026-11-30']);
});
t('mensile: primo sabato del mese e giorno fisso', () => {
  const a = { startDate: '2026-11-07', rec: { freq: 'monthly', monthlyMode: 'nth', nth: 1 } };
  assert.deepEqual(U.expandOccurrences(a, '2026-12-01', '2027-02-28').map((x) => x.date), ['2026-12-05', '2027-01-02', '2027-02-06']);
  const b = { startDate: '2026-01-31', rec: { freq: 'monthly', monthlyMode: 'dom' } };
  assert.deepEqual(U.expandOccurrences(b, '2026-02-01', '2026-04-30').map((x) => x.date), ['2026-02-28', '2026-03-31', '2026-04-30']);
});
t('annuale con 29 febbraio', () => {
  const ev = { startDate: '2028-02-29', rec: { freq: 'yearly' } };
  assert.deepEqual(U.expandOccurrences(ev, '2028-01-01', '2030-12-31').map((x) => x.date), ['2028-02-29', '2029-02-28', '2030-02-28']);
});
t('più giorni, until, count, esclusioni', () => {
  const multi = { startDate: '2026-11-20', endDate: '2026-11-22' };
  assert.equal(U.expandOccurrences(multi, '2026-11-21', '2026-11-21').length, 1);
  assert.equal(U.expandOccurrences(multi, '2026-11-23', '2026-11-30').length, 0);
  const until = { startDate: '2026-11-01', rec: { freq: 'daily', until: '2026-11-05' } };
  assert.equal(U.expandOccurrences(until, '2026-11-01', '2026-12-31').length, 5);
  const cnt = { startDate: '2026-11-01', rec: { freq: 'daily', count: 3 } };
  assert.deepEqual(U.expandOccurrences(cnt, '2026-11-01', '2026-12-31').map((x) => x.date), ['2026-11-01', '2026-11-02', '2026-11-03']);
  const ex = { startDate: '2026-11-01', rec: { freq: 'daily', count: 3, exdates: ['2026-11-02'] } };
  assert.deepEqual(U.expandOccurrences(ex, '2026-11-01', '2026-12-31').map((x) => x.date), ['2026-11-01', '2026-11-03']);
});
t('ricorrenza lontana nel tempo non si blocca', () => {
  const ev = { startDate: '2020-01-01', rec: { freq: 'daily' } };
  const o = U.expandOccurrences(ev, '2026-11-01', '2026-11-03');
  assert.equal(o.length, 3);
});
t('prossima occorrenza e descrizione', () => {
  const ev = { startDate: '2026-11-07', rec: { freq: 'weekly' } };
  assert.equal(U.nextOccurrence(ev, '2026-11-19').date, '2026-11-21');
  assert.equal(U.describeRecurrence({ freq: 'monthly', monthlyMode: 'nth', nth: 1 }, '2026-11-07'), 'Ogni mese, primo sabato');
  assert.equal(U.describeRecurrence({ freq: 'weekly', byWeekday: [5], until: '2026-12-31' }, '2026-11-07'), 'Ogni settimana (sab), fino al 2026-12-31'.replace('2026-12-31', 'gio 31 dic 2026'));
});
t('link Google Maps', () => {
  const long = 'https://www.google.com/maps/place/Osteria+Al+Ponte/@45.7678,11.7324,17z/data=!3m1!4b1!4m6!3m5!1s0x477e!8m2!3d45.7676!4d11.7331';
  const r = U.parseMapsUrl(long);
  assert.equal(r.lat, 45.7676); assert.equal(r.lng, 11.7331); assert.equal(r.name, 'Osteria Al Ponte'); assert.equal(r.short, false);
  const q = U.parseMapsUrl('https://www.google.com/maps?q=45.76,11.73');
  assert.equal(q.lat, 45.76);
  const s = U.parseMapsUrl('https://maps.app.goo.gl/AbCdEf123');
  assert.equal(s.short, true); assert.equal(s.lat, null);
  assert.equal(U.parseMapsUrl('https://example.com/maps/@1,2'), null);
  assert.equal(U.parseMapsUrl('non è un link'), null);
  const t2 = U.parseSharedPlaceText('Osteria Al Ponte\nVia Roma 1, Bassano del Grappa\nhttps://maps.app.goo.gl/AbCdEf123');
  assert.equal(t2.name, 'Osteria Al Ponte'); assert.equal(t2.address, 'Via Roma 1, Bassano del Grappa'); assert.equal(t2.urls.length, 1);
});
t('tipi di link e link sicuri', () => {
  assert.equal(U.linkKind('https://www.facebook.com/events/123'), 'facebook');
  assert.equal(U.linkKind('https://www.instagram.com/p/abc/'), 'instagram');
  assert.equal(U.linkKind('https://maps.app.goo.gl/x'), 'maps');
  assert.equal(U.safeUrl('javascript:alert(1)'), '');
  assert.equal(U.safeUrl('data:text/html,<b>x'), '');
  assert.equal(U.safeUrl('www.example.com/a'), 'https://www.example.com/a');
});
const P = (s) => U.parseEventText(s, { today: '2026-11-19' });
t('locandina: sagra con più giorni', () => {
  const r = P('SAGRA DI SAN MARTINO\nSabato 21 e domenica 22 novembre\nore 19:30 apertura stand\nPresso Piazza Libertà, Breganze\nIngresso libero\nInfo: 333 1234567 www.sagra.example');
  assert.equal(r.title, 'SAGRA DI SAN MARTINO');
  assert.equal(r.startDate, '2026-11-21'); assert.equal(r.endDate, '2026-11-22');
  assert.equal(r.startTime, '19:30');
  assert.equal(r.price, 'Gratuito');
  assert.equal(r.address, 'Piazza Libertà, Breganze');
  assert.equal(r.phone, '333 1234567');
  assert.equal(r.link, 'https://www.sagra.example/');
  assert.equal(r.category, 'mangiare');
});
t('locandina: intervallo con orari e prezzo', () => {
  const r = P('Mercatino di Natale\ndal 5 al 8 dicembre 2026\n10:00 - 18:00\nBassano del Grappa\nBiglietto € 5,50');
  assert.equal(r.startDate, '2026-12-05'); assert.equal(r.endDate, '2026-12-08');
  assert.equal(r.startTime, '10:00'); assert.equal(r.endTime, '18:00');
  assert.equal(r.price, '5,50 €');
  assert.equal(r.title, 'Mercatino di Natale');
});
t('locandina: data numerica, anno successivo, ore senza minuti', () => {
  const a = P('Concerto jazz\nDomenica 06/12 dalle 10 alle 12\nTeatro Remondini');
  assert.equal(a.startDate, '2026-12-06'); assert.equal(a.startTime, '10:00'); assert.equal(a.endTime, '12:00');
  const b = P('Veglione\n31 dicembre\nore 21');
  assert.equal(b.startDate, '2026-12-31'); assert.equal(b.startTime, '21:00');
  const c = P('Festa della Befana\n6 gennaio');
  assert.equal(c.startDate, '2027-01-06');
});
t('un orario con punto non diventa data', () => {
  const r = P('Cena sociale\nore 20.30\nOsteria da Gino');
  assert.equal(r.startDate, ''); assert.equal(r.startTime, '20:30');
});
t('intervallo fra due mesi', () => {
  const r = P('Mostra del fumetto\n28 novembre - 6 dicembre');
  assert.equal(r.startDate, '2026-11-28'); assert.equal(r.endDate, '2026-12-06');
});
t('testo vuoto o senza date non rompe nulla', () => {
  const r = P('');
  assert.equal(r.startDate, ''); assert.equal(r.title, '');
  assert.equal(P('ciao a tutti').startDate, '');
});
t('pulizia dati: evento', () => {
  const d = U.sanitizeDoc('events', {
    title: '  Test  ', category: 'hack', status: 'x', startDate: '2026-02-30', startTime: '25:00', lat: 200, lng: 10,
    link: 'javascript:alert(1)', rec: { freq: 'weekly', interval: 500, byWeekday: [9, 2, 'a'] }, extra: '<script>',
  });
  assert.equal(d.title, 'Test'); assert.equal(d.category, 'attivita'); assert.equal(d.status, 'da_valutare');
  assert.equal(d.startDate, ''); assert.equal(d.startTime, ''); assert.equal(d.lat, null); assert.equal(d.lng, null);
  assert.equal(d.link, ''); assert.equal(d.rec.interval, 99); assert.deepEqual(d.rec.byWeekday, [2]);
  assert.ok(!('extra' in d));
  assert.ok(Object.values(d).every((v) => v !== undefined));
  assert.ok(/^[a-z0-9]{20}$/.test(d.id));
});
t('pulizia dati: luogo, viaggio, id pericolosi', () => {
  const p = U.sanitizeDoc('places', { id: '../../x', name: 'A'.repeat(500), lat: '45.5', lng: '11.7', rating: 9 });
  assert.equal(p.id, 'x'); assert.equal(p.name.length, 200); assert.equal(p.lat, 45.5); assert.equal(p.rating, 0);
  const tr = U.sanitizeDoc('trips', { name: 'Giappone', budget: [{ label: 'Volo', amount: '350' }], packing: [{ text: 'Passaporto' }], itinerary: [{ date: '2027-04-01', text: 'Arrivo' }] });
  assert.equal(tr.budget[0].amount, 350); assert.equal(tr.packing[0].done, false); assert.equal(tr.itinerary[0].date, '2027-04-01');
  assert.throws(() => U.sanitizeDoc('altro', {}));
});
t('evento da dati estratti', () => {
  const e = U.eventFromExtracted({ title: 'Prova', startDate: '2026-12-01', phone: '333 111', email: 'a@b.it', recurrenceNote: 'ogni sabato' }, 'foto');
  assert.equal(e.status, 'da_valutare'); assert.equal(e.source, 'foto'); assert.equal(e.contacts, '333 111 · a@b.it');
  assert.ok(e.notes.includes('ogni sabato'));
});
t('distanza', () => {
  const km = U.haversineKm({ lat: 45.7, lng: 11.7 }, { lat: 45.54, lng: 11.55 });
  assert.ok(km > 15 && km < 25, String(km));
});

t('versione: uguale in app, service worker e novità', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.ok(sw.includes(`const VERSION = '${APP_VERSION}'`), 'sw.js ha un numero di versione diverso da js/version.js');
  assert.equal(CHANGELOG[0].v, APP_VERSION);
});
t('coordinate incollate da Google Maps', () => {
  assert.deepEqual(U.parseCoords('45.76540, 11.73450'), { lat: 45.7654, lng: 11.7345 });
  assert.deepEqual(U.parseCoords('Bar Alpino\n45.76540,11.73450'), { lat: 45.7654, lng: 11.7345 });
  assert.deepEqual(U.parseCoords('-33.86 151.20'), null);                      // servono almeno 3 decimali
  assert.deepEqual(U.parseCoords('-33.86880 151.20930'), { lat: -33.8688, lng: 151.2093 });
  assert.equal(U.parseCoords('Via Roma 12, 36061 Bassano'), null);
  assert.equal(U.parseCoords('https://www.google.com/maps/@45.76540,11.73450,17z'), null);  // dentro un link: ci pensa parseMapsUrl
  assert.equal(U.parseCoords('95.00000, 11.00000'), null);
});
t('testo condiviso da Google Maps: nome e indirizzo', () => {
  const a = U.parseSharedPlaceText('Bar Centrale\nVia Roma 1, 36061 Bassano del Grappa VI\nhttps://maps.app.goo.gl/AbC');
  assert.deepEqual([a.name, a.address, a.urls.length], ['Bar Centrale', 'Via Roma 1, 36061 Bassano del Grappa VI', 1]);
  const b = U.parseSharedPlaceText('Trattoria Da Gino, Via Garibaldi 5, Breganze https://maps.app.goo.gl/x');
  assert.deepEqual([b.name, b.address], ['Trattoria Da Gino', 'Via Garibaldi 5, Breganze']);
  const c = U.parseSharedPlaceText('Posizione condivisa\nhttps://maps.app.goo.gl/x');
  assert.deepEqual([c.name, c.address], ['', '']);
  const d = U.parseSharedPlaceText('Bar Centrale\nBar Centrale\nhttps://maps.app.goo.gl/x');   // titolo e testo ripetuti
  assert.deepEqual([d.name, d.address], ['Bar Centrale', '']);
  const e = U.parseSharedPlaceText('Bar Alpino\n45.76540, 11.73450');
  assert.deepEqual([e.name, e.address], ['Bar Alpino', '']);
});
t('indirizzo ripulito per la ricerca', () => {
  assert.equal(U.cleanAddress('Via Roma 1, 36061 Bassano del Grappa VI'), 'Via Roma 1, 36061 Bassano del Grappa');
  assert.equal(U.cleanAddress('Via Roma 1, 36061 Bassano del Grappa VI, Italia'), 'Via Roma 1, 36061 Bassano del Grappa');
  assert.equal(U.cleanAddress('FRM4+23 Bassano del Grappa, Via Roma 1'), 'Bassano del Grappa, Via Roma 1');
  assert.equal(U.cityFromAddress('Via Roma 1, 36061 Bassano del Grappa VI'), 'Bassano del Grappa');
  assert.equal(U.cityFromAddress(''), '');
});
t('condividi posizione: link costruiti solo da numeri e testo codificato', () => {
  const L = locationLinks({ name: 'Bar "Alpino" (centro)', address: 'Via Roma 1, Bassano', lat: 45.7654, lng: 11.7345 });
  assert.equal(L.waze, 'https://waze.com/ul?ll=45.765400,11.734500&navigate=yes');
  assert.equal(L.gmapsNav, 'https://www.google.com/maps/dir/?api=1&destination=45.765400,11.734500');
  assert.ok(L.geo.startsWith('geo:45.765400,11.734500?q=45.765400,11.734500('));
  assert.ok(!/[()]/.test(L.geo.slice(L.geo.indexOf('(') + 1, -1)));
  assert.ok(decodeURIComponent(L.whatsapp).includes('Via Roma 1, Bassano'));
  assert.equal(locationLinks({ name: 'x', lat: null, lng: 11 }), null);
  assert.equal(locationLinks({ name: 'x', lat: '45', lng: '11' }), null);   // testo non valido: niente link
  assert.equal(locationLinks({ name: 'x', lat: 95, lng: 11 }), null);
  assert.equal(hasLocation({ lat: 45.1, lng: 11.1 }), true);
  const bad = locationLinks({ name: 'a&b=c#d\nhttps://evil', lat: 1, lng: 2 });
  assert.ok(!bad.waze.includes('evil') && !bad.gmapsNav.includes('evil'));
});
const fakeStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
t('novità: nome di chi ha creato, "nuovo" e "visto"', () => {
  assert.equal(authorLabel({ displayName: 'Elena Ferretti', email: 'x@y.it' }), 'Elena');
  assert.equal(authorLabel({ displayName: '', email: 'raffaele.rossi@gmail.com' }), 'raffaele.rossi');
  assert.equal(authorLabel(null), '');
  const store = fakeStore();
  const st = loadSeen(store, 1000);
  assert.equal(st.base, 1000);
  const d = (o) => ({ id: 'a', by: 'Elena', createdAt: 2000, title: 'Sagra', ...o });
  assert.equal(isNew(d({}), 'Raffaele', st), true);
  assert.equal(isNew(d({ by: 'Raffaele' }), 'Raffaele', st), false);      // creato da me
  assert.equal(isNew(d({ by: '' }), 'Raffaele', st), false);              // senza autore (dati vecchi)
  assert.equal(isNew(d({ createdAt: 900 }), 'Raffaele', st), false);      // più vecchio del primo avvio
  markSeen(store, st, 'a');
  assert.equal(isNew(d({}), 'Raffaele', st), false);
  assert.equal(loadSeen(store, 5000).ids[0], 'a');                        // si ricorda dopo la chiusura dell'app
  markAllSeen(store, st, 3000);
  assert.equal(isNew(d({ id: 'b', createdAt: 2500 }), 'Raffaele', st), false);
  assert.equal(describe([d({})]), 'Elena ha aggiunto: Sagra');
  assert.equal(describe([d({}), d({ id: 'c' })]), 'Elena ha aggiunto 2 novità');
  assert.equal(describe([d({}), d({ id: 'c', by: 'Marco' })]), 'Elena e Marco hanno aggiunto 2 novità');
  assert.equal(describe([]), '');
  assert.equal(U.sanitizeDoc('events', { title: 'x', by: 'Elena<script>'.padEnd(80, 'a') }).by.length, 40);
});
t('la mappa non ha più il bottone "Mostra tutto"', () => {
  assert.ok(!/Mostra tutto/.test(readFileSync(new URL('../js/mapview.js', import.meta.url), 'utf8')));
  assert.ok(!/id="ver"/.test(readFileSync(new URL('../index.html', import.meta.url), 'utf8')));
});
console.log(`\n${n} test superati`);

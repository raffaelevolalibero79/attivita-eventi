// Prova dell'interfaccia in un browser vero (modalità "solo questo telefono"; rete esterna non disponibile).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const URL_APP = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const SHOTS = process.argv[3] || '/tmp';
let n = 0;
const step = async (name, fn) => { try { await fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 4).join('\n   '), '\n   at', (String(e.stack).match(/ui-test\.mjs:\d+/g) || []).join(' ')); process.exitCode = 1; } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
// Prova sempre in modalità "solo questo telefono" (la rete esterna non c'è) e con un lettore di testo finto,
// così si prova tutto il percorso della foto senza scaricare nulla.
await ctx.addInitScript(() => {
  try { localStorage.setItem('ae.localOnly', '1'); } catch { /* ignora */ }
  window.Tesseract = { createWorker: async () => ({
    recognize: async () => ({ data: { text: 'FESTA DELLA ZUCCA\nSabato 5 dicembre 2026\nore 18:00\nPresso Piazza Libertà, Breganze\nIngresso 5 euro' } }),
    terminate: async () => {},
  }) };
});
const nominatimLog = [];
await ctx.route('https://nominatim.openstreetmap.org/**', (route) => {
  const q = new URL(route.request().url()).searchParams.get('q') || '';
  nominatimLog.push(q);
  const body = /Via Roma/i.test(q)
    ? [{ lat: '45.7664', lon: '11.7354', display_name: 'Via Roma 1, Bassano del Grappa, Vicenza, Veneto, Italia', name: '' }, { lat: '41.9028', lon: '12.4964', display_name: 'Via Roma 1, Roma, Lazio, Italia', name: '' }]
    : [];
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|403|404|blocked/i.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(URL_APP, { waitUntil: 'load' });
await page.waitForSelector('.cal-grid');

const sheet = () => page.locator('.sheet').last();
const addMenu = async (label) => { await page.click('#fab'); await page.getByRole('button', { name: label }).click(); };

await step('avvio: calendario del mese corrente, sezioni chiuse', async () => {
  assert.match(await page.locator('.cal-head h2').innerText(), /Novembre 2026/);
  assert.equal(await page.locator('.cal-cell').count(), 42);
  assert.equal(await page.locator('details.sec[open]').count(), 0);
  assert.equal(await page.locator('details.sec').count(), 7);
  assert.deepEqual(await page.locator('details.sec > summary').allInnerTexts().then((a) => a.map((t) => t.replace(/\s*\d+\s*$/, '').replace(/\s+/g, ' ').trim())), ['📅 Prossimi eventi', '❔ Da valutare', '🏛️ Da vedere', '🍽️ Mangiare', '📍 Luoghi', '🚫 Non mi interessa', '🧳 Viaggi']);
  assert.doesNotMatch(await page.locator('#sections').innerText(), /Statistiche/);
  assert.equal((await page.locator('header.top h1').innerText()).trim(), 'Attività ed eventi');      // niente numero di versione nel titolo
  assert.equal(await page.locator('#ver').count(), 0);
  assert.equal(await page.locator('#gate').isHidden(), true);
  assert.match(await page.locator('#syncState').innerText(), /questo telefono/i);
});
await step('mappa: se non carica, messaggio chiaro e app funzionante', async () => {
  await page.waitForSelector('#map .map-msg, #map .leaflet-container', { timeout: 20000 });
  const msg = await page.locator('#map .map-msg').count();
  assert.ok(msg === 1 || (await page.locator('#map .leaflet-container').count()) === 1);
});

await step('nuovo evento a mano con ripetizione ogni sabato', async () => {
  await addMenu('Nuovo evento a mano');
  await page.getByLabel('Titolo *').fill('Mercato del sabato');
  await sheet().getByRole('button', { name: /Mangiare/ }).click();
  await page.getByLabel('Data di inizio').fill('2026-11-21');
  await page.getByLabel('Ora di inizio').fill('08:00');
  await page.getByLabel('Ora di fine').fill('13:00');
  await page.getByLabel('Descrizione').fill('Bancarelle di prodotti locali in piazza.');
  await page.locator('.sheet select').filter({ has: page.locator('option[value="weekly"]') }).selectOption('weekly');
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForSelector('.toast');
  await page.waitForSelector('.cal-cell[data-date="2026-11-21"] .bar');
  // Sabati di novembre: 21 e 28 (il 21 è la prima occorrenza)
  assert.equal(await page.locator('.cal-cell[data-date="2026-11-21"] .bar').count(), 1);
  assert.equal(await page.locator('.cal-cell[data-date="2026-11-28"] .bar').count(), 1);
  assert.equal(await page.locator('.cal-cell[data-date="2026-11-14"] .bar').count(), 0);
  assert.equal(await page.locator('.cal-cell[data-date="2026-11-21"] .bar.cat-mangiare').count(), 1);
  assert.equal(await page.locator('.cal-cell.sel').getAttribute('data-date'), '2026-11-21');
});
await step('stato: da valutare → mi interessa → non mi interessa', async () => {
  const row = page.locator('.day-panel .row').first();
  assert.ok((await row.getAttribute('class')).includes('st-da_valutare'));
  await row.getByRole('button', { name: 'Mi interessa', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.day-panel .row.st-interessa'));
  assert.equal(await page.locator('.cal-cell[data-date="2026-11-21"] .bar.st-interessa').count(), 1);
  await page.locator('.day-panel .row').first().getByRole('button', { name: 'Non mi interessa', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.day-panel .row.st-non_interessa'));
  await page.locator('.day-panel .row').first().getByRole('button', { name: 'Non mi interessa', exact: true }).click(); // torna da valutare
  await page.waitForFunction(() => document.querySelector('.day-panel .row.st-da_valutare'));
});
await step('scheda dettaglio, "salta questa data" e tasto indietro', async () => {
  await page.locator('.day-panel .row .main').first().click();
  await page.waitForSelector('.sheet');
  assert.match(await sheet().innerText(), /Mercato del sabato/);
  assert.match(await sheet().innerText(), /Ogni settimana/);
  await sheet().getByRole('button', { name: /Salta solo questa data/ }).click();
  await page.locator('.sheet').last().getByRole('button', { name: 'Salta questa data' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.cal-cell[data-date="2026-11-21"] .bar').length === 0);
  assert.equal(await page.locator('.cal-cell[data-date="2026-11-28"] .bar').count(), 1);
  assert.equal(await page.locator('.sheet').count(), 0);
});
await step('Android "indietro" chiude la finestra aperta', async () => {
  await page.click('#fab');
  assert.equal(await page.locator('.sheet').count(), 1);
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('evento da testo: legge titolo, data, ora, prezzo, luogo', async () => {
  await addMenu('Evento da link o testo');
  await page.locator('.sheet textarea').fill('SAGRA DI SAN MARTINO\nSabato 28 e domenica 29 novembre\nore 19:30 apertura stand\nPresso Piazza Libertà, Breganze\nIngresso libero\nhttps://www.facebook.com/events/123456');
  await sheet().getByRole('button', { name: 'Leggi' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'SAGRA DI SAN MARTINO'));
  assert.equal(await page.getByLabel('Data di inizio').inputValue(), '2026-11-28');
  assert.equal(await page.getByLabel('Data di fine (se più giorni)').inputValue(), '2026-11-29');
  assert.equal(await page.getByLabel('Ora di inizio').inputValue(), '19:30');
  assert.equal(await page.getByLabel('Prezzo').inputValue(), 'Gratuito');
  assert.match(await page.getByLabel('Link dell\'evento').inputValue(), /facebook\.com\/events\/123456/);
  assert.match(await page.locator('.warn').first().innerText(), /controlla/i);
  await page.screenshot({ path: `${SHOTS}/form-evento.png` });
});
await step('chiusura con modifiche chiede conferma', async () => {
  await page.locator('.sheet .sheet-head .icon-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 2);
  assert.match(await sheet().innerText(), /modifiche non salvate/i);
  await sheet().getByRole('button', { name: /Continua a modificare/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 1);
});
await step('salva evento letto da testo e lo vede nel calendario', async () => {
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  await page.waitForFunction(() => document.querySelectorAll('.cal-cell[data-date="2026-11-28"] .bar').length === 2);
  assert.equal(await page.locator('.cal-cell[data-date="2026-11-28"] .bar').count(), 2); // mercato + sagra
  assert.equal(await page.locator('.cal-cell[data-date="2026-11-29"] .bar').count(), 1);
});
await step('sicurezza: il testo non diventa codice', async () => {
  await addMenu('Nuovo evento a mano');
  await page.getByLabel('Titolo *').fill('<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>');
  await page.getByLabel('Data di inizio').fill('2026-11-25');
  await page.getByLabel('Link dell\'evento').fill('javascript:window.__xss=3');
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForSelector('.toast');
  assert.equal(await page.locator('.toast').first().innerText(), 'Il link non è valido (deve iniziare con https://).');
  await page.getByLabel('Link dell\'evento').fill('');
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  await page.locator('.cal-cell[data-date="2026-11-25"]').click();
  assert.match(await page.locator('.day-panel .title').first().innerText(), /<img src=x/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('.day-panel img').count(), 0);
});
await step('luogo a mano, sezioni a tendina e filtri', async () => {
  await addMenu('Nuovo luogo a mano');
  await page.getByLabel('Nome *').fill('Osteria Al Ponte');
  await sheet().getByRole('button', { name: /Mangiare/ }).click();
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  const secText = (id) => page.evaluate((x) => document.querySelector(`details.sec[data-id="${x}"]`).innerText, id);
  const secOpen = (id) => page.evaluate((x) => { document.querySelector(`details.sec[data-id="${x}"]`).open = true; }, id);
  const badge = (id) => page.locator(`details.sec[data-id="${id}"] .badge`).innerText();
  for (const id of ['eval', 'eat', 'see', 'places', 'no', 'next']) await secOpen(id);
  // nuovo luogo = "da valutare": compare SOLO in "Da valutare"
  await page.waitForFunction(() => /Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="eval"]').innerText));
  for (const id of ['eat', 'see', 'places', 'no']) assert.doesNotMatch(await secText(id), /Osteria Al Ponte/, `non deve stare in ${id}`);
  // ⭐ → passa in "Mangiare" (categoria mangiare) e sparisce da "Da valutare"
  await page.locator('details.sec[data-id="eval"] .row', { hasText: 'Osteria Al Ponte' }).getByRole('button', { name: 'Mi interessa', exact: true }).click();
  await page.waitForFunction(() => /Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="eat"]').innerText));
  assert.doesNotMatch(await secText('eval'), /Osteria Al Ponte/);
  assert.equal(await badge('eat'), '1');
  for (const id of ['see', 'places', 'no']) assert.doesNotMatch(await secText(id), /Osteria Al Ponte/);
  // ✕ → passa in "Non mi interessa"
  await page.locator('details.sec[data-id="eat"] .row', { hasText: 'Osteria Al Ponte' }).getByRole('button', { name: 'Non mi interessa', exact: true }).click();
  await page.waitForFunction(() => /Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="no"]').innerText));
  assert.doesNotMatch(await secText('eat'), /Osteria Al Ponte/);
  // ✕ di nuovo → torna in "Da valutare"; poi ⭐ → "Mangiare"
  await page.locator('details.sec[data-id="no"] .row', { hasText: 'Osteria Al Ponte' }).getByRole('button', { name: 'Non mi interessa', exact: true }).click();
  await page.waitForFunction(() => /Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="eval"]').innerText));
  await page.locator('details.sec[data-id="eval"] .row', { hasText: 'Osteria Al Ponte' }).getByRole('button', { name: 'Mi interessa', exact: true }).click();
  await page.waitForFunction(() => /Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="eat"]').innerText));
  // luogo di tipo "attività": da valutare → ⭐ → "Prossimi eventi" (non in Luoghi, non in Da vedere/Mangiare)
  await addMenu('Nuovo luogo a mano');
  await page.getByLabel('Nome *').fill('Parco Avventura');
  await sheet().getByRole('button', { name: /Attività/ }).click();
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  await page.waitForFunction(() => /Parco Avventura/.test(document.querySelector('details.sec[data-id="eval"]').innerText));
  for (const id of ['next', 'eat', 'see', 'places', 'no']) assert.doesNotMatch(await secText(id), /Parco Avventura/, `non deve stare in ${id}`);
  await page.locator('details.sec[data-id="eval"] .row', { hasText: 'Parco Avventura' }).getByRole('button', { name: 'Mi interessa', exact: true }).click();
  await page.waitForFunction(() => /Parco Avventura/.test(document.querySelector('details.sec[data-id="next"]').innerText));
  assert.doesNotMatch(await secText('eval'), /Parco Avventura/);
  for (const id of ['eat', 'see', 'places', 'no']) assert.doesNotMatch(await secText(id), /Parco Avventura/, `non deve stare in ${id}`);
  // filtro per categoria: tolgo "Mangiare" → luogo, mercato e sagra (anche la sagra è stata riconosciuta come "mangiare") spariscono
  await page.locator('#filters .chip.cat-mangiare').click();
  await page.waitForFunction(() => !/Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="eat"]').innerText));
  await page.waitForFunction(() => document.querySelectorAll('.cal-cell[data-date="2026-11-28"] .bar').length === 0);
  await page.locator('#filters .chip.cat-mangiare').click();
  await page.waitForFunction(() => document.querySelectorAll('.cal-cell[data-date="2026-11-28"] .bar').length === 2);
});
await step('categoria "Luoghi": segnaposto semplice, subito nel riquadro Luoghi, non in Da valutare', async () => {
  const secText = (id) => page.evaluate((x) => document.querySelector(`details.sec[data-id="${x}"]`).innerText, id);
  // il luogo ha 4 categorie, l'evento solo 3
  await addMenu('Nuovo luogo a mano');
  assert.equal(await sheet().locator('.chip.cat-luoghi').count(), 1);
  await page.getByLabel('Nome *').fill('Via Gasparona');
  await sheet().getByRole('button', { name: /Luoghi/ }).click();
  assert.equal(await page.getByLabel('Stato').inputValue(), 'interessa');       // un segnaposto non va "valutato"
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  await page.evaluate(() => { for (const id of ['eval', 'places']) document.querySelector(`details.sec[data-id="${id}"]`).open = true; });
  await page.waitForFunction(() => /Via Gasparona/.test(document.querySelector('details.sec[data-id="places"]').innerText));
  for (const id of ['eval', 'next', 'eat', 'see', 'no']) assert.doesNotMatch(await secText(id), /Via Gasparona/, `non deve stare in ${id}`);
  // anche se lo stato resta "da valutare" (scelto a mano) non finisce in "Da valutare"
  await page.locator('details.sec[data-id="places"] .row', { hasText: 'Via Gasparona' }).locator('.main').click();
  await page.getByRole('button', { name: /Modifica/ }).click();
  await page.getByLabel('Stato').selectOption('da_valutare');
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 1);
  await page.waitForTimeout(300);
  assert.doesNotMatch(await secText('eval'), /Via Gasparona/);
  assert.match(await secText('places'), /Via Gasparona/);
  // ✕ → "Non mi interessa"
  await page.evaluate(() => document.querySelector('details.sec[data-id="no"]').open = true);
  await page.locator('.sheet .sheet-head .icon-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  await page.locator('details.sec[data-id="places"] .row', { hasText: 'Via Gasparona' }).getByRole('button', { name: 'Non mi interessa', exact: true }).click();
  await page.waitForFunction(() => /Via Gasparona/.test(document.querySelector('details.sec[data-id="no"]').innerText));
  assert.doesNotMatch(await secText('places'), /Via Gasparona/);
  // l'evento ha solo 3 categorie
  await addMenu('Nuovo evento a mano');
  assert.equal(await sheet().locator('.chip.cat-luoghi').count(), 0);
  assert.equal(await sheet().locator('.chip.cat-mangiare, .chip.cat-attivita, .chip.cat-vedere').count(), 3);
  await page.locator('.sheet .sheet-head .icon-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  // filtro in alto: c'è il bottone "Luoghi"
  assert.equal(await page.locator('#filters .chip.cat-luoghi').count(), 1);
});
await step('calendario: mostra sempre tutti gli eventi con data, anche con il filtro "stato" attivo', async () => {
  // un "indietro" del browser lasciato dal passaggio prima può finire un attimo dopo e annullare il ricaricamento: aspetto e, se serve, riprovo
  const reloadSafe = async () => {
    await page.waitForTimeout(700);
    for (let k = 0; k < 3; k++) { try { await page.reload({ waitUntil: 'load' }); return; } catch (e) { if (!/ERR_ABORTED|detached/.test(e.message) || k === 2) throw e; await page.waitForTimeout(500); } }
  };
  const bars = () => page.locator('.cal-cell[data-date="2026-11-28"] .bar').count();
  const before = await bars();
  assert.ok(before >= 1);
  await page.evaluate(() => localStorage.setItem('ae.filters', JSON.stringify({ cats: ['mangiare', 'attivita', 'vedere'], status: 'non_interessa', km: 0 })));
  await reloadSafe();
  await page.waitForSelector('.cal-grid');
  assert.equal(await bars(), before);
  await page.evaluate(() => localStorage.setItem('ae.filters', JSON.stringify({ cats: ['mangiare', 'attivita', 'vedere'], status: 'all', km: 0 })));
  await reloadSafe();
  await page.waitForSelector('.cal-grid');
});
await step('viaggio: crea, aggiunge budget, valigia e itinerario', async () => {
  await page.locator('details.sec[data-id="trips"] > summary').click();
  await page.getByRole('button', { name: '＋ Nuovo viaggio' }).click();
  await page.getByLabel('Nome *').fill('Giappone 2027');
  await page.getByLabel('Partenza').fill('2027-04-01');
  await page.getByLabel('Ritorno').fill('2027-04-15');
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForSelector('.sheet-head h2:has-text("Giappone 2027")');
  await page.locator('.sheet input[placeholder^="Voce"]').fill('Volo');
  await page.locator('.sheet input[placeholder^="Importo"]').fill('850');
  await page.getByRole('button', { name: '＋ Aggiungi voce' }).click();
  await page.waitForSelector('text=Volo — ');
  await page.locator('.sheet input[placeholder^="es. Passaporto"]').fill('Passaporto');
  await page.getByRole('button', { name: '＋ Aggiungi', exact: true }).click();
  await page.waitForSelector('.chk:has-text("Passaporto")');
  // la lista si può inviare ad altre app (Google Keep…): una voce per riga
  await page.evaluate(() => { window.__sharedList = []; navigator.share = async (d) => { window.__sharedList.push(d); }; });
  await page.getByRole('button', { name: /Invia la lista/ }).click();
  await page.waitForFunction(() => window.__sharedList.length === 1);
  const sl = await page.evaluate(() => window.__sharedList[0]);
  assert.equal(sl.text, '🧳 Giappone 2027 — cose da portare\nPassaporto');
  assert.ok(await page.getByRole('button', { name: /Copia la lista/ }).isVisible());
  await page.locator('.sheet input[placeholder^="Cosa fai"]').fill('Arrivo a Tokyo');
  await page.getByRole('button', { name: /Aggiungi all'itinerario/ }).click();
  await page.waitForSelector('.day-head');
  assert.match(await sheet().innerText(), /850/);
  assert.match(await sheet().innerText(), /Arrivo a Tokyo/);
  assert.match(await sheet().innerText(), /0\/1/);
  await page.screenshot({ path: `${SHOTS}/viaggio.png` });
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('i dati restano dopo aver riaperto l\'app', async () => {
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.cal-grid');
  await page.waitForFunction(() => document.querySelectorAll('.cal-cell[data-date="2026-11-28"] .bar').length === 2);
  await page.locator('details.sec[data-id="trips"]').evaluate((d) => { d.open = true; });
  await page.waitForSelector('details.sec[data-id="trips"] .row');
  assert.match(await page.locator('details.sec[data-id="trips"]').innerText(), /Giappone 2027/);
});
await step('backup (esporta / reimporta)', async () => {
  const data = await page.evaluate(async () => {
    const { createStore } = await import('./js/store.js');
    const s = createStore(); await s.init();
    const j = await s.exportAll({ thumbs: true });
    return { ev: j.events.length, pl: j.places.length, tr: j.trips.length, app: j.app };
  });
  assert.deepEqual(data, { ev: 3, pl: 3, tr: 1, app: 'attivita-eventi' });
  const bad = await page.evaluate(async () => {
    const { createStore } = await import('./js/store.js');
    const s = createStore(); await s.init();
    try { await s.importAll({ app: 'altro' }); return 'accettato'; } catch (e) { return e.message; }
  });
  assert.match(bad, /non sembra un backup/);
});

await step('finestre: aprirne una subito dopo averne chiusa un\'altra non rovina il tasto "indietro"', async () => {
  await page.evaluate(async () => {
    const ui = await import('./js/ui.js');
    const hb = history.back.bind(history); history.back = () => setTimeout(hb, 60);   // "indietro" lento, come su un telefono carico
    const a = ui.openSheet({ title: 'A' }); a.forceClose();
    await new Promise((r) => setTimeout(r, 20));
    ui.openSheet({ title: 'B' });
    await new Promise((r) => setTimeout(r, 250));
    history.back = hb;
  });
  assert.equal(await page.locator('.sheet').count(), 1);
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  assert.match(page.url(), /index\.html$/);
});

// ---------- foto, link, posizione da Google Maps ----------
const fakeJpeg = async () => Buffer.from((await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 600; c.height = 800;
  const g = c.getContext('2d'); g.fillStyle = '#f5c26b'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#222'; g.font = '48px sans-serif'; g.fillText('FESTA DELLA ZUCCA', 20, 120);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
})), 'base64');

await step('foto: scelta dalla galleria → si apre la scheda compilata con l\'anteprima', async () => {
  const buf = await fakeJpeg();
  await page.click('#fab'); await page.getByRole('button', { name: /Evento da foto o locandina/ }).click();
  await page.waitForSelector('.sheet-head h2:has-text("Da dove prendo la foto?")');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Scegli dalla galleria/ }).click()]);
  await chooser.setFiles({ name: 'locandina.jpg', mimeType: 'image/jpeg', buffer: buf });
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'FESTA DELLA ZUCCA'), null, { timeout: 15000 });
  assert.equal(await page.getByLabel('Data di inizio').inputValue(), '2026-12-05');
  assert.equal(await page.getByLabel('Ora di inizio').inputValue(), '18:00');
  assert.equal(await page.locator('.sheet img.thumb').count(), 1);
  assert.match(await page.locator('.sheet .warn').first().innerText(), /OCR gratuito/);
  assert.match(await page.getByLabel('Descrizione').inputValue(), /FESTA DELLA ZUCCA/);
  await page.screenshot({ path: `${SHOTS}/form-foto.png` });
});
await step('foto: tasto "Condividi foto" nella scheda e nell\'anteprima ingrandita', async () => {
  await page.evaluate(() => { window.__shared = []; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared.push({ name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }); }; });
  await sheet().getByRole('button', { name: /Condividi foto/ }).click();
  await page.waitForFunction(() => window.__shared.length === 1);
  const one = await page.evaluate(() => window.__shared[0]);
  assert.equal(one.type, 'image/jpeg'); assert.match(one.name, /\.jpg$/); assert.ok(one.size > 500);
  await page.locator('.sheet img.thumb').click();
  await page.waitForSelector('img.thumb-full');
  await sheet().getByRole('button', { name: /Condividi foto/ }).click();
  await page.waitForFunction(() => window.__shared.length === 2);
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('img.thumb-full'));
});
await step('foto: l\'anteprima si ingrandisce e si richiude con "indietro"', async () => {
  await page.locator('.sheet img.thumb').click();
  await page.waitForSelector('img.thumb-full');
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('img.thumb-full'));
  assert.equal(await page.locator('.sheet').count(), 1);   // la scheda dell'evento resta aperta
});
await step('foto: salva, vede il tag "locandina" e riapre l\'anteprima dalla scheda', async () => {
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  await page.locator('.cal-cell[data-date="2026-12-05"]').click().catch(() => {});
  // appena salvato è "da valutare": sta in "Da valutare" e NON in "Prossimi eventi"; con ⭐ passa in "Prossimi eventi"
  await page.evaluate(() => { for (const id of ['eval', 'next']) document.querySelector(`details.sec[data-id="${id}"]`).open = true; });
  await page.waitForFunction(() => /FESTA DELLA ZUCCA/.test(document.querySelector('details.sec[data-id="eval"]').innerText));
  assert.doesNotMatch(await page.evaluate(() => document.querySelector('details.sec[data-id="next"]').innerText), /FESTA DELLA ZUCCA/);
  await page.locator('details.sec[data-id="eval"] .row', { hasText: 'FESTA DELLA ZUCCA' }).getByRole('button', { name: 'Mi interessa', exact: true }).click();
  await page.waitForFunction(() => /locandina/.test(document.querySelector('details.sec[data-id="next"]').innerText));
  await page.locator('details.sec[data-id="next"] .row', { hasText: 'FESTA DELLA ZUCCA' }).locator('.main').click();
  await page.waitForSelector('.sheet img.thumb', { timeout: 8000 });
  assert.equal(await page.locator('.sheet').last().getByRole('button', { name: /Condividi foto/ }).count(), 1);   // anche nella scheda salvata
  await page.locator('.sheet img.thumb').click();
  await page.waitForSelector('img.thumb-full');
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('img.thumb-full'));
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  assert.match(page.url(), /index\.html$/);
});
await step('foto: se il lettore di testo non si scarica, la scheda si apre lo stesso con la foto', async () => {
  await page.evaluate(() => { delete window.Tesseract; });
  const buf = await fakeJpeg();
  await page.click('#fab'); await page.getByRole('button', { name: /Evento da foto o locandina/ }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Scegli dalla galleria/ }).click()]);
  await chooser.setFiles({ name: 'locandina.jpg', mimeType: 'image/jpeg', buffer: buf });
  await page.waitForSelector('.sheet-head h2:has-text("Nuovo evento")', { timeout: 40000 });
  assert.match(await page.locator('.sheet .warn').first().innerText(), /Non sono riuscito a leggere il testo/);
  assert.equal(await page.locator('.sheet img.thumb').count(), 1);
  assert.equal(await page.getByLabel('Titolo *').inputValue(), '');
  await page.locator('.sheet .sheet-head .icon-btn').click();
  await sheet().getByRole('button', { name: /Chiudi senza salvare/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('foto: annullare la lettura non apre nulla', async () => {
  await page.evaluate(() => { window.Tesseract = { createWorker: async () => { await new Promise((r) => setTimeout(r, 1500)); return { recognize: async () => ({ data: { text: 'TESTO LENTO\nSabato 5 dicembre 2026' } }), terminate: async () => {} }; } }; });
  const buf = await fakeJpeg();
  await page.click('#fab'); await page.getByRole('button', { name: /Evento da foto o locandina/ }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Scegli dalla galleria/ }).click()]);
  await chooser.setFiles({ name: 'locandina.jpg', mimeType: 'image/jpeg', buffer: buf });
  await page.waitForSelector('.sheet-head h2:has-text("Leggo la locandina")');
  await page.locator('.sheet .sheet-head .icon-btn').click();
  await page.waitForTimeout(2500);
  assert.equal(await page.locator('.sheet').count(), 0);
});
await step('link di Facebook da solo: scheda senza titolo inventato e con istruzioni chiare', async () => {
  await addMenu('Evento da link o testo');
  await page.locator('.sheet textarea').fill('https://www.facebook.com/events/998877665/');
  await sheet().getByRole('button', { name: 'Leggi' }).click();
  await page.waitForSelector('.sheet-head h2:has-text("Nuovo evento")');
  assert.equal(await page.getByLabel('Titolo *').inputValue(), '');
  assert.match(await page.getByLabel('Link dell\'evento').inputValue(), /facebook\.com\/events\/998877665/);
  assert.match(await page.locator('.sheet .warn').first().innerText(), /Facebook e Instagram non permettono/);
  await page.locator('.sheet .sheet-head .icon-btn').click();
  await sheet().getByRole('button', { name: /Chiudi senza salvare/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('Google Maps: testo condiviso → scelta tra più posti → scheda con nome, indirizzo e posizione', async () => {
  nominatimLog.length = 0;
  const shared = 'Bar Centrale\nVia Roma 1, 36061 Bassano del Grappa VI\nhttps://maps.app.goo.gl/AbCdEf123';
  const target = URL_APP + '?text=' + encodeURIComponent(shared);
  // La finestra chiusa nel passaggio prima fa un "indietro" del browser che può finire un attimo dopo: aspetto che sia finito
  // (e, se la richiesta viene annullata, riprovo), come fa un telefono quando apre l'app da "Condividi" a pagina nuova.
  await page.waitForTimeout(700);
  const chooser = '.sheet-head h2:has-text("Quale di questi posti è?")';
  for (let k = 0; k < 3; k++) {
    try { await page.goto(target, { waitUntil: 'load' }); } catch (e) { if (!/ERR_ABORTED/.test(e.message)) throw e; }
    try { await page.waitForSelector(chooser, { timeout: 5000 }); break; } catch (e) { if (k === 2) throw e; }
  }
  await page.waitForSelector('.sheet-head h2:has-text("Quale di questi posti è?")', { timeout: 15000 });
  assert.equal(nominatimLog[0], 'Via Roma 1, 36061 Bassano del Grappa');     // indirizzo ripulito dalla sigla della provincia
  assert.equal(await page.locator('.sheet .menu-list .btn').count(), 3);     // 2 posti + "Nessuno di questi"
  await page.locator('.sheet .menu-list .btn').first().click();
  await page.waitForSelector('.sheet-head h2:has-text("Nuovo luogo")');
  assert.equal(await page.getByLabel('Nome *').inputValue(), 'Bar Centrale');
  assert.match(await page.locator('.sheet').last().innerText(), /45\.76640, 11\.73540/);
  assert.match(await page.locator('.sheet .warn').first().innerText(), /scelta da te/);
  assert.equal(new URL(page.url()).search, '');                               // il testo condiviso non resta nell'indirizzo
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('Google Maps: coordinate incollate → posizione esatta, senza interrogare nessun servizio', async () => {
  nominatimLog.length = 0;
  await addMenu('Link di Google Maps');
  await page.locator('.sheet textarea').fill('Bar Alpino\n45.76540, 11.73450');
  await sheet().getByRole('button', { name: 'Crea il luogo' }).click();
  await page.waitForSelector('.sheet-head h2:has-text("Nuovo luogo")');
  assert.equal(await page.getByLabel('Nome *').inputValue(), 'Bar Alpino');
  assert.match(await page.locator('.sheet').last().innerText(), /45\.76540, 11\.73450/);
  assert.match(await page.locator('.sheet .warn').first().innerText(), /coordinate/);
  assert.deepEqual(nominatimLog, []);
  await sheet().getByRole('button', { name: 'Salva' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('Condividi / Naviga: Waze, WhatsApp, Google Maps, altre app e copia coordinate', async () => {
  await page.evaluate(() => { for (const id of ['eval', 'see']) document.querySelector(`details.sec[data-id="${id}"]`).open = true; });
  await page.waitForFunction(() => /Bar Alpino/.test(document.querySelector('details.sec[data-id="eval"]').innerText));
  // segnaposto importato da Google Maps (categoria "da vedere"): ⭐ → riquadro "Da vedere"
  await page.locator('details.sec[data-id="eval"] .row', { hasText: 'Bar Alpino' }).getByRole('button', { name: 'Mi interessa', exact: true }).click();
  await page.waitForFunction(() => /Bar Alpino/.test(document.querySelector('details.sec[data-id="see"]').innerText));
  await page.locator('details.sec[data-id="see"]').getByText('Bar Alpino').first().click();
  await page.waitForSelector('.sheet-head h2:has-text("Bar Alpino")');
  await sheet().getByRole('button', { name: /Condividi \/ Naviga/ }).click();
  await page.waitForSelector('.sheet-head h2:has-text("Condividi o naviga")');
  const hrefs = await page.locator('.sheet').last().locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  assert.ok(hrefs.some((h) => h === 'https://waze.com/ul?ll=45.765400,11.734500&navigate=yes'), 'Waze');
  assert.ok(hrefs.some((h) => h.startsWith('https://wa.me/?text=') && decodeURIComponent(h).includes('Bar Alpino') && decodeURIComponent(h).includes('45.765400,11.734500')), 'WhatsApp');
  assert.ok(hrefs.some((h) => h === 'https://www.google.com/maps/dir/?api=1&destination=45.765400,11.734500'), 'Google Maps');
  assert.ok(hrefs.some((h) => h.startsWith('geo:45.765400,11.734500?q=')), 'geo');
  assert.match(await sheet().innerText(), /non le tue note/);
  // "indietro" chiude solo la finestra di condivisione e lascia la scheda
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 1);
  assert.match(await page.locator('.sheet-head h2').last().innerText(), /Bar Alpino/);
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('Google Maps: link breve senza nome né indirizzo → spiegazione chiara', async () => {
  await addMenu('Link di Google Maps');
  await page.locator('.sheet textarea').fill('https://maps.app.goo.gl/SoloLink99');
  await sheet().getByRole('button', { name: 'Crea il luogo' }).click();
  await page.waitForSelector('.sheet-head h2:has-text("Nuovo luogo")');
  assert.match(await page.locator('.sheet .warn').first().innerText(), /coordinate/);
  await page.locator('.sheet .sheet-head .icon-btn').click();
  await sheet().getByRole('button', { name: /Chiudi senza salvare/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('novità dall\'altro telefono: banner, etichetta "nuovo" e segna come viste', async () => {
  const seed = (docs) => page.evaluate(async (d) => {
    const { createStore } = await import('./js/store.js');
    const st = createStore(); await st.init();
    await st.importAll({ app: 'attivita-eventi', version: 1, events: d.events, places: d.places, trips: [], thumbs: {} });
  }, docs);
  await page.waitForTimeout(700);
  const t0 = Date.now() + 5000;
  await seed({ events: [{ id: 'novita1', title: 'Sagra di prova', category: 'mangiare', status: 'da_valutare', startDate: '2026-11-29', by: 'Elena', createdAt: t0 }], places: [{ id: 'novita2', name: 'Belvedere nuovo', category: 'vedere', status: 'da_valutare', by: 'Elena', createdAt: t0 }] });
  // un elemento senza autore (creato da me) non è mai una novità
  await seed({ events: [], places: [{ id: 'mio1', name: 'Posto mio', category: 'vedere', status: 'da_valutare', by: '', createdAt: t0 }] });
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('.cal-grid');
  await page.waitForFunction(() => !document.querySelector('#news').hidden);
  assert.match(await page.locator('#news').innerText(), /Elena ha aggiunto 2 novità/);
  await page.evaluate(() => { document.querySelector('details.sec[data-id="eval"]').open = true; });
  await page.waitForFunction(() => /Sagra di prova/.test(document.querySelector('details.sec[data-id="eval"]').innerText));
  assert.equal(await page.locator('details.sec[data-id="eval"] .tag.new').count(), 2);
  assert.doesNotMatch(await page.locator('details.sec[data-id="eval"] .row', { hasText: 'Posto mio' }).innerText(), /nuovo/);
  // aprire un elemento lo segna come visto
  await page.locator('details.sec[data-id="eval"] .row', { hasText: 'Sagra di prova' }).locator('.main').click();
  await page.waitForSelector('.sheet-head h2:has-text("Sagra di prova")');
  await page.goBack(); await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
  await page.waitForFunction(() => /Elena ha aggiunto: Belvedere nuovo/.test(document.querySelector('#news').innerText));
  // "Segna come viste" toglie tutto
  await page.locator('#news').getByRole('button', { name: 'Segna come viste' }).click();
  await page.waitForFunction(() => document.querySelector('#news').hidden);
  await page.waitForFunction(() => document.querySelectorAll('details.sec[data-id="eval"] .tag.new').length === 0);
  // dopo un ricaricamento restano viste
  await page.waitForTimeout(700); await page.reload({ waitUntil: 'load' }); await page.waitForSelector('.cal-grid');
  assert.equal(await page.locator('#news').isHidden(), true);
});
await step('"Usa il GPS ora": posizione trovata, ripiego sulla rete e permesso negato spiegato', async () => {
  const stub = (mode) => page.evaluate((m) => {
    navigator.geolocation.getCurrentPosition = (ok, err, opts) => {
      if (m === 'ok' || (m === 'rete' && !opts.enableHighAccuracy)) return setTimeout(() => ok({ coords: { latitude: 45.71099, longitude: 11.58335, accuracy: 30 } }), 20);
      setTimeout(() => err({ code: m === 'negato' ? 1 : 3 }), 20);
    };
  }, mode);
  const open = async () => { await page.locator('#btnSettings').click(); await page.waitForSelector('.sheet-head h2:has-text("Impostazioni")'); };
  const close = async () => { await page.locator('.sheet .sheet-head .icon-btn').click(); await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0); };
  await page.route('https://nominatim.openstreetmap.org/reverse**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ display_name: 'Via Gasparona, Riva, Breganze', name: '' }) }));
  await stub('negato'); await open();
  await page.getByRole('button', { name: 'Usa il GPS ora' }).click();
  await page.waitForFunction(() => /permesso di posizione è negato/i.test(document.querySelector('.sheet').innerText));
  assert.ok(await page.getByRole('button', { name: 'Usa il GPS ora' }).isEnabled());      // si può riprovare
  await close();
  await stub('rete'); await open();                                                       // GPS non risponde in tempo → posizione da rete
  await page.getByRole('button', { name: 'Usa il GPS ora' }).click();
  await page.waitForFunction(() => /Via Gasparona/.test(document.querySelector('.sheet').innerText));
  await page.getByRole('button', { name: 'Rimuovi casa' }).click();
  await page.waitForFunction(() => /Non impostata/.test(document.querySelector('.sheet').innerText));
  await stub('ok');
  await page.getByRole('button', { name: 'Usa il GPS ora' }).click();
  await page.waitForFunction(() => /Via Gasparona/.test(document.querySelector('.sheet').innerText));
  await close();
});
await step('Impostazioni: mostra versione e novità', async () => {
  await page.click('#btnSettings');
  await page.waitForSelector('.sheet-head h2:has-text("Impostazioni")');
  assert.match(await sheet().innerText(), /Versione \d+\.\d+\.\d+/);
  await sheet().locator('details.fold summary').click();
  assert.match(await sheet().innerText(), /Prima versione/);
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 0);
});
await step('aspetto: sfondo con la foto d\'autunno, tema chiaro, nessun filtro scuro sulla mappa', async () => {
  const css = await page.evaluate(() => ({
    bodyBg: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    before: getComputedStyle(document.body, '::before').backgroundImage,
    text: getComputedStyle(document.body).color,
  }));
  assert.match(css.scheme, /light/);
  assert.match(css.before, /img\/sfondo\.jpg/);
  assert.equal((await page.request.get(new URL('img/sfondo.jpg', URL_APP).href)).status(), 200);
  assert.equal(css.bodyBg, 'rgba(0, 0, 0, 0)');
  const filt = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'leaflet-tile-pane'; document.body.append(d); const f = getComputedStyle(d).filter; d.remove(); return f; });
  assert.equal(filt, 'none');
});

await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: false });
await page.screenshot({ path: `${SHOTS}/home-full.png`, fullPage: true });

await step('nessun errore JavaScript imprevisto', async () => { assert.deepEqual(errors, []); });
console.log(`\n${n} verifiche superate`);
await browser.close();

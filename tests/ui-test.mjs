// Prova dell'interfaccia in un browser vero (modalità "solo questo telefono"; rete esterna non disponibile).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const URL_APP = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const SHOTS = process.argv[3] || '/tmp';
let n = 0;
const step = async (name, fn) => { try { await fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 4).join('\n   ')); process.exitCode = 1; } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
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
  assert.equal(await page.locator('details.sec').count(), 5);
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
  await page.locator('details.sec[data-id="places"] > summary').click();
  await page.waitForFunction(() => /Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="places"]').innerText));
  assert.equal(await page.locator('details.sec[data-id="places"] .badge').innerText(), '1');
  await page.locator('details.sec[data-id="eval"] > summary').click();
  await page.waitForFunction(() => /Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="eval"]').innerText));
  // filtro per categoria: tolgo "Mangiare" → luogo, mercato e sagra (anche la sagra è stata riconosciuta come "mangiare") spariscono
  await page.locator('#filters .chip.cat-mangiare').click();
  await page.waitForFunction(() => !/Osteria Al Ponte/.test(document.querySelector('details.sec[data-id="places"]').innerText));
  await page.waitForFunction(() => document.querySelectorAll('.cal-cell[data-date="2026-11-28"] .bar').length === 0);
  await page.locator('#filters .chip.cat-mangiare').click();
  await page.waitForFunction(() => document.querySelectorAll('.cal-cell[data-date="2026-11-28"] .bar').length === 2);
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
await step('statistiche e backup (esporta / reimporta)', async () => {
  await page.locator('details.sec[data-id="stats"] > summary').click();
  await page.waitForFunction(() => /eventi salvati/.test(document.querySelector('details.sec[data-id="stats"]').innerText));
  const data = await page.evaluate(async () => {
    const { createStore } = await import('./js/store.js');
    const s = createStore(); await s.init();
    const j = await s.exportAll({ thumbs: true });
    return { ev: j.events.length, pl: j.places.length, tr: j.trips.length, app: j.app };
  });
  assert.deepEqual(data, { ev: 3, pl: 1, tr: 1, app: 'attivita-eventi' });
  const bad = await page.evaluate(async () => {
    const { createStore } = await import('./js/store.js');
    const s = createStore(); await s.init();
    try { await s.importAll({ app: 'altro' }); return 'accettato'; } catch (e) { return e.message; }
  });
  assert.match(bad, /non sembra un backup/);
});
await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: false });
await page.screenshot({ path: `${SHOTS}/home-full.png`, fullPage: true });

await step('nessun errore JavaScript imprevisto', async () => { assert.deepEqual(errors, []); });
console.log(`\n${n} verifiche superate`);
await browser.close();

// version.js — numero di versione dell'app. Si aggiorna a ogni modifica:
//   • primo numero  = cambiamento grande (l'app funziona in modo diverso)
//   • secondo numero = funzione nuova o cambiata in modo visibile
//   • terzo numero  = piccola correzione
// Il numero va tenuto uguale anche in sw.js (lo controlla il test automatico).
export const APP_VERSION = '1.7.0';
export const APP_DATE = '2026-11-21';
export const CHANGELOG = [
  { v: '1.7.0', d: '2026-11-25', items: [
    'Viaggi → "Cose da portare": nuovi bottoni "Invia la lista (Google Keep…)" e "Copia la lista". Il menu di Android permette di scegliere Google Keep, WhatsApp, e-mail. Si inviano le voci non ancora messe in valigia.',
  ] },
  { v: '1.6.0', d: '2026-11-22', items: [
    'Novità tra i due telefoni: ogni evento o luogo porta il nome di chi l\'ha creato; se l\'altro telefono aggiunge qualcosa compare un avviso (app aperta) e, alla riapertura, un riquadro giallo "Elena ha aggiunto…" con l\'etichetta 🆕 sulle schede nuove. Si segnano come viste aprendole o con "Segna come viste".',
    'Tolto il numero di versione dal titolo (resta nelle Impostazioni) e tolto il bottone per ingrandire la mappa.',
    '"Usa il GPS ora": risponde subito, ripiega sulla posizione da rete se il GPS non arriva, scrive il risultato o l\'errore dentro la finestra e spiega come attivare il permesso.',
  ] },
  { v: '1.5.0', d: '2026-11-21', items: [
    'Nuova categoria "Luoghi" per i segnaposto GPS: si sceglie accanto a Mangiare, Attività e Da vedere quando si crea o si modifica un luogo.',
    'I segnaposto "Luoghi" non vanno in "Da valutare": stanno subito nel riquadro "Luoghi" (se li segni ✕ vanno in "Non mi interessa").',
    'Sulla mappa hanno il loro colore (verde acqua) e c\'è il nuovo bottone filtro "Luoghi" in alto.',
    'Gli eventi continuano ad avere solo Mangiare, Attività e Da vedere.',
  ] },
  { v: '1.4.0', d: '2026-11-21', items: [
    'Nuovo sfondo: la foto del bosco d\'autunno al posto del tramonto.',
  ] },
  { v: '1.3.1', d: '2026-11-21', items: [
    'Luoghi di tipo "attività": appena creati vanno in "Da valutare"; con ⭐ "mi interessa" passano in "Prossimi eventi" (sotto gli eventi, nella parte "Attività (senza data)").',
    '"Luoghi" raccoglie le attività già fatte; "Da vedere" e "Mangiare" restano come prima.',
    'Il calendario mostra sempre tutti gli eventi che hanno una data, qualunque sia lo stato e anche con il filtro "stato" attivo.',
  ] },
  { v: '1.3.0', d: '2026-11-21', items: [
    'Riquadri riorganizzati in base allo stato: tutto ciò che è nuovo o "da valutare" sta solo in "Da valutare".',
    'Con ⭐ "mi interessa": gli eventi vanno in "Prossimi eventi"; i luoghi in "Da vedere", "Mangiare" oppure "Luoghi" (attività) secondo la categoria.',
    'Con ✕ "non mi interessa": tutto va nel nuovo riquadro "Non mi interessa" (si può rimettere in "Da valutare" con un tocco).',
    'Nuovi riquadri "Da vedere" e "Mangiare".',
  ] },
  { v: '1.2.1', d: '2026-11-21', items: [
    'Tasto "Condividi foto" su tutte le locandine: nella scheda dell\'evento, nella bozza da foto e nell\'anteprima ingrandita. Si invia solo la foto ridotta, senza posizione GPS né dati nascosti.',
  ] },
  { v: '1.2.0', d: '2026-11-21', items: [
    'Nuovo pulsante "Condividi / Naviga" su luoghi ed eventi con posizione (anche nel fumetto sulla mappa): Waze, WhatsApp, Google Maps, altre app di mappe, condivisione Android e copia delle coordinate.',
    'Viene inviata solo la posizione (nome, indirizzo, punto sulla mappa), mai le note personali.',
  ] },
  { v: '1.1.0', d: '2026-11-20', items: [
    'Corretto: la foto della locandina ora viene letta (prima la scelta del file si perdeva).',
    'Se la lettura del testo non riesce, si apre comunque la scheda con la foto allegata.',
    'Link: Facebook e Instagram salvano solo il link e spiegano cosa fare; con Claude attivo si leggono anche i siti normali.',
    'Posizione da Google Maps: nome e indirizzo puliti, coordinate incollate lette esattamente, scelta tra più risultati.',
    'Nuovo aspetto chiaro con sfondo da tramonto; mappa chiara.',
    'Anteprime delle locandine più grandi e apribili a tutto schermo.',
    'Tolta la sezione Statistiche.',
    'Il numero di versione si vede in alto e nelle Impostazioni.',
  ] },
  { v: '1.0.0', d: '2026-11-19', items: ['Prima versione.'] },
];

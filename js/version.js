// version.js — numero di versione dell'app. Si aggiorna a ogni modifica:
//   • primo numero  = cambiamento grande (l'app funziona in modo diverso)
//   • secondo numero = funzione nuova o cambiata in modo visibile
//   • terzo numero  = piccola correzione
// Il numero va tenuto uguale anche in sw.js (lo controlla il test automatico).
export const APP_VERSION = '1.1.0';
export const APP_DATE = '2026-11-20';
export const CHANGELOG = [
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

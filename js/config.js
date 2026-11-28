// config.js — l'unico file da modificare per collegare la sincronizzazione.
//
// I valori di FIREBASE_CONFIG si copiano dalla console Firebase
// (Impostazioni progetto → Le tue app → App web → "Configurazione SDK").
// Non sono segreti: la protezione dei dati sta nelle regole in firestore.rules
// e nella lista delle e-mail autorizzate (vedi la guida).
//
// Se lasci tutto vuoto l'app funziona lo stesso, ma solo su questo telefono (senza sincronizzazione).

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBnKUAwJGE-qpbpgivLJ6y5iFqL7C2P71s',
  authDomain: 'attivita-eventi.firebaseapp.com',
  projectId: 'attivita-eventi',
  storageBucket: 'attivita-eventi.firebasestorage.app',
  messagingSenderId: '911591498107',
  appId: '1:911591498107:web:eee59cc7355292b7caddde',
};

// Versione della libreria Firebase caricata dal sito ufficiale di Google.
export const FIREBASE_VERSION = '10.14.1';

// Modelli per il riconoscimento opzionale con Claude (chiave API inserita nelle Impostazioni).
export const CLAUDE_MODELS = {
  'claude-sonnet-5-5': 'Sonnet 5.5 — più preciso (circa 0,008 $ a foto)',
  'claude-haiku-5-5': 'Haiku 5.5 — più economico (circa 0,0004 $ a foto)',
};
export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-5-5';

// Indirizzo del "lettore dei link di Google Maps" (si crea una volta sola dalle Impostazioni dell'app).
// Se lo scrivi qui vale per tutti i telefoni; se resta vuoto lo si può inserire nelle Impostazioni di ogni telefono.
export const MAPS_RESOLVER_URL = '';

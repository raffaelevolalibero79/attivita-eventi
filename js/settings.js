// settings.js — impostazioni personali (solo su questo telefono) e schermata Impostazioni.
// Posizione di casa e chiave Claude NON vengono mai inviate al database condiviso.
import { el, openSheet, toast, confirmDialog, field, select, downloadText, pickFile, clear } from './ui.js';
import { CLAUDE_MODELS, CLAUDE_DEFAULT_MODEL, FIREBASE_CONFIG, MAPS_RESOLVER_URL } from './config.js';
import { RESOLVER_CODE } from './resolvercode.js';
import { isResolverUrl, pingResolver } from './mapsresolver.js';
import { geocode, getPosition, reverseGeocode } from './geo.js';
import { cloudConfigured, isLocalOnlyChosen, setLocalOnly } from './store.js';
import { APP_VERSION, APP_DATE, CHANGELOG } from './version.js';

const KEY = 'ae.settings';
const DEFAULTS = { homeLat: null, homeLng: null, homeName: '', claudeKey: '', claudeModel: CLAUDE_DEFAULT_MODEL, useClaude: false, ocrAfterClaudeFail: true, resolverUrl: '' };

export function getSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    const s = { ...DEFAULTS };
    if (Number.isFinite(o.homeLat) && Number.isFinite(o.homeLng)) { s.homeLat = o.homeLat; s.homeLng = o.homeLng; }
    if (typeof o.homeName === 'string') s.homeName = o.homeName.slice(0, 200);
    if (typeof o.claudeKey === 'string' && /^[\w-]{10,300}$/.test(o.claudeKey)) s.claudeKey = o.claudeKey;
    if (CLAUDE_MODELS[o.claudeModel]) s.claudeModel = o.claudeModel;
    s.useClaude = !!o.useClaude && !!s.claudeKey;
    const ru = typeof o.resolverUrl === 'string' ? o.resolverUrl.trim() : '';
    s.resolverUrl = isResolverUrl(ru) ? ru : (isResolverUrl(MAPS_RESOLVER_URL) ? MAPS_RESOLVER_URL : '');
    return s;
  } catch { return { ...DEFAULTS }; }
}
export function saveSettings(patch) {
  const s = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { toast('Non riesco a salvare le impostazioni su questo telefono.', 'error'); }
  return s;
}
export const getHome = () => { const s = getSettings(); return s.homeLat != null ? { lat: s.homeLat, lng: s.homeLng, name: s.homeName } : null; };

const STATUS_TEXT = {
  local: 'Solo su questo telefono', connecting: 'Connessione…', ok: 'Sincronizzato', syncing: 'Sincronizzo…',
  offline: 'Offline: le modifiche partiranno al ritorno della rete', denied: 'Account non autorizzato', error: 'Errore di sincronizzazione',
};
export const statusText = (s) => STATUS_TEXT[s] || '';

export function openSettings({ store, onChanged }) {
  const s0 = getSettings();
  const body = el('div', { style: { display: 'contents' } });

  // --- Account e famiglia ---
  const accBox = el('div', { class: 'field' });
  const renderAcc = async () => {
    clear(accBox);
    accBox.append(el('div', { class: 'lbl', text: 'Account e famiglia' }));
    if (store.mode === 'cloud') {
      accBox.append(el('div', { text: `Accesso come ${store.user ? store.user.email : '—'}` }));
      accBox.append(el('div', { class: 'hint', text: `Stato: ${statusText(store.status)}` }));
      const list = el('div', { class: 'seg' });
      accBox.append(el('div', { class: 'hint', text: 'Indirizzi Google autorizzati a vedere e modificare i dati:' }), list);
      try {
        const emails = await store.getAllowed();
        for (const e of emails) {
          list.append(el('span', { class: 'chip', text: e }, emails.length > 1 && e !== (store.user.email || '').toLowerCase() ? el('button', {
            type: 'button', 'aria-label': `Rimuovi ${e}`, text: '✕', style: { background: 'none', border: 0, color: 'inherit', padding: '0 0 0 4px' },
            onclick: async () => { if (await confirmDialog(`Togliere l'accesso a ${e}?`, { ok: 'Rimuovi', danger: true })) { try { await store.removeAllowed(e); renderAcc(); } catch (er) { toast(er.message, 'error'); } } },
          }) : null));
        }
      } catch { list.append(el('div', { class: 'hint', text: 'Elenco non disponibile.' })); }
      const inp = el('input', { type: 'email', placeholder: 'altra.persona@gmail.com', autocomplete: 'off' });
      accBox.append(el('div', { class: 'grid2' }, inp, el('button', { class: 'btn', text: 'Aggiungi', onclick: async () => {
        try { await store.addAllowed(inp.value); inp.value = ''; toast('Indirizzo aggiunto'); renderAcc(); } catch (e) { toast(e.message, 'error'); }
      } })));
      accBox.append(el('button', { class: 'btn danger small', text: 'Esci da questo account', onclick: async () => { await store.signOut(); sh.close(); } }));
    } else if (cloudConfigured()) {
      accBox.append(el('div', { class: 'hint', text: 'Ora usi l\'app solo su questo telefono, senza sincronizzazione.' }));
      accBox.append(el('button', { class: 'btn', text: 'Attiva la sincronizzazione famiglia', onclick: () => { setLocalOnly(false); location.reload(); } }));
    } else {
      accBox.append(el('div', { class: 'hint', text: 'La sincronizzazione tra i due telefoni non è ancora collegata (vedi la guida, passo "Firebase"). Intanto i dati restano solo su questo telefono.' }));
    }
    if (store.mode === 'cloud') {
      accBox.append(el('button', { class: 'btn small', text: 'Passa a "solo questo telefono"', onclick: async () => {
        if (await confirmDialog('I dati online non verranno cancellati, ma questo telefono smetterà di usarli. Continuare?')) { setLocalOnly(true); location.reload(); }
      } }));
    }
  };
  renderAcc();

  // --- Casa ---
  const homeBox = el('div', { class: 'field' });
  const renderHome = () => {
    clear(homeBox);
    const h = getHome();
    homeBox.append(el('div', { class: 'lbl', text: 'Posizione di casa (resta solo su questo telefono)' }));
    homeBox.append(el('div', { text: h ? (h.name || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`) : 'Non impostata — serve per il filtro "distanza da casa".' }));
    const inp = el('input', { type: 'search', placeholder: 'Cerca un indirizzo (es. Breganze)' });
    const res = el('div', { class: 'menu-list' });
    homeBox.append(inp, el('div', { class: 'grid2' },
      el('button', { class: 'btn small', text: 'Cerca', onclick: async () => {
        clear(res);
        try {
          const r = await geocode(inp.value);
          if (!r.length) res.append(el('div', { class: 'hint', text: 'Nessun risultato.' }));
          for (const x of r) res.append(el('button', { class: 'btn small', text: x.label, onclick: () => { saveSettings({ homeLat: x.lat, homeLng: x.lng, homeName: x.label.split(',').slice(0, 2).join(',') }); renderHome(); onChanged(); } }));
        } catch (e) { toast(e.message, 'error'); }
      } }),
      el('button', { class: 'btn small', text: 'Usa il GPS ora', onclick: async (ev) => {
        // il risultato (o l'errore) si legge qui sotto, dentro questa finestra, non in un avviso che sparisce
        const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Cerco la posizione…';
        clear(res); res.append(el('div', { class: 'hint', text: 'Cerco la tua posizione… se il telefono chiede il permesso, tocca "Consenti".' }));
        try {
          const p = await getPosition();
          let name = 'Posizione GPS';
          try { const r = await reverseGeocode(p.lat, p.lng); if (r && r.label) name = r.label.split(',').slice(0, 2).join(','); } catch { /* facoltativo */ }
          saveSettings({ homeLat: p.lat, homeLng: p.lng, homeName: name }); renderHome(); onChanged(); toast('Casa impostata sulla tua posizione attuale.');
        } catch (e) {
          clear(res); res.append(el('div', { class: 'warn', text: e.message }));
          btn.disabled = false; btn.textContent = 'Usa il GPS ora';
        }
      } })), res);
    if (h) homeBox.append(el('button', { class: 'btn small danger', text: 'Rimuovi casa', onclick: () => { saveSettings({ homeLat: null, homeLng: null, homeName: '' }); renderHome(); onChanged(); } }));
  };
  renderHome();

  // --- Lettore dei link di Google Maps ---
  const resInp = el('input', { type: 'text', autocomplete: 'off', placeholder: 'https://script.google.com/macros/s/…/exec', value: s0.resolverUrl, 'aria-label': 'Indirizzo del lettore' });
  const resMsg = el('div', { class: 'hint' });
  const say = (t, cls = 'hint') => { resMsg.className = cls; resMsg.textContent = t; };
  const resBox = el('div', { class: 'field' },
    el('div', { class: 'lbl', text: 'Lettore dei link di Google Maps (consigliato, gratuito)' }),
    el('div', { class: 'hint', text: 'I link brevi di Google Maps (maps.app.goo.gl) non dicono dove si trova il posto: senza lettore l\'app cerca solo per nome e può trovare un posto con lo stesso nome in un\'altra città. Il lettore è un piccolo programma che crei una volta sola nel tuo account Google: segue il link e restituisce la posizione vera. Legge solo link di Google Maps e non salva niente.' }),
    el('details', { class: 'fold' }, el('summary', { text: 'Come attivarlo (una volta sola, circa 5 minuti)' }),
      el('ol', { class: 'steps' },
        el('li', { text: 'Tocca qui sotto "Copia il codice".' }),
        el('li', { text: 'Apri script.google.com con il tuo account Google (da telefono: menu del browser → "Sito desktop") e tocca "Nuovo progetto".' }),
        el('li', { text: 'Cancella il codice che c\'è e incolla quello copiato. Tocca l\'icona del dischetto per salvare.' }),
        el('li', { text: 'Tocca "Distribuisci" → "Nuova distribuzione" → icona ingranaggio → "App web". In "Esegui come" scegli "Io"; in "Chi ha accesso" scegli "Chiunque". Poi "Distribuisci".' }),
        el('li', { text: 'Quando chiede "Autorizza accesso": scegli il tuo account → "Avanzate" → "Vai a … (non sicuro)" → "Consenti". È il tuo programma: non è "non sicuro", Google lo scrive per tutti i programmi non pubblicati.' }),
        el('li', { text: 'Copia l\'"URL dell\'app web" che compare e incollalo qui sotto, poi tocca "Salva" e "Prova".' }))),
    el('button', { type: 'button', class: 'btn small', text: '📋 Copia il codice', onclick: async () => {
      try { await navigator.clipboard.writeText(RESOLVER_CODE); say('Codice copiato: ora incollalo in Google Apps Script (punto 3).'); }
      catch { say('Non riesco a copiare automaticamente.', 'warn'); }
    } }),
    field('Indirizzo del lettore (URL dell\'app web)', resInp),
    el('div', { class: 'seg' },
      el('button', { type: 'button', class: 'btn small', text: 'Salva', onclick: () => {
        const v = resInp.value.trim();
        if (v && !isResolverUrl(v)) return say('L\'indirizzo non sembra giusto: deve iniziare con https://script.google.com/macros/s/ e finire con /exec', 'warn');
        saveSettings({ resolverUrl: v }); say(v ? 'Salvato su questo telefono.' : 'Lettore tolto.'); onChanged();
      } }),
      el('button', { type: 'button', class: 'btn small', text: 'Prova', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true; say('Provo…');
        try { await pingResolver(resInp.value.trim()); say('✔ Il lettore risponde. Premi "Salva" se non l\'hai ancora fatto.'); }
        catch (er) { say(`Il lettore non risponde: ${er.message}`, 'warn'); }
        finally { b.disabled = false; }
      } })),
    resMsg);

  // --- Claude ---
  const keyInp = el('input', { type: 'password', autocomplete: 'off', placeholder: 'sk-ant-…', value: s0.claudeKey });
  const modelSel = select(Object.entries(CLAUDE_MODELS), s0.claudeModel);
  const useBox = el('input', { type: 'checkbox', checked: s0.useClaude, style: { width: '22px', height: '22px', minHeight: 0 } });
  const claudeBox = el('div', { class: 'field' },
    el('div', { class: 'lbl', text: 'Riconoscimento preciso con Claude (facoltativo, a pagamento)' }),
    el('div', { class: 'hint', text: 'Senza chiave l\'app legge le foto con l\'OCR gratuito, direttamente sul telefono. Con la chiave la foto viene inviata ad Anthropic per essere letta e poi non viene conservata dall\'app. La chiave resta solo su questo telefono.' }),
    field('Chiave API', keyInp), field('Modello', modelSel),
    el('label', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, useBox, 'Usa Claude per leggere foto e testi'),
    el('button', { class: 'btn small', text: 'Salva impostazioni Claude', onclick: () => {
      const k = keyInp.value.trim();
      if (k && !/^[\w-]{10,300}$/.test(k)) return toast('La chiave non sembra valida.', 'error');
      saveSettings({ claudeKey: k, claudeModel: modelSel.value, useClaude: useBox.checked && !!k });
      toast(k ? 'Impostazioni Claude salvate' : 'Chiave rimossa'); onChanged();
    } }));

  // --- Backup ---
  const withThumbs = el('input', { type: 'checkbox', checked: true, style: { width: '22px', height: '22px', minHeight: 0 } });
  const backupBox = el('div', { class: 'field' },
    el('div', { class: 'lbl', text: 'Backup' }),
    el('label', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, withThumbs, 'Includi le anteprime delle foto'),
    el('div', { class: 'grid2' },
      el('button', { class: 'btn small', text: 'Esporta backup', onclick: async () => {
        try {
          const data = await store.exportAll({ thumbs: withThumbs.checked });
          downloadText(`attivita-eventi-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
          toast('Backup salvato nei file scaricati');
        } catch (e) { toast('Esportazione non riuscita: ' + e.message, 'error'); }
      } }),
      el('button', { class: 'btn small', text: 'Importa backup', onclick: async () => {
        const f = await pickFile('application/json,.json');
        if (!f) return;
        if (f.size > 25 * 1024 * 1024) return toast('File troppo grande.', 'error');
        try {
          const n = await store.importAll(JSON.parse(await f.text()));
          toast(`Importati ${n} elementi`);
        } catch (e) { toast(e.message || 'File non valido', 'error'); }
      } })),
    el('div', { class: 'hint', text: 'L\'importazione aggiunge o aggiorna gli elementi, senza cancellare quelli che già ci sono.' }));

  const news = el('details', { class: 'fold' }, el('summary', { text: 'Novità delle versioni' }),
    ...CHANGELOG.map((c) => el('div', null, el('div', { class: 'sub', text: `Versione ${c.v} · ${c.d}` }), el('ul', { class: 'news' }, c.items.map((t) => el('li', { text: t }))))));
  append2(body, accBox, homeBox, resBox, claudeBox, backupBox,
    el('div', { class: 'hint', text: `Versione ${APP_VERSION} (${APP_DATE}) · progetto sincronizzazione: ${FIREBASE_CONFIG.projectId || 'non collegato'}${isLocalOnlyChosen() ? ' (disattivata)' : ''}` }), news);

  const sh = openSheet({ title: 'Impostazioni', body });
  return sh;
}
function append2(parent, ...kids) { for (const k of kids) parent.append(k); }

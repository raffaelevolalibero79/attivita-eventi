// settings.js — impostazioni personali (solo su questo telefono) e schermata Impostazioni.
// Posizione di casa e chiave Claude NON vengono mai inviate al database condiviso.
import { el, openSheet, toast, confirmDialog, field, select, downloadText, pickFile, clear } from './ui.js';
import { CLAUDE_MODELS, CLAUDE_DEFAULT_MODEL, FIREBASE_CONFIG } from './config.js';
import { geocode, getPosition } from './geo.js';
import { cloudConfigured, isLocalOnlyChosen, setLocalOnly } from './store.js';
import { APP_VERSION, APP_DATE, CHANGELOG } from './version.js';

const KEY = 'ae.settings';
const DEFAULTS = { homeLat: null, homeLng: null, homeName: '', claudeKey: '', claudeModel: CLAUDE_DEFAULT_MODEL, useClaude: false, ocrAfterClaudeFail: true };

export function getSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    const s = { ...DEFAULTS };
    if (Number.isFinite(o.homeLat) && Number.isFinite(o.homeLng)) { s.homeLat = o.homeLat; s.homeLng = o.homeLng; }
    if (typeof o.homeName === 'string') s.homeName = o.homeName.slice(0, 200);
    if (typeof o.claudeKey === 'string' && /^[\w-]{10,300}$/.test(o.claudeKey)) s.claudeKey = o.claudeKey;
    if (CLAUDE_MODELS[o.claudeModel]) s.claudeModel = o.claudeModel;
    s.useClaude = !!o.useClaude && !!s.claudeKey;
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
      el('button', { class: 'btn small', text: 'Usa il GPS ora', onclick: async () => {
        try { const p = await getPosition(); saveSettings({ homeLat: p.lat, homeLng: p.lng, homeName: 'Posizione GPS' }); renderHome(); onChanged(); } catch (e) { toast(e.message, 'error'); }
      } })), res);
    if (h) homeBox.append(el('button', { class: 'btn small danger', text: 'Rimuovi casa', onclick: () => { saveSettings({ homeLat: null, homeLng: null, homeName: '' }); renderHome(); onChanged(); } }));
  };
  renderHome();

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
  append2(body, accBox, homeBox, claudeBox, backupBox,
    el('div', { class: 'hint', text: `Versione ${APP_VERSION} (${APP_DATE}) · progetto sincronizzazione: ${FIREBASE_CONFIG.projectId || 'non collegato'}${isLocalOnlyChosen() ? ' (disattivata)' : ''}` }), news);

  const sh = openSheet({ title: 'Impostazioni', body });
  return sh;
}
function append2(parent, ...kids) { for (const k of kids) parent.append(k); }

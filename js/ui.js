// ui.js — piccoli attrezzi per costruire l'interfaccia in modo sicuro.
// Regola d'oro: il testo dell'utente (o preso da locandine e link) entra SOLO come testo, mai come HTML.

export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = String(v);
      else if (k.startsWith('on')) { if (typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v); }
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') n[k] = !!v;
      else if (k === 'html' || k === 'innerHTML' || k === 'outerHTML') continue; // vietato
      else n.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(n, kids);
  return n;
}
export function append(parent, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    parent.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return parent;
}
export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
export const $ = (sel, root = document) => root.querySelector(sel);

// ---------- avvisi ----------
export function toast(msg, kind = '') {
  const host = document.getElementById('toasts');
  const t = el('div', { class: 'toast ' + kind, text: msg });
  host.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3200);
}

// ---------- finestre a scorrimento dal basso (il tasto "indietro" di Android le chiude) ----------
const stack = [];
let sentinel = false;   // true = nella cronologia c'è una voce "segnaposto" per le finestre aperte
let backs = 0;          // "indietro" chiesti dall'app (per togliere il segnaposto) e non ancora arrivati

const pushSentinel = () => { history.pushState({ ae: 1 }, ''); sentinel = true; };
function ensureSentinel() {
  if (sentinel) return;
  if (backs) return;    // il vecchio segnaposto sta per essere tolto: il nuovo si mette appena l'"indietro" è arrivato (vedi sotto)
  pushSentinel();
}
function releaseSentinel() {
  setTimeout(() => {
    if (!stack.length && sentinel) { sentinel = false; backs++; history.back(); }
  }, 0);
}
addEventListener('popstate', () => {
  if (backs) {
    backs--;
    if (!backs && stack.length && !sentinel) pushSentinel();   // nel frattempo si è aperta un'altra finestra
    return;
  }
  if (!sentinel) return;
  sentinel = false;
  const top = stack[stack.length - 1];
  if (top) {
    if (top.guard && top.guard()) {
      pushSentinel();
      askDiscard().then((ok) => { if (ok) top.api.forceClose(); });
      return;
    }
    top.dispose();
  }
  if (stack.length) pushSentinel();
});
const askDiscard = () => confirmDialog('Ci sono modifiche non salvate. Chiudere senza salvare?', { ok: 'Chiudi senza salvare', cancel: 'Continua a modificare', danger: true });

export function openSheet({ title = '', body = null, footer = null, onClose = null, closable = true, guard = null, backdropClose = true } = {}) {
  const host = document.getElementById('sheets');
  const bodyEl = el('div', { class: 'sheet-body' }, body);
  const footEl = footer ? el('div', { class: 'sheet-foot' }, footer) : null;
  const titleEl = el('h2', { text: title });
  const closeBtn = closable ? el('button', { class: 'icon-btn', 'aria-label': 'Chiudi', text: '✕', onclick: () => api.close() }) : null;
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'sheet-head' }, titleEl, closeBtn), bodyEl, footEl);
  const overlay = el('div', { class: 'overlay' }, sheet);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay && closable && backdropClose) api.close(); });
  let done = false;
  const entry = {
    guard,
    dispose() {
      if (done) return;
      done = true;
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      overlay.remove();
      if (onClose) { try { onClose(); } catch (e) { console.error(e); } }
    },
  };
  const api = {
    el: sheet, body: bodyEl, footer: footEl, overlay,
    setTitle: (t) => { titleEl.textContent = t; },
    setBody: (...nodes) => { clear(bodyEl); append(bodyEl, nodes); },
    hide: (on) => overlay.classList.toggle('hide', !!on),
    close() { if (guard && guard()) askDiscard().then((ok) => { if (ok) api.forceClose(); }); else api.forceClose(); },
    forceClose() { entry.dispose(); releaseSentinel(); },
    get open() { return !done; },
  };
  entry.api = api;
  stack.push(entry);
  ensureSentinel();
  host.append(overlay);
  return api;
}
export const closeAllSheets = () => { while (stack.length) stack[stack.length - 1].dispose(); releaseSentinel(); };

export function confirmDialog(message, { ok = 'Conferma', cancel = 'Annulla', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (answered) return; answered = true; resolve(v); sh.close(); };
    const sh = openSheet({
      title: 'Conferma',
      body: el('p', { text: message, style: { margin: 0 } }),
      footer: [el('button', { class: 'btn', text: cancel, onclick: () => answer(false) }), el('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), text: ok, onclick: () => answer(true) })],
      onClose: () => { if (!answered) { answered = true; resolve(false); } },
    });
  });
}

// ---------- piccoli componenti ----------
export function chip(label, pressed, onclick, cls = '') {
  const b = el('button', { class: 'chip ' + cls, type: 'button', 'aria-pressed': pressed ? 'true' : 'false', text: label });
  b.addEventListener('click', () => { onclick(b); });
  return b;
}
export function field(label, input, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 9);
  if (input && input.setAttribute && !input.id) input.id = id;
  return el('div', { class: 'field' }, el('label', { for: input && input.id, text: label }), input, hint ? el('div', { class: 'hint', text: hint }) : null);
}
export function select(options, value) {
  const s = el('select');
  for (const [v, t] of options) s.append(el('option', { value: v, text: t, selected: v === value }));
  s.value = value;
  return s;
}
export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}
// Anteprima ingrandita (a tutta larghezza). Si chiude con ✕, toccando fuori o con il tasto indietro.
export function openImage(src, title = 'Locandina') {
  return openSheet({ title, body: el('img', { class: 'thumb-full', src, alt: title }) });
}
// Immagine piccola che si tocca per ingrandirla
export function thumbImg(src, alt = 'Anteprima della locandina') {
  const img = el('img', { class: 'thumb', src, alt, role: 'button', tabindex: '0', title: 'Tocca per ingrandire' });
  const open = () => openImage(src, alt);
  img.addEventListener('click', open);
  img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return img;
}
export function pickFile(accept, capture) {
  return new Promise((resolve) => {
    const inp = el('input', { type: 'file', accept, capture: capture || null, style: { display: 'none' } });
    let settled = false;
    inp.addEventListener('change', () => { settled = true; resolve(inp.files && inp.files[0] ? inp.files[0] : null); inp.remove(); });
    inp.addEventListener('cancel', () => { if (!settled) { settled = true; resolve(null); inp.remove(); } });
    document.body.append(inp);
    inp.click();
  });
}

// edittools.js — barra "Incolla · Copia · Taglia · Seleziona tutto" in ogni campo dove si scrive.
// Compare sopra il campo quando lo tocchi. Serve perché su alcuni telefoni il menu di sistema
// (tieni premuto → Incolla) non appare dentro l'app.
import { toast } from './ui.js';

const TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password', '']);
let bar = null, target = null, timer = null, raf = 0;

export function isEditable(n) {
  if (!n || n.nodeType !== 1) return false;
  if (n.tagName === 'TEXTAREA') return !n.readOnly && !n.disabled;
  if (n.tagName !== 'INPUT') return false;
  return TYPES.has(String(n.getAttribute('type') || 'text').toLowerCase()) && !n.readOnly && !n.disabled;
}

// Selezione del campo; i campi "email" non la espongono: in quel caso si lavora in fondo al testo.
function sel(el) {
  const s = el.selectionStart, e = el.selectionEnd;
  if (typeof s === 'number' && typeof e === 'number') return { s, e, exact: true };
  return { s: el.value.length, e: el.value.length, exact: false };
}
const fire = (el) => el.dispatchEvent(new Event('input', { bubbles: true }));

async function writeClip(text, el) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* si prova l'altro modo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove(); try { el.focus({ preventScroll: true }); } catch { /* ignora */ }
    return ok;
  } catch { return false; }
}

async function paste(el) {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch {
    toast('Non riesco a leggere gli appunti. Se il telefono chiede il permesso tocca "Consenti"; altrimenti usa l\'icona degli appunti sulla tastiera.', 'error');
    return;
  }
  if (!text) return toast('Gli appunti sono vuoti.');
  // altre parti dell'app possono gestire l'incolla a modo loro (es. un elenco incollato su più righe)
  try {
    const dt = new DataTransfer(); dt.setData('text/plain', text);
    if (!el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))) return;
  } catch { /* browser senza questi oggetti: si incolla e basta */ }
  if (el.tagName !== 'TEXTAREA') text = text.replace(/\s*[\r\n]+\s*/g, ' ');
  const { s, e } = sel(el);
  const room = (el.maxLength > 0 ? el.maxLength : Infinity) - (el.value.length - (e - s));
  text = text.slice(0, Math.max(0, room));
  try { el.setRangeText(text, s, e, 'end'); } catch { el.value = el.value + text; }
  fire(el);
}

async function copy(el, cut) {
  const { s, e } = sel(el);
  const part = e > s ? el.value.slice(s, e) : el.value;
  if (!part) return;
  if (!(await writeClip(part, el))) return toast('Non sono riuscito a copiare.', 'error');
  if (cut) {
    if (e > s) { try { el.setRangeText('', s, e, 'end'); } catch { el.value = ''; } } else el.value = '';
    fire(el);
    toast('Tagliato');
  } else toast(e > s ? 'Copiato' : 'Copiato tutto il testo');
}

function selectAll(el) {
  el.select();
  try { el.setSelectionRange(0, el.value.length); } catch { /* ignora */ }
}

function refresh() {
  if (!bar || !target) return;
  const empty = !target.value, pw = String(target.type).toLowerCase() === 'password';
  bar.querySelector('[data-act="copy"]').disabled = empty || pw;
  bar.querySelector('[data-act="cut"]').disabled = empty || pw;
  bar.querySelector('[data-act="all"]').disabled = empty;
}

function build() {
  bar = document.createElement('div');
  bar.className = 'edit-tools';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Modifica testo');
  for (const [act, label] of [['paste', 'Incolla'], ['copy', 'Copia'], ['cut', 'Taglia'], ['all', 'Seleziona tutto']]) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.act = act; b.textContent = label;
    b.addEventListener('pointerdown', (ev) => ev.preventDefault());     // il campo resta selezionato e la tastiera aperta
    b.addEventListener('mousedown', (ev) => ev.preventDefault());
    b.addEventListener('click', async () => {
      const el = target;
      if (!el || !el.isConnected) return hide();
      try { el.focus({ preventScroll: true }); } catch { /* ignora */ }
      if (act === 'paste') await paste(el);
      else if (act === 'copy') await copy(el, false);
      else if (act === 'cut') await copy(el, true);
      else selectAll(el);
      refresh();
    });
    bar.append(b);
  }
  document.body.append(bar);
}

function hide() {
  if (bar) bar.hidden = true;
  target = null;
  clearInterval(timer); timer = null;
}

function place() {
  raf = 0;
  if (!bar || bar.hidden || !target) return;
  if (!target.isConnected) return hide();
  const r = target.getBoundingClientRect();
  const vv = window.visualViewport;
  const vh = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const vw = document.documentElement.clientWidth;
  bar.style.visibility = r.bottom < 0 || r.top > vh ? 'hidden' : 'visible';   // campo scorso fuori dallo schermo
  const h = bar.offsetHeight || 46, w = bar.offsetWidth || 330;
  const body = target.closest('.sheet-body');            // dentro una finestra la barra non copre il titolo e il tasto di chiusura
  const minTop = Math.max(4, body ? body.getBoundingClientRect().top + 2 : 4);
  let top = r.top - h - 6;
  if (top < minTop) top = r.bottom + 6;                  // niente spazio sopra: la barra va sotto
  top = Math.max(4, Math.min(top, vh - h - 4));
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  bar.style.top = `${Math.round(top)}px`;
  bar.style.left = `${Math.round(left)}px`;
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };

function show(el) {
  if (!bar) build();
  target = el;
  bar.hidden = false;
  refresh();
  place();
  if (!timer) timer = setInterval(() => {                // se il campo sparisce o si passa altrove, la barra sparisce
    if (!target || !target.isConnected) return hide();
    const a = document.activeElement;
    if (a !== target && !isEditable(a)) hide();
    else { refresh(); place(); }
  }, 500);
}

export function initEditTools() {
  if (initEditTools.done) return;
  initEditTools.done = true;
  document.addEventListener('focusin', (e) => { if (isEditable(e.target)) show(e.target); });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!isEditable(document.activeElement)) hide(); }, 250);
  });
  document.addEventListener('input', (e) => { if (e.target === target) refresh(); }, true);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', schedule); window.visualViewport.addEventListener('scroll', schedule); }
}

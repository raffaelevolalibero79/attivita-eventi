// share.js — condividere o aprire una posizione con altre app (Waze, WhatsApp, Google Maps, ecc.).
// Viene condivisa SOLO la posizione del luogo scelto (nome, indirizzo e punto sulla mappa), mai note personali, voti o altro.
// Tutti i collegamenti sono costruiti solo da numeri (coordinate) e da testo codificato: nessun dato diventa codice.
import { el, openSheet, toast } from './ui.js';

import { locationLinks, hasLocation, packingText } from './sharelinks.js';
export { locationLinks, hasLocation, packingText };

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* ripiego sotto */ }
  try {
    const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = t; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export function openShareSheet(item) {
  const L = locationLinks(item);
  if (!L) { toast('Questo elemento non ha ancora una posizione sulla mappa.', 'error'); return null; }
  const row = (icon, title, sub, attrs) => el(attrs.href ? 'a' : 'button', { class: 'btn', ...attrs },
    el('span', { text: icon, style: { fontSize: '22px' } }), el('span', null, title, el('small', { text: sub })));
  const items = [];
  if (navigator.share) {
    items.push(row('📤', 'Condividi con un’altra app…', 'WhatsApp, Telegram, SMS, e-mail e tutte le altre', {
      type: 'button',
      onclick: async () => { try { await navigator.share({ title: L.title, text: L.text }); } catch (e) { if (e && e.name !== 'AbortError') toast('Non sono riuscito a condividere.', 'error'); } },
    }));
  }
  items.push(row('💬', 'Invia su WhatsApp', 'Scegli tu il contatto o il gruppo', { href: L.whatsapp, target: '_blank', rel: 'noopener noreferrer' }));
  items.push(row('🚗', 'Naviga con Waze', 'Apre Waze con la destinazione già impostata', { href: L.waze, target: '_blank', rel: 'noopener noreferrer' }));
  items.push(row('🧭', 'Naviga con Google Maps', 'Percorso verso questo punto', { href: L.gmapsNav, target: '_blank', rel: 'noopener noreferrer' }));
  items.push(row('📍', 'Apri con un’altra app di mappe', 'Il telefono chiede quale app usare', { href: L.geo }));
  items.push(row('📋', 'Copia coordinate e link', L.ll, {
    type: 'button',
    onclick: async () => { toast((await copyText(`${L.ll}\n${L.maps}`)) ? 'Copiato: ora puoi incollarlo dove vuoi.' : 'Non sono riuscito a copiare.', ''); },
  }));
  return openSheet({
    title: 'Condividi o naviga',
    body: [el('div', { class: 'hint', text: `${L.title}: viene inviata solo la posizione (nome, indirizzo e punto sulla mappa), non le tue note.` }), el('div', { class: 'menu-list' }, items)],
  });
}

export function shareButton(item) {
  if (!hasLocation(item)) return null;
  return el('button', { type: 'button', class: 'btn small', text: '📤 Condividi / Naviga', onclick: () => openShareSheet({ name: item.name || item.title || item.venue, address: item.address, lat: item.lat, lng: item.lng }) });
}

// Lista "Cose da portare": condivisione di Android (Google Keep, WhatsApp, e-mail…) oppure copia negli appunti
export async function sharePacking(trip, mode = 'share') {
  const t = packingText(trip);
  if (!t.count) { toast('La lista è vuota: aggiungi qualche voce.', 'error'); return; }
  const full = `${t.title}\n${t.body}`;
  if (mode === 'share' && navigator.share) {
    try { await navigator.share({ title: t.title, text: full }); return; } catch (e) { if (e && e.name === 'AbortError') return; /* ripiego: copia */ }
  }
  toast((await copyText(full)) ? 'Lista copiata: incollala in Google Keep o dove vuoi.' : 'Non sono riuscito a copiare la lista.', '');
}

// calendar.js — calendario con vista mensile e pannello del giorno selezionato.
import { el, clear } from './ui.js';
import * as U from './util.js';
import { eventRow } from './sections.js';

export function createCalendar(host, { onOpenEvent, onStatus, onAddForDate }) {
  const today = U.localToday();
  const st = { y: +today.slice(0, 4), m: +today.slice(5, 7), sel: today, events: [] };

  function setMonth(delta) { const n = U.addMonths(st.y, st.m, delta); st.y = n.y; st.m = n.m; render(); }
  function goToDate(d) { const p = U.parseYmd(d); if (!p) return; st.y = p.y; st.m = p.m; st.sel = d; render(); }

  function occurrencesByDay(grid) {
    const from = grid[0], to = grid[41];
    const map = new Map();
    for (const ev of st.events) {
      for (const o of U.expandOccurrences(ev, from, to, 400)) {
        const last = o.endDate < to ? o.endDate : to;
        for (let d = o.date < from ? from : o.date; d <= last; d = U.addDays(d, 1)) {
          if (!map.has(d)) map.set(d, []);
          map.get(d).push({ ...o, dayDate: d });
        }
      }
    }
    for (const list of map.values()) list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '') || a.ev.title.localeCompare(b.ev.title, 'it'));
    return map;
  }

  function render(events) {
    if (events) st.events = events;
    const grid = U.monthGrid(st.y, st.m);
    const byDay = occurrencesByDay(grid);
    clear(host);

    host.append(el('div', { class: 'cal-head' },
      el('button', { type: 'button', 'aria-label': 'Mese precedente', text: '‹', onclick: () => setMonth(-1) }),
      el('h2', { text: U.monthTitle(st.y, st.m) }),
      el('button', { type: 'button', class: 'today-btn', text: 'Oggi', onclick: () => goToDate(today) }),
      el('button', { type: 'button', 'aria-label': 'Mese successivo', text: '›', onclick: () => setMonth(1) })));

    host.append(el('div', { class: 'cal-dow' }, U.DOW_SHORT.map((d) => el('div', { text: d }))));
    const cells = grid.map((d) => {
      const p = U.parseYmd(d);
      const list = byDay.get(d) || [];
      const cls = ['cal-cell'];
      if (p.m !== st.m) cls.push('out');
      if (d === today) cls.push('today');
      if (d === st.sel) cls.push('sel');
      const bars = list.slice(0, 3).map((o) => el('span', { class: `bar cat-${U.CATEGORIES[o.ev.category] ? o.ev.category : 'attivita'} st-${U.STATUSES[o.ev.status] ? o.ev.status : 'da_valutare'}` }, el('span', { class: 't', text: o.ev.title })));
      return el('button', { type: 'button', class: cls.join(' '), dataset: { date: d }, 'aria-label': `${U.formatDateIt(d)}: ${list.length} eventi`, onclick: () => { st.sel = d; render(); } },
        el('span', { class: 'num', text: String(p.d) }), bars, list.length > 3 ? el('span', { class: 'more', text: `+${list.length - 3}` }) : null);
    });
    const gridEl = el('div', { class: 'cal-grid' }, cells);
    let x0 = null;
    gridEl.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    gridEl.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 70) setMonth(dx < 0 ? 1 : -1);
    }, { passive: true });
    host.append(gridEl);

    host.append(el('div', { class: 'legend' },
      ...U.EVENT_CAT_KEYS.map((k) => el('span', { class: `cat-${k}` }, el('i'), U.CATEGORIES[k].label)),
      el('span', null, el('i', { class: 'dash' }), 'da valutare'),
      el('span', null, el('i', { class: 'fade' }), 'non mi interessa'),
      el('span', null, '⭐ in risalto = mi interessa')));

    const sel = byDay.get(st.sel) || [];
    const panel = el('div', { class: 'day-panel' },
      el('h3', { text: U.formatDateIt(st.sel).replace(/^(\w+)/, (w) => ({ lun: 'lunedì', mar: 'martedì', mer: 'mercoledì', gio: 'giovedì', ven: 'venerdì', sab: 'sabato', dom: 'domenica' }[w] || w)) }),
      sel.length ? sel.map((o) => eventRow({ ...o, date: o.date }, { onOpen: (ev) => onOpenEvent(ev, o.date), onStatus })) : el('div', { class: 'empty', text: 'Nessun evento in questo giorno.' }),
      el('button', { type: 'button', class: 'btn small', text: '＋ Aggiungi evento in questo giorno', onclick: () => onAddForDate(st.sel) }));
    host.append(panel);
  }

  return { render, goToDate, get selected() { return st.sel; } };
}

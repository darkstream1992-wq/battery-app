// Gemeinsame Anzeigebausteine der Ansichten.

import { h } from './dom.js';
import { batterieText, formatDate, netzteilName, statusText, todayIso } from './model.js';
import * as S from './state.js';

const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cabinet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 3v18M9 11v2M15 11v2"/>',
  book: '<path d="M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z"/><path d="M8 9h6"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

/** Statisches SVG-Icon (nur eigene, feste Pfade – nie Nutzerdaten). */
export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

export function statusBadge(f) {
  return h(
    'div',
    { class: `badge status-${f.status}` },
    h('strong', null, statusText(f)),
    f.datum && f.status !== 'ok' ? h('small', null, `Termin ${formatDate(f.datum)}`) : null,
  );
}

export const batterieZeilen = (netzteil) =>
  netzteil.batterien.length
    ? netzteil.batterien.map((b) =>
        h('div', { class: 'item-sub' }, batterieText(b), b.einbaudatum ? ` · eingebaut ${formatDate(b.einbaudatum)}` : ' · Einbaudatum fehlt'),
      )
    : [h('div', { class: 'item-sub muted' }, 'Keine Batterien erfasst')];

export { netzteilName };

/** Hinweisleiste, wenn Änderungen noch nicht exportiert wurden. */
export function backupBanner() {
  const n = S.changesSinceExport();
  if (!n) return null;
  const last = S.lastExportAt();
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;
  const warn = days == null || days > 30;
  const anzahl = n === 1 ? '1 Datensatz' : `${n} Datensätze`;
  const text = last
    ? `${anzahl} seit dem letzten Export geändert (${formatDate(todayIso(new Date(last)))}).`
    : `Noch nie exportiert: ${anzahl} nur auf diesem Gerät.`;
  return h(
    'div',
    { class: warn ? 'banner warn' : 'banner' },
    h('span', null, text),
    h('a', { class: 'btn small', href: '#/mehr' }, 'Sichern / Teilen'),
  );
}

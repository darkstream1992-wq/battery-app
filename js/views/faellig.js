// Startseite: Liste der anstehenden Batterietausche.

import { add, h } from '../dom.js';
import { compareFaellig, formatDate } from '../model.js';
import { scanAndOpen, schrankHref } from '../flows.js';
import * as S from '../state.js';
import { backupBanner, batterieZeilen, icon, netzteilName, statusBadge } from '../ui.js';

let filter = 'aktion'; // aktion = überfällig + bald | ueberfaellig | bald | unbekannt | ok | alle

const CARDS = [
  ['ueberfaellig', 'Überfällig'],
  ['bald', 'Bald fällig'],
  ['unbekannt', 'Datum fehlt'],
  ['ok', 'In Ordnung'],
];

const matches = (status) =>
  filter === 'alle' || (filter === 'aktion' ? status === 'ueberfaellig' || status === 'bald' : filter === status);

export function renderFaellig(root) {
  const items = S.faelligkeiten().sort(
    (a, b) => compareFaellig(a.f, b.f) || a.schrank.key.localeCompare(b.schrank.key, 'de', { numeric: true }),
  );
  const counts = Object.fromEntries(CARDS.map(([s]) => [s, items.filter((i) => i.f.status === s).length]));
  const visible = items.filter((i) => matches(i.f.status));

  const setFilter = (value) => {
    filter = value;
    root.replaceChildren();
    renderFaellig(root);
  };

  add(root, 
    h(
      'div',
      { class: 'actions-row' },
      h('button', { type: 'button', class: 'btn primary big', onclick: scanAndOpen }, icon('scan'), 'Scannen'),
      h('a', { class: 'btn big', href: '#/schraenke?suche=1' }, icon('search'), 'Suchen'),
    ),
    backupBanner(),
  );

  if (!items.length) {
    add(root, 
      h(
        'div',
        { class: 'empty' },
        h('h2', null, 'Noch keine Schränke erfasst'),
        h('p', null, 'Scanne den Strichcode eines Schranks, um ihn anzulegen. Wenn du Daten von einem anderen Gerät hast, kannst du sie unter „Mehr“ importieren.'),
      ),
    );
    return;
  }

  add(root, 
    h(
      'div',
      { class: 'stat-cards' },
      CARDS.map(([status, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: `stat status-${status}${filter === status ? ' active' : ''}`,
            'aria-pressed': filter === status ? 'true' : 'false',
            onclick: () => setFilter(filter === status ? 'aktion' : status),
          },
          h('span', { class: 'stat-n' }, String(counts[status])),
          h('span', { class: 'stat-l' }, label),
        ),
      ),
    ),
    h(
      'div',
      { class: 'list-head' },
      h('h2', null, { aktion: 'Handlungsbedarf', alle: 'Alle Netzteile' }[filter] ?? CARDS.find(([s]) => s === filter)?.[1]),
      filter === 'alle'
        ? h('button', { type: 'button', class: 'btn small', onclick: () => setFilter('aktion') }, 'Nur Handlungsbedarf')
        : h('button', { type: 'button', class: 'btn small', onclick: () => setFilter('alle') }, 'Alle anzeigen'),
    ),
  );

  if (!visible.length) {
    add(root, 
      h('div', { class: 'empty' }, h('p', null, filter === 'aktion' ? 'Aktuell ist kein Batterietausch fällig.' : 'Keine Einträge in dieser Auswahl.')),
    );
    return;
  }

  add(root, 
    h(
      'div',
      { class: 'list' },
      visible.map(({ schrank, netzteil, f }) =>
        h(
          'a',
          { class: `card item status-${f.status}`, href: schrankHref(schrank.key) },
          h(
            'div',
            { class: 'item-main' },
            h('div', { class: 'item-title' }, schrank.inventarnummer, schrank.raum ? h('span', { class: 'muted' }, ` · ${schrank.raum}`) : null),
            netzteil ? h('div', { class: 'item-sub' }, netzteilName(netzteil)) : h('div', { class: 'item-sub muted' }, 'Kein Netzteil erfasst'),
            netzteil ? batterieZeilen(netzteil) : null,
            netzteil && f.datum && f.status === 'ok' ? h('div', { class: 'item-sub muted' }, `Nächster Tausch ${formatDate(f.datum)}`) : null,
          ),
          statusBadge(f),
        ),
      ),
    ),
  );
}

// Schrankliste mit Suche.

import { add, h } from '../dom.js';
import { editNetzteil, editSchrank } from '../editors.js';
import { scanAndOpen, schrankHref } from '../flows.js';
import { faelligkeitSchrank, netzteilName } from '../model.js';
import * as S from '../state.js';
import { icon, statusBadge } from '../ui.js';

let query = '';

const haystack = (s) =>
  [
    s.inventarnummer,
    s.raum,
    s.bemerkung,
    ...s.netzteile.flatMap((n) => [n.hersteller, n.modell, ...n.batterien.flatMap((b) => [b.hersteller, b.typ])]),
  ]
    .join(' ')
    .toLowerCase();

export function renderSchraenke(root, { focusSearch = false } = {}) {
  const input = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Inventarnummer, Raum, Gerät …',
    value: query,
    'aria-label': 'Schränke suchen',
    autocomplete: 'off',
    enterKeyHint: 'search',
  });
  const list = h('div', { class: 'list' });
  const count = h('p', { class: 'muted count' });

  async function neuerSchrank() {
    const s = await editSchrank({ inventarnummer: query.trim() && /\d/.test(query) ? query.trim() : '' });
    if (s) {
      location.hash = schrankHref(s.key);
      await editNetzteil(s.key);
    }
  }

  function update() {
    query = input.value;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = S.listSchraenke().sort((a, b) => a.key.localeCompare(b.key, 'de', { numeric: true }));
    const hits = all.filter((s) => {
      const hay = haystack(s);
      return tokens.every((t) => hay.includes(t));
    });
    count.textContent = all.length ? `${hits.length} von ${all.length} Schränken` : '';
    list.replaceChildren(
      ...hits.map((s) => {
        const f = faelligkeitSchrank(s, undefined, S.getSettings().vorlaufTage);
        return h(
          'a',
          { class: `card item status-${f.status}`, href: schrankHref(s.key) },
          h(
            'div',
            { class: 'item-main' },
            h('div', { class: 'item-title' }, s.inventarnummer, s.raum ? h('span', { class: 'muted' }, ` · ${s.raum}`) : null),
            s.netzteile.length
              ? s.netzteile.map((n) => h('div', { class: 'item-sub' }, netzteilName(n)))
              : h('div', { class: 'item-sub muted' }, 'Kein Netzteil erfasst'),
            s.bemerkung ? h('div', { class: 'item-sub muted clamp' }, s.bemerkung) : null,
          ),
          statusBadge(f),
        );
      }),
    );
    if (!hits.length) {
      list.append(
        h(
          'div',
          { class: 'empty' },
          h('p', null, all.length ? 'Kein Schrank gefunden.' : 'Noch keine Schränke erfasst.'),
          h('button', { type: 'button', class: 'btn primary', onclick: neuerSchrank }, 'Neuen Schrank anlegen'),
        ),
      );
    }
  }

  input.addEventListener('input', update);
  add(root, 
    h('div', { class: 'actions-row' }, input, h('button', { type: 'button', class: 'btn primary', onclick: scanAndOpen, title: 'Strichcode scannen' }, icon('scan'), 'Scannen')),
    h('div', { class: 'list-head' }, count, h('button', { type: 'button', class: 'btn small', onclick: neuerSchrank }, icon('plus'), 'Neuer Schrank')),
    list,
  );
  update();
  if (focusSearch) input.focus();
}

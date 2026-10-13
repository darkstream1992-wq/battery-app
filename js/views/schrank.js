// Detailansicht eines Schranks mit Netzteilen, Batterien und Tauschhistorie.

import { add, h } from '../dom.js';
import { confirmBox, toast } from '../dialogs.js';
import { editNetzteil, editSchrank, tauschDialog } from '../editors.js';
import { openOrCreate } from '../flows.js';
import { batterieText, formatDate, faelligkeitNetzteil } from '../model.js';
import * as S from '../state.js';
import { batterieZeilen, netzteilName, statusBadge } from '../ui.js';

export function renderSchrank(root, key) {
  const schrank = S.getSchrank(key);
  if (!schrank) {
    add(root, 
      h(
        'div',
        { class: 'empty' },
        h('h2', null, 'Schrank nicht gefunden'),
        h('p', null, `Zur Inventarnummer „${key}“ gibt es keinen Eintrag.`),
        h('button', { type: 'button', class: 'btn primary', onclick: () => openOrCreate(key) }, 'Neu anlegen'),
        h('a', { class: 'btn', href: '#/schraenke' }, 'Zur Schrankliste'),
      ),
    );
    return;
  }

  const vorlauf = S.getSettings().vorlaufTage;

  const kopf = h(
    'section',
    { class: 'card detail-head' },
    h(
      'div',
      null,
      h('p', { class: 'eyebrow' }, 'Schrank'),
      h('h1', null, schrank.inventarnummer),
      h('p', { class: 'meta' }, h('span', null, 'Raum: '), h('strong', null, schrank.raum || '–')),
      schrank.bemerkung ? h('p', { class: 'note' }, schrank.bemerkung) : null,
    ),
    h('button', { type: 'button', class: 'btn small', onclick: () => editSchrank({ schrank }) }, 'Bearbeiten'),
  );

  const netzteile = schrank.netzteile.map((n) => {
    const f = faelligkeitNetzteil(n, undefined, vorlauf);
    const historie = [...n.historie].sort((a, b) => (a.datum < b.datum ? 1 : -1));
    return h(
      'section',
      { class: `card np status-${f.status}` },
      h(
        'div',
        { class: 'np-head' },
        h('div', null, h('h2', null, netzteilName(n)), h('p', { class: 'muted' }, `Tauschintervall ${n.intervallJahre} Jahre`)),
        statusBadge(f),
      ),
      h('div', { class: 'np-bats' }, batterieZeilen(n)),
      f.datum ? h('p', { class: 'muted' }, `Nächster Tausch: ${formatDate(f.datum)}`) : null,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => tauschDialog(schrank.key, n.id) }, 'Batterien getauscht'),
        h('button', { type: 'button', class: 'btn', onclick: () => editNetzteil(schrank.key, n) }, 'Bearbeiten'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn danger-text',
            onclick: async () => {
              const ok = await confirmBox({
                title: 'Netzteil entfernen?',
                message: `„${netzteilName(n)}“ wird mit Batterien und Historie aus diesem Schrank entfernt.`,
                confirmLabel: 'Entfernen',
                danger: true,
              });
              if (!ok) return;
              const aktuell = S.getSchrank(schrank.key);
              await S.saveSchrank({ ...aktuell, netzteile: aktuell.netzteile.filter((x) => x.id !== n.id) });
              toast('Netzteil entfernt.');
            },
          },
          'Entfernen',
        ),
      ),
      historie.length
        ? h(
            'details',
            { class: 'historie' },
            h('summary', null, `Tauschhistorie (${historie.length})`),
            h(
              'ul',
              null,
              historie.map((t) =>
                h(
                  'li',
                  null,
                  h('strong', null, formatDate(t.datum)),
                  ' – ausgebaut: ',
                  t.ausgebaut.length
                    ? t.ausgebaut.map((b) => `${batterieText(b)}${b.einbaudatum ? ` (eingebaut ${formatDate(b.einbaudatum)})` : ''}`).join('; ')
                    : 'keine Angabe',
                ),
              ),
            ),
          )
        : null,
    );
  });

  add(root, 
    h('a', { class: 'back', href: '#/schraenke' }, '‹ Alle Schränke'),
    kopf,
    ...netzteile,
    schrank.netzteile.length === 0 ? h('div', { class: 'empty' }, h('p', null, 'In diesem Schrank ist noch kein Netzteil erfasst.')) : null,
    h('button', { type: 'button', class: 'btn big wide', onclick: () => editNetzteil(schrank.key) }, '+ Netzteil hinzufügen'),
    h(
      'div',
      { class: 'danger-zone' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn danger-text',
          onclick: async () => {
            const ok = await confirmBox({
              title: 'Schrank löschen?',
              message: `Schrank „${schrank.inventarnummer}“ samt Netzteilen, Batterien und Historie löschen? Beim nächsten Abgleich wird er auch auf anderen Geräten gelöscht.`,
              confirmLabel: 'Löschen',
              danger: true,
            });
            if (!ok) return;
            await S.removeSchrank(schrank.key);
            toast('Schrank gelöscht.');
            location.hash = '#/schraenke';
          },
        },
        'Schrank löschen',
      ),
    ),
  );
}

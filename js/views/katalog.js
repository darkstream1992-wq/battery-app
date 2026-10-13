// Katalog der Netzteiltypen mit zugehörigen Standard-Batterien.

import { add, h } from '../dom.js';
import { confirmBox, toast } from '../dialogs.js';
import { editKatalog } from '../editors.js';
import { batterieText } from '../model.js';
import * as S from '../state.js';
import { icon } from '../ui.js';

export function renderKatalog(root) {
  const eintraege = S.listKatalog().sort((a, b) => `${a.hersteller} ${a.modell}`.localeCompare(`${b.hersteller} ${b.modell}`, 'de', { numeric: true }));
  const verwendung = (id) => S.listSchraenke().reduce((n, s) => n + s.netzteile.filter((x) => x.katalogId === id).length, 0);

  add(root, 
    h(
      'div',
      { class: 'list-head' },
      h('h2', null, 'Netzteiltypen'),
      h('button', { type: 'button', class: 'btn primary small', onclick: () => editKatalog() }, icon('plus'), 'Neuer Typ'),
    ),
    h('p', { class: 'muted' }, 'Im Katalog steht pro Netzteiltyp, welche Batterien dazugehören und wie oft sie getauscht werden. Beim Anlegen eines Netzteils werden die Werte vorgeschlagen.'),
  );

  if (!eintraege.length) {
    add(root, h('div', { class: 'empty' }, h('p', null, 'Der Katalog ist noch leer. Typen entstehen automatisch, wenn du ein Netzteil anlegst, oder du legst sie hier an.')));
    return;
  }

  add(root, 
    h(
      'div',
      { class: 'list' },
      eintraege.map((k) => {
        const n = verwendung(k.id);
        return h(
          'div',
          { class: 'card item' },
          h(
            'button',
            { type: 'button', class: 'item-main as-button', onclick: () => editKatalog(k) },
            h('div', { class: 'item-title' }, `${k.hersteller} ${k.modell}`),
            k.batterien.length ? k.batterien.map((b) => h('div', { class: 'item-sub' }, batterieText(b))) : h('div', { class: 'item-sub muted' }, 'Keine Batterievorlage'),
            h('div', { class: 'item-sub muted' }, `Tausch alle ${k.intervallJahre} Jahre · in ${n} Netzteil${n === 1 ? '' : 'en'} verwendet`),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn small danger-text',
              onclick: async () => {
                const ok = await confirmBox({
                  title: 'Netzteiltyp löschen?',
                  message: `„${k.hersteller} ${k.modell}“ aus dem Katalog löschen? Bereits erfasste Netzteile bleiben bestehen.`,
                  confirmLabel: 'Löschen',
                  danger: true,
                });
                if (ok) {
                  await S.removeKatalog(k.id);
                  toast('Aus dem Katalog gelöscht.');
                }
              },
            },
            'Löschen',
          ),
        );
      }),
    ),
  );
}

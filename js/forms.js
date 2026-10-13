// Wiederverwendbare Formularbausteine.

import { h } from './dom.js';
import { emptyBatterie, todayIso } from './model.js';

/** Beschriftetes Feld. */
export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'label' }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}

export function textInput(value, props = {}) {
  return h('input', { type: 'text', value: value ?? '', autocomplete: 'off', autocapitalize: 'off', ...props });
}

/**
 * Editor für eine Liste von Batterien (Hersteller, Typ, Kapazität, Anzahl,
 * optional Einbaudatum). Gibt { el, getValue, setValue } zurück.
 */
export function batteryEditor({ initial = [], withDate = true } = {}) {
  const list = h('div', { class: 'bat-list' });
  const rows = [];

  const addBtn = h('button', { type: 'button', class: 'btn small', onclick: () => addRow(emptyBatterie()) }, '+ Weitere Batterie');

  function updateRemoveButtons() {
    rows.forEach((r) => (r.removeBtn.hidden = rows.length < 2));
  }

  function addRow(b) {
    const row = {
      id: b.id,
      hersteller: textInput(b.hersteller, { list: 'dl-bat-hersteller', placeholder: 'z. B. Yuasa' }),
      typ: textInput(b.typ, { list: 'dl-bat-typ', placeholder: 'z. B. NP7-12' }),
      kapazitaet: h('input', { type: 'number', inputMode: 'decimal', min: '0', step: '0.1', value: b.kapazitaetAh ?? '', placeholder: '7' }),
      anzahl: h('input', { type: 'number', inputMode: 'numeric', min: '1', max: '99', step: '1', value: b.anzahl ?? 2 }),
      datum: withDate ? h('input', { type: 'date', value: b.einbaudatum ?? '', max: todayIso() }) : null,
    };
    row.removeBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn icon',
        title: 'Batterie entfernen',
        'aria-label': 'Batterie entfernen',
        onclick: () => {
          rows.splice(rows.indexOf(row), 1);
          row.el.remove();
          updateRemoveButtons();
        },
      },
      '✕',
    );
    row.el = h(
      'fieldset',
      { class: 'bat' },
      h('div', { class: 'bat-head' }, h('span', { class: 'bat-title' }, 'Batterie'), row.removeBtn),
      h(
        'div',
        { class: 'grid2' },
        field('Hersteller', row.hersteller),
        field('Typ', row.typ),
        field('Kapazität (Ah)', row.kapazitaet),
        field('Anzahl', row.anzahl),
        withDate ? field('Einbaudatum', row.datum) : null,
      ),
    );
    rows.push(row);
    list.append(row.el);
    updateRemoveButtons();
  }

  function setValue(batterien) {
    rows.length = 0;
    list.replaceChildren();
    (batterien.length ? batterien : [emptyBatterie()]).forEach(addRow);
  }

  setValue(initial);

  function getValue() {
    return rows
      .map((r) => {
        const kap = r.kapazitaet.value === '' ? null : Number(r.kapazitaet.value);
        const anzahl = Math.max(1, Math.round(Number(r.anzahl.value) || 1));
        return {
          id: r.id,
          hersteller: r.hersteller.value.trim(),
          typ: r.typ.value.trim(),
          kapazitaetAh: Number.isFinite(kap) ? kap : null,
          anzahl,
          einbaudatum: r.datum ? r.datum.value : '',
        };
      })
      // vollständig leere Blöcke ignorieren
      .filter((b) => b.hersteller || b.typ || b.kapazitaetAh != null || b.einbaudatum);
  }

  return { el: h('div', { class: 'bat-editor' }, list, addBtn), getValue, setValue };
}

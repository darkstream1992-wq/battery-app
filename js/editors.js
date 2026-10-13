// Bearbeitungsdialoge für Schrank, Netzteil, Batterientausch und Katalog.

import { h } from './dom.js';
import { openForm, toast } from './dialogs.js';
import { batteryEditor, field, textInput } from './forms.js';
import {
  createKatalogEintrag,
  createNetzteil,
  createSchrank,
  emptyBatterie,
  katalogIdFor,
  normKey,
  netzteilName,
  raumFormatOk,
  tauschen,
  todayIso,
  formatDate,
} from './model.js';
import * as S from './state.js';

const intervallInput = (value) =>
  h('input', { type: 'number', inputMode: 'decimal', min: '0.5', max: '20', step: '0.5', value, required: true });

/** Katalog-Batterien als Vorlage ohne Einbaudatum. */
const vorlageBatterien = (katalogEintrag, vorhandene = []) =>
  katalogEintrag.batterien.map(({ id, ...b }, i) => emptyBatterie({ ...b, einbaudatum: vorhandene[i]?.einbaudatum ?? '' }));

/* ---------- Schrank ---------- */

/** Neuen Schrank anlegen oder bestehenden bearbeiten. Löst mit dem gespeicherten Schrank oder null auf. */
export async function editSchrank({ schrank = null, inventarnummer = '' } = {}) {
  const isNew = !schrank;
  const nr = textInput(schrank?.inventarnummer ?? inventarnummer, {
    required: true,
    disabled: !isNew,
    placeholder: 'Nummer vom Barcode',
    autocapitalize: 'characters',
  });
  const raum = textInput(schrank?.raum ?? '', { placeholder: 'z. B. +1/00123', inputMode: 'text' });
  const raumHint = h('small', { class: 'hint warn', hidden: true }, 'Erwartet wird Ebene/Raum, z. B. 00/00000, +1/00000 oder -1/00000. Du kannst trotzdem speichern.');
  const checkRaum = () => (raumHint.hidden = !raum.value.trim() || raumFormatOk(raum.value));
  raum.addEventListener('input', checkRaum);
  checkRaum();
  const bemerkung = h('textarea', { rows: 3, placeholder: 'z. B. Zugang über Treppenhaus B' }, schrank?.bemerkung ?? '');

  let saved = null;
  await openForm({
    title: isNew ? 'Schrank anlegen' : 'Schrank bearbeiten',
    body: [
      field('Inventarnummer', nr, isNew ? null : 'Die Inventarnummer ist der Schlüssel und kann nicht geändert werden.'),
      field('Raum (Ebene/Raum)', raum),
      raumHint,
      field('Bemerkung', bemerkung),
    ],
    onSubmit: async () => {
      if (isNew) {
        const key = normKey(nr.value);
        if (!key) throw new Error('Bitte eine Inventarnummer angeben.');
        if (S.getSchrank(key)) throw new Error(`Ein Schrank mit der Inventarnummer „${nr.value.trim()}“ existiert bereits.`);
        saved = await S.saveSchrank(createSchrank({ inventarnummer: nr.value, raum: raum.value, bemerkung: bemerkung.value }));
      } else {
        const current = S.getSchrank(schrank.key) ?? schrank;
        saved = await S.saveSchrank({ ...current, raum: raum.value.trim(), bemerkung: bemerkung.value.trim() });
      }
    },
  });
  return saved;
}

/* ---------- Netzteil ---------- */

/** Netzteil hinzufügen (netzteil = null) oder bearbeiten. Löst mit true/false auf. */
export async function editNetzteil(schrankKey, netzteil = null) {
  const isNew = !netzteil;
  const settings = S.getSettings();
  const katalog = S.listKatalog().sort((a, b) => `${a.hersteller} ${a.modell}`.localeCompare(`${b.hersteller} ${b.modell}`, 'de'));

  const hersteller = textInput(netzteil?.hersteller ?? '', { list: 'dl-np-hersteller', required: true, placeholder: 'z. B. APC' });
  const modell = textInput(netzteil?.modell ?? '', { list: 'dl-np-modell', required: true, placeholder: 'z. B. Smart-UPS SMT 1500' });
  const intervall = intervallInput(netzteil?.intervallJahre ?? settings.standardIntervallJahre);
  const batterien = batteryEditor({ initial: netzteil?.batterien ?? [], withDate: true });

  const inKatalog = () => S.getKatalogEintrag(katalogIdFor(hersteller.value, modell.value));
  const katalogBox = h('input', { type: 'checkbox', checked: true });
  const katalogRow = h('label', { class: 'check' }, katalogBox, h('span', null, 'Als Netzteiltyp im Katalog speichern (mit diesen Batterien als Vorlage)'));
  const updateKatalogRow = () => (katalogRow.hidden = Boolean(inKatalog()) || !hersteller.value.trim() || !modell.value.trim());
  hersteller.addEventListener('input', updateKatalogRow);
  modell.addEventListener('input', updateKatalogRow);

  const select = katalog.length
    ? h(
        'select',
        {
          onchange: () => {
            const e = S.getKatalogEintrag(select.value);
            if (!e) return;
            hersteller.value = e.hersteller;
            modell.value = e.modell;
            intervall.value = e.intervallJahre;
            batterien.setValue(vorlageBatterien(e, batterien.getValue()));
            updateKatalogRow();
          },
        },
        h('option', { value: '' }, '– Eigener Typ / manuell –'),
        katalog.map((k) => h('option', { value: k.id, selected: k.id === netzteil?.katalogId }, `${k.hersteller} ${k.modell}`)),
      )
    : null;
  updateKatalogRow();

  const ok = await openForm({
    title: isNew ? 'Netzteil hinzufügen' : 'Netzteil bearbeiten',
    body: [
      select ? field('Aus Katalog übernehmen', select) : null,
      field('Hersteller', hersteller),
      field('Modell', modell),
      field('Tauschintervall (Jahre)', intervall),
      h('h3', { class: 'section' }, 'Batterien'),
      batterien.el,
      katalogRow,
    ],
    onSubmit: async () => {
      const schrank = S.getSchrank(schrankKey);
      if (!schrank) throw new Error('Der Schrank existiert nicht mehr.');
      const bats = batterien.getValue();
      const katalogId = inKatalog()?.id ?? (select?.value || null);
      const rec = {
        ...(netzteil ?? createNetzteil()),
        hersteller: hersteller.value.trim(),
        modell: modell.value.trim(),
        katalogId,
        intervallJahre: Number(intervall.value),
        batterien: bats,
      };
      if (!(rec.intervallJahre > 0)) throw new Error('Bitte ein gültiges Tauschintervall angeben.');
      if (!katalogRow.hidden && katalogBox.checked) {
        const eintrag = createKatalogEintrag({
          hersteller: rec.hersteller,
          modell: rec.modell,
          intervallJahre: rec.intervallJahre,
          batterien: bats.map(({ id, einbaudatum, ...vorlage }) => vorlage),
        });
        await S.saveKatalog(eintrag);
        rec.katalogId = eintrag.id;
      }
      const netzteile = isNew ? [...schrank.netzteile, rec] : schrank.netzteile.map((n) => (n.id === rec.id ? rec : n));
      await S.saveSchrank({ ...schrank, netzteile });
    },
  });
  return ok;
}

/* ---------- Batterientausch ---------- */

export async function tauschDialog(schrankKey, netzteilId) {
  const schrank = S.getSchrank(schrankKey);
  const netzteil = schrank?.netzteile.find((n) => n.id === netzteilId);
  if (!netzteil) return false;

  const datum = h('input', { type: 'date', value: todayIso(), max: todayIso(), required: true });
  const katalogEintrag = netzteil.katalogId ? S.getKatalogEintrag(netzteil.katalogId) : null;
  const start = netzteil.batterien.length
    ? netzteil.batterien.map((b) => ({ ...b, einbaudatum: '' }))
    : katalogEintrag
      ? vorlageBatterien(katalogEintrag)
      : [];
  const batterien = batteryEditor({ initial: start, withDate: false });

  const ok = await openForm({
    title: `Batterien tauschen – ${netzteilName(netzteil)}`,
    submitLabel: 'Tausch speichern',
    body: [
      field('Tauschdatum', datum, 'Das Tauschdatum wird zum Einbaudatum der neuen Batterien.'),
      h('h3', { class: 'section' }, 'Neu eingebaute Batterien'),
      h('p', { class: 'hint' }, 'Vorbelegt mit den bisherigen Werten. Bei anderer Batterie einfach ändern.'),
      batterien.el,
      h(
        'p',
        { class: 'hint' },
        netzteil.batterien.length
          ? `Die bisherigen Batterien (eingebaut ${netzteil.batterien.map((b) => formatDate(b.einbaudatum) || 'unbekannt').join(', ')}) werden in die Historie übernommen.`
          : 'Bisher waren keine Batterien erfasst.',
      ),
    ],
    onSubmit: async () => {
      const neue = batterien.getValue();
      if (!neue.length) throw new Error('Bitte mindestens eine neue Batterie angeben.');
      const aktuell = S.getSchrank(schrankKey);
      const alt = aktuell?.netzteile.find((n) => n.id === netzteilId);
      if (!alt) throw new Error('Das Netzteil existiert nicht mehr.');
      const neu = tauschen(alt, datum.value, neue);
      await S.saveSchrank({ ...aktuell, netzteile: aktuell.netzteile.map((n) => (n.id === neu.id ? neu : n)) });
    },
  });
  if (ok) toast('Tausch gespeichert.');
  return ok;
}

/* ---------- Katalog ---------- */

export async function editKatalog(eintrag = null) {
  const isNew = !eintrag;
  const hersteller = textInput(eintrag?.hersteller ?? '', { list: 'dl-np-hersteller', required: true, placeholder: 'z. B. APC' });
  const modell = textInput(eintrag?.modell ?? '', { list: 'dl-np-modell', required: true, placeholder: 'z. B. Smart-UPS SMT 1500' });
  const intervall = intervallInput(eintrag?.intervallJahre ?? S.getSettings().standardIntervallJahre);
  const batterien = batteryEditor({ initial: eintrag?.batterien ?? [], withDate: false });

  return openForm({
    title: isNew ? 'Netzteiltyp anlegen' : 'Netzteiltyp bearbeiten',
    body: [
      field('Hersteller', hersteller),
      field('Modell', modell),
      field('Tauschintervall (Jahre)', intervall),
      h('h3', { class: 'section' }, 'Zugehörige Batterien (Vorlage)'),
      batterien.el,
      h('p', { class: 'hint' }, 'Änderungen am Katalog gelten für neu angelegte Netzteile. Bereits erfasste Netzteile bleiben unverändert.'),
    ],
    onSubmit: async () => {
      const bats = batterien.getValue().map(({ id, einbaudatum, ...vorlage }) => vorlage);
      if (isNew) {
        const neu = createKatalogEintrag({ hersteller: hersteller.value, modell: modell.value, intervallJahre: Number(intervall.value), batterien: bats });
        if (S.getKatalogEintrag(neu.id)) throw new Error('Diesen Netzteiltyp gibt es schon im Katalog.');
        await S.saveKatalog(neu);
      } else {
        await S.saveKatalog({
          ...eintrag,
          hersteller: hersteller.value.trim(),
          modell: modell.value.trim(),
          intervallJahre: Number(intervall.value),
          batterien: bats,
        });
      }
    },
  });
}

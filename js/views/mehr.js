// "Mehr": Daten teilen (Export/Import), Einstellungen, Hinweise.

import { add, h } from '../dom.js';
import { confirmBox, openForm, toast } from '../dialogs.js';
import { field } from '../forms.js';
import { planMerge, summarize } from '../merge.js';
import { formatDate, todayIso } from '../model.js';
import { parseExport } from '../schema.js';
import * as S from '../state.js';

/* ---------- Export ---------- */

function exportFile() {
  const name = `batteriemanagement-${todayIso()}.json`;
  const blob = new Blob([JSON.stringify(S.exportData(), null, 2)], { type: 'application/json' });
  return { name, blob };
}

async function downloadExport() {
  const { name, blob } = exportFile();
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  await S.markExported();
  toast(`Exportiert: ${name}`);
}

async function shareExport() {
  const { name, blob } = exportFile();
  try {
    await navigator.share({ files: [new File([blob], name, { type: 'application/json' })], title: 'Batteriemanagement – Datenstand' });
    await S.markExported();
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Teilen nicht möglich – bitte „Als Datei speichern“ nutzen.', { error: true });
  }
}

const canShareFiles = () => {
  try {
    return Boolean(navigator.canShare?.({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }));
  } catch {
    return false;
  }
};

/* ---------- Import ---------- */

const KIND_LABEL = {
  neu: 'Neu',
  aktualisiert: 'Datei ist neuer',
  geloescht: 'In Datei gelöscht',
  'lokal-neuer': 'Lokal ist neuer',
  abweichend: 'Gleicher Zeitstempel, anderer Inhalt',
};

export async function importFile(file) {
  let parsed;
  try {
    parsed = parseExport(await file.text());
  } catch (e) {
    toast(e.message, { error: true });
    return;
  }
  const plan = planMerge({ local: S.snapshotForMerge(), incoming: parsed });
  const sum = summarize(plan);

  if (!plan.schraenke.length && !sum.katalog) {
    toast(`Keine Änderungen: Dein Stand enthält bereits alles aus der Datei.${parsed.skipped ? ` (${parsed.skipped} ungültige Einträge übersprungen)` : ''}`);
    return;
  }

  const checks = new Map();
  const rows = plan.schraenke.map((e) => {
    const box = h('input', { type: 'checkbox', checked: e.apply, 'aria-label': `${e.label} übernehmen` });
    checks.set(e.id, box);
    return h(
      'li',
      { class: `imp imp-${e.kind}` },
      h('label', null, box, h('span', { class: 'imp-title' }, e.label), h('span', { class: 'chip' }, KIND_LABEL[e.kind])),
      e.diff.length ? h('ul', { class: 'imp-diff' }, e.diff.map((d) => h('li', null, d))) : null,
    );
  });

  const parts = [
    sum.neu && `${sum.neu} neu`,
    sum.aktualisiert && `${sum.aktualisiert} aktueller in der Datei`,
    sum.geloescht && `${sum.geloescht} gelöscht`,
    sum.lokalNeuer && `${sum.lokalNeuer} lokal neuer`,
    sum.abweichend && `${sum.abweichend} abweichend`,
  ].filter(Boolean);

  const ok = await openForm({
    title: 'Import prüfen',
    submitLabel: 'Auswahl übernehmen',
    body: [
      h('p', null, parts.length ? `Schränke: ${parts.join(', ')}.` : 'Keine Schrank-Änderungen.'),
      sum.katalog ? h('p', null, `Katalog: ${sum.katalog} Typ(en) werden neu angelegt oder aktualisiert.`) : null,
      parsed.skipped ? h('p', { class: 'hint warn' }, `${parsed.skipped} ungültige Einträge in der Datei wurden übersprungen.`) : null,
      h('p', { class: 'hint' }, 'Vorgeschlagen ist jeweils der neuere Stand. „Lokal ist neuer“ bleibt standardmäßig unverändert. Den Haken kannst du ändern. Nach dem Import kannst du ihn über „Mehr“ rückgängig machen.'),
      rows.length ? h('ul', { class: 'imp-list' }, rows) : null,
    ],
    onSubmit: async () => {
      const selected = [...checks].filter(([, box]) => box.checked).map(([id]) => id);
      const res = await S.applyImport(plan, selected);
      toast(`Import abgeschlossen: ${res.schraenke} Schrank-Datensätze, ${res.katalog} Katalog-Einträge übernommen.`);
    },
  });
  return ok;
}

/* ---------- Ansicht ---------- */

export function renderMehr(root) {
  const settings = S.getSettings();
  const last = S.lastExportAt();
  const changes = S.changesSinceExport();

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    class: 'visually-hidden',
    'aria-label': 'Exportdatei auswählen',
    onchange: async () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (f) await importFile(f);
    },
  });

  const vorlauf = h('input', {
    type: 'number',
    min: '0',
    max: '730',
    step: '1',
    inputMode: 'numeric',
    value: settings.vorlaufTage,
    onchange: () => {
      const v = Math.round(Number(vorlauf.value));
      if (Number.isFinite(v) && v >= 0) S.saveSettings({ vorlaufTage: v });
    },
  });
  const standardIntervall = h('input', {
    type: 'number',
    min: '0.5',
    max: '20',
    step: '0.5',
    inputMode: 'decimal',
    value: settings.standardIntervallJahre,
    onchange: () => {
      const v = Number(standardIntervall.value);
      if (v > 0) S.saveSettings({ standardIntervallJahre: v });
    },
  });

  add(root, 
    h(
      'section',
      { class: 'card block' },
      h('h2', null, 'Daten teilen & sichern'),
      h(
        'p',
        { class: 'muted' },
        'Alle Daten liegen nur auf diesem Gerät. Zum Abgleich mit anderen exportierst du eine Datei und importierst sie auf dem anderen Gerät. Beim Import werden die Stände zusammengeführt.',
      ),
      h(
        'p',
        { class: changes && (!last || (Date.now() - Date.parse(last)) / 86400000 > 30) ? 'warn-text' : 'muted' },
        last
          ? `Letzter Export: ${formatDate(todayIso(new Date(last)))} · ${changes === 1 ? '1 Datensatz' : `${changes} Datensätze`} seitdem geändert.`
          : `Noch nie exportiert. ${changes === 1 ? '1 Datensatz' : `${changes} Datensätze`} nur auf diesem Gerät.`,
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn primary', onclick: downloadExport }, 'Als Datei speichern'),
        canShareFiles() ? h('button', { type: 'button', class: 'btn', onclick: shareExport }, 'Teilen …') : null,
        h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'Datei importieren …'),
      ),
      fileInput,
      S.hasImportBackup()
        ? h(
            'p',
            null,
            h(
              'button',
              {
                type: 'button',
                class: 'btn small',
                onclick: async () => {
                  const ok = await confirmBox({
                    title: 'Letzten Import rückgängig machen?',
                    message: `Der Stand von vor dem Import (${formatDate(todayIso(new Date(S.importBackupInfo())))}) wird wiederhergestellt. Alles, was seither geändert wurde, geht verloren.`,
                    confirmLabel: 'Rückgängig machen',
                    danger: true,
                  });
                  if (ok && (await S.undoImport())) toast('Import rückgängig gemacht.');
                },
              },
              'Letzten Import rückgängig machen',
            ),
          )
        : null,
    ),
    h(
      'section',
      { class: 'card block' },
      h('h2', null, 'Einstellungen'),
      h('div', { class: 'grid2' }, field('„Bald fällig“ ab (Tage vor Termin)', vorlauf), field('Standard-Tauschintervall (Jahre)', standardIntervall)),
    ),
    h(
      'section',
      { class: 'card block' },
      h('h2', null, 'Auf dem Startbildschirm installieren'),
      h('p', { class: 'muted' }, 'Damit die App ohne Internet funktioniert und wie eine App startet:'),
      h(
        'ul',
        { class: 'plain' },
        h('li', null, h('strong', null, 'Android (Chrome): '), 'Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.'),
        h('li', null, h('strong', null, 'iPhone (Safari): '), 'Teilen-Symbol → „Zum Home-Bildschirm“. Wichtig: Nur so behält iOS die Daten dauerhaft.'),
        h('li', null, h('strong', null, 'PC (Chrome/Edge): '), 'Symbol in der Adressleiste → „Installieren“. Oder einfach im Browser nutzen.'),
      ),
      h('p', { class: 'muted' }, S.isPersisted() ? 'Speicher: dauerhaft gesichert (vom Browser zugesagt).' : 'Speicher: vom Browser (noch) nicht als dauerhaft zugesagt. Regelmäßig exportieren!'),
    ),
    h(
      'section',
      { class: 'card block' },
      h('h2', null, 'Über'),
      h('p', { class: 'muted' }, `Batteriemanagement · Version ${globalThis.APP_VERSION ?? '?'}`),
      h(
        'button',
        {
          type: 'button',
          class: 'btn small danger-text',
          onclick: async () => {
            const input = h('input', { type: 'text', autocomplete: 'off', placeholder: 'LÖSCHEN', 'aria-label': 'Zur Bestätigung LÖSCHEN eintippen' });
            await openForm({
              title: 'Alle Daten löschen?',
              submitLabel: 'Alles löschen',
              danger: true,
              body: [
                h('p', null, 'Löscht sämtliche Schränke, Netzteile, Batterien, den Katalog und die Einstellungen auf diesem Gerät. Das lässt sich nicht rückgängig machen. Exportiere vorher, falls du die Daten noch brauchst.'),
                field('Zur Bestätigung „LÖSCHEN“ eintippen', input),
              ],
              onSubmit: async () => {
                if (input.value.trim().toUpperCase() !== 'LÖSCHEN') throw new Error('Bitte „LÖSCHEN“ eintippen, um zu bestätigen.');
                await S.wipeAll();
                toast('Alle Daten gelöscht.');
              },
            });
          },
        },
        'Alle Daten auf diesem Gerät löschen',
      ),
    ),
  );
}

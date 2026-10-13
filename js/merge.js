// Zusammenführen von Datenständen verschiedener Geräte.
//
// Regel: Pro Schrank (Schlüssel = Inventarnummer) gewinnt der neuere Stand
// (updatedAt). Der Import schlägt das vor, der Nutzer kann es in der Vorschau
// ändern. Gelöschte Schränke bleiben als Löschvermerk erhalten, damit eine
// Löschung auch bei den anderen Geräten ankommt. Der Katalog wird automatisch
// nach demselben Prinzip zusammengeführt.

import { formatDate, netzteilName } from './model.js';

const IGNORE_TOP = new Set(['updatedAt', 'createdAt']);

function canonical(value, top = false) {
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => !(top && IGNORE_TOP.has(k)))
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sameContent = (a, b) => canonical(a, true) === canonical(b, true);

const time = (rec) => Date.parse(rec.updatedAt) || 0;

/** Kurze, lesbare Beschreibung, was sich zwischen lokalem Stand und Datei unterscheidet. */
export function describeDiff(local, incoming) {
  const lines = [];
  if (local.deleted !== incoming.deleted) {
    lines.push(incoming.deleted ? 'In der Datei gelöscht' : 'Lokal gelöscht, in der Datei vorhanden');
    return lines;
  }
  if (local.raum !== incoming.raum) lines.push(`Raum: ${local.raum || '–'} → ${incoming.raum || '–'}`);
  if (local.bemerkung !== incoming.bemerkung) lines.push('Bemerkung geändert');

  const lm = new Map(local.netzteile.map((n) => [n.id, n]));
  const im = new Map(incoming.netzteile.map((n) => [n.id, n]));
  for (const n of incoming.netzteile) {
    const old = lm.get(n.id);
    if (!old) {
      lines.push(`Netzteil „${netzteilName(n)}“ neu`);
      continue;
    }
    if (sameContent(old, n)) continue;
    const dates = (x) => x.batterien.map((b) => formatDate(b.einbaudatum) || '–').join(', ') || '–';
    const parts = [];
    if (dates(old) !== dates(n)) parts.push(`Einbaudatum ${dates(old)} → ${dates(n)}`);
    const oldTausch = new Set(old.historie.map((t) => t.id));
    const neu = n.historie.filter((t) => !oldTausch.has(t.id));
    if (neu.length) parts.push(`Tausch am ${neu.map((t) => formatDate(t.datum)).join(', ')}`);
    lines.push(`Netzteil „${netzteilName(n)}“: ${parts.join('; ') || 'geändert'}`);
  }
  for (const n of local.netzteile) {
    if (!im.has(n.id)) lines.push(`Netzteil „${netzteilName(n)}“ entfernt`);
  }
  return lines.length ? lines : ['Inhalt unterschiedlich'];
}

/**
 * Vergleicht lokalen Stand und Importdatei.
 * Jeder Eintrag: { id, label, kind, local, incoming, apply, diff }
 * kind: neu | aktualisiert | geloescht | lokal-neuer | abweichend | gleich
 */
export function planMerge({ local, incoming }) {
  const plan = { schraenke: [], katalog: [] };

  const compare = (kind, id, label, loc, inc, describe) => {
    if (!loc) {
      if (inc.deleted) return; // unbekannter, bereits gelöschter Eintrag: nichts zu tun
      plan[kind].push({ id, label, kind: 'neu', local: null, incoming: inc, apply: true, diff: [] });
      return;
    }
    if (sameContent(loc, inc)) return;
    const li = time(loc);
    const ii = time(inc);
    let k;
    if (ii > li) k = inc.deleted ? 'geloescht' : 'aktualisiert';
    else if (ii < li) k = 'lokal-neuer';
    else k = 'abweichend';
    plan[kind].push({
      id,
      label,
      kind: k,
      local: loc,
      incoming: inc,
      apply: k === 'aktualisiert' || k === 'geloescht',
      diff: describe(loc, inc),
    });
  };

  const localS = new Map(local.schraenke.map((s) => [s.key, s]));
  for (const inc of incoming.schraenke) {
    compare('schraenke', inc.key, inc.inventarnummer, localS.get(inc.key), inc, describeDiff);
  }
  const localK = new Map(local.katalog.map((k) => [k.id, k]));
  for (const inc of incoming.katalog) {
    compare('katalog', inc.id, [inc.hersteller, inc.modell].filter(Boolean).join(' '), localK.get(inc.id), inc, () => []);
  }

  const byLabel = (a, b) => a.label.localeCompare(b.label, 'de', { numeric: true });
  plan.schraenke.sort(byLabel);
  plan.katalog.sort(byLabel);
  return plan;
}

/** Wählt aus dem Plan die zu speichernden Datensätze. */
export function applyPlan(plan, selectedSchrankIds) {
  const chosen = new Set(selectedSchrankIds);
  return {
    schraenke: plan.schraenke.filter((e) => chosen.has(e.id)).map((e) => e.incoming),
    // Katalog wird automatisch zusammengeführt: es gilt der Vorschlag des Plans.
    katalog: plan.katalog.filter((e) => e.apply).map((e) => e.incoming),
  };
}

export function summarize(plan) {
  const count = (list, kind) => list.filter((e) => e.kind === kind).length;
  return {
    neu: count(plan.schraenke, 'neu'),
    aktualisiert: count(plan.schraenke, 'aktualisiert'),
    geloescht: count(plan.schraenke, 'geloescht'),
    lokalNeuer: count(plan.schraenke, 'lokal-neuer'),
    abweichend: count(plan.schraenke, 'abweichend'),
    katalog: plan.katalog.filter((e) => e.apply).length,
  };
}

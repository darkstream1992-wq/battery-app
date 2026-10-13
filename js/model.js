// Reine Datenlogik ohne DOM- und Speicherzugriff, damit sie sich in Node testen lässt.

export const FORMAT = 'batteriemanagement';
export const FORMAT_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  vorlaufTage: 90,
  standardIntervallJahre: 4,
});

/* ---------- Schlüssel, IDs, Datum ---------- */

/** Schlüssel eines Schranks: getrimmt, Leerraum vereinheitlicht, Großbuchstaben. */
export function normKey(inventarnummer) {
  return String(inventarnummer ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const nowIso = () => new Date().toISOString();

const pad = (n, len = 2) => String(n).padStart(len, '0');

/** Heutiges Datum in lokaler Zeit als YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Addiert Monate; ein nicht vorhandener Tag rutscht auf den Monatsletzten (29.02. + 1 Jahr = 28.02.). */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${pad(ny, 4)}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

export const addYears = (iso, years) => addMonths(iso, Math.round(years * 12));

/** Tage von a nach b (b - a), beide als YYYY-MM-DD. */
export function daysBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

export function formatDate(iso) {
  if (!isIsoDate(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/* ---------- Fälligkeit ---------- */

export const STATUS_ORDER = { ueberfaellig: 0, bald: 1, unbekannt: 2, ok: 3 };

function intervallOf(netzteil) {
  const n = Number(netzteil.intervallJahre);
  return n > 0 ? n : DEFAULT_SETTINGS.standardIntervallJahre;
}

/**
 * Nächster Tauschtermin eines Netzteils: frühester Einbau + Intervall.
 * Ohne Batterie mit gültigem Einbaudatum ist der Status "unbekannt".
 */
export function faelligkeitNetzteil(netzteil, today = todayIso(), vorlaufTage = DEFAULT_SETTINGS.vorlaufTage) {
  const intervall = intervallOf(netzteil);
  const termine = (netzteil.batterien ?? [])
    .map((b) => b.einbaudatum)
    .filter(isIsoDate)
    .map((d) => addYears(d, intervall))
    .sort();
  if (!termine.length) return { status: 'unbekannt', datum: null, tage: null };
  const datum = termine[0];
  const tage = daysBetween(today, datum);
  const status = tage < 0 ? 'ueberfaellig' : tage <= vorlaufTage ? 'bald' : 'ok';
  return { status, datum, tage };
}

/** Sortierung: dringendster Status zuerst, dann frühestes Datum, ohne Datum zuletzt. */
export function compareFaellig(a, b) {
  const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (s) return s;
  if (a.datum === b.datum) return 0;
  if (!a.datum) return 1;
  if (!b.datum) return -1;
  return a.datum < b.datum ? -1 : 1;
}

/** Schlechtester Status aller Netzteile eines Schranks. */
export function faelligkeitSchrank(schrank, today = todayIso(), vorlaufTage = DEFAULT_SETTINGS.vorlaufTage) {
  const list = (schrank.netzteile ?? []).map((n) => faelligkeitNetzteil(n, today, vorlaufTage));
  if (!list.length) return { status: 'unbekannt', datum: null, tage: null };
  return list.reduce((worst, f) => (compareFaellig(f, worst) < 0 ? f : worst));
}

/* ---------- Fabriken ---------- */

export function emptyBatterie(over = {}) {
  return { id: newId(), hersteller: '', typ: '', kapazitaetAh: null, anzahl: 2, einbaudatum: '', ...over };
}

export function createNetzteil(over = {}) {
  return {
    id: newId(),
    hersteller: '',
    modell: '',
    katalogId: null,
    intervallJahre: DEFAULT_SETTINGS.standardIntervallJahre,
    batterien: [],
    historie: [],
    ...over,
  };
}

export function createSchrank({ inventarnummer, raum = '', bemerkung = '' }, now = nowIso()) {
  const nr = String(inventarnummer).trim().replace(/\s+/g, ' ');
  return {
    key: normKey(nr),
    inventarnummer: nr,
    raum: raum.trim(),
    bemerkung: bemerkung.trim(),
    netzteile: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
}

const slug = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Katalog-ID aus Hersteller und Modell, damit zwei Geräte denselben Typ nicht doppelt anlegen. */
export const katalogIdFor = (hersteller, modell) => `${slug(hersteller)}__${slug(modell)}`;

export function createKatalogEintrag({ hersteller, modell, intervallJahre = DEFAULT_SETTINGS.standardIntervallJahre, batterien = [] }, now = nowIso()) {
  return {
    id: katalogIdFor(hersteller, modell),
    hersteller: hersteller.trim(),
    modell: modell.trim(),
    intervallJahre,
    batterien,
    updatedAt: now,
    deleted: false,
  };
}

/* ---------- Tausch ---------- */

/**
 * Batterientausch: Die alten Batterien wandern in die Historie, die neuen
 * bekommen das Tauschdatum als Einbaudatum. Gibt ein neues Netzteil zurück.
 */
export function tauschen(netzteil, datum, neueBatterien) {
  if (!isIsoDate(datum)) throw new Error('Ungültiges Tauschdatum.');
  const ausgebaut = (netzteil.batterien ?? []).map((b) => ({ ...b }));
  return {
    ...netzteil,
    historie: [...(netzteil.historie ?? []), { id: newId(), datum, ausgebaut }],
    batterien: neueBatterien.map((b) => ({ ...b, id: newId(), einbaudatum: datum })),
  };
}

/* ---------- Anzeige ---------- */

export function formatAh(n) {
  if (n == null) return '';
  return `${Number(n).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Ah`;
}

/** "2× Yuasa NP7-12 · 7 Ah" */
export function batterieText(b) {
  const name = [b.hersteller, b.typ].filter(Boolean).join(' ') || 'Batterie';
  return [`${b.anzahl ?? 1}× ${name}`, formatAh(b.kapazitaetAh)].filter(Boolean).join(' · ');
}

export const netzteilName = (n) => [n.hersteller, n.modell].filter(Boolean).join(' ') || 'Netzteil';

/** Soft-Check für das Raumformat Ebene/Raum: 00/00000, +1/00000 oder -1/00000. */
export const raumFormatOk = (raum) => /^[+-]?\d{1,2}\/\d{5}$/.test(String(raum ?? '').trim());

function pluralTage(n) {
  return n === 1 ? '1 Tag' : `${n} Tagen`; // Dativ: "seit/in … Tagen"
}

/** Kurztext zum Status, z. B. "Überfällig seit 12 Tagen". */
export function statusText(f) {
  switch (f.status) {
    case 'ueberfaellig':
      return `Überfällig seit ${pluralTage(-f.tage)}`;
    case 'bald':
      return f.tage === 0 ? 'Heute fällig' : `Fällig in ${pluralTage(f.tage)}`;
    case 'ok':
      return `Fällig am ${formatDate(f.datum)}`;
    default:
      return 'Einbaudatum fehlt';
  }
}

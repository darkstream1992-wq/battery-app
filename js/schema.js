// Prüfen und Bereinigen von Daten aus Exportdateien. Die Datei kommt von einem
// anderen Gerät und wird deshalb nie ungeprüft übernommen.

import {
  DEFAULT_SETTINGS,
  FORMAT,
  FORMAT_VERSION,
  isIsoDate,
  katalogIdFor,
  newId,
  normKey,
} from './model.js';

const EPOCH = '1970-01-01T00:00:00.000Z';

const str = (v) => (v == null ? '' : String(v).trim());

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const stamp = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : EPOCH);

export function normalizeBatterie(b = {}) {
  const anzahl = Math.round(Number(b.anzahl));
  return {
    id: str(b.id) || newId(),
    hersteller: str(b.hersteller),
    typ: str(b.typ),
    kapazitaetAh: num(b.kapazitaetAh),
    anzahl: Number.isFinite(anzahl) && anzahl >= 1 ? anzahl : 1,
    einbaudatum: isIsoDate(b.einbaudatum) ? b.einbaudatum : '',
  };
}

function intervall(v) {
  const n = num(v);
  return n && n > 0 ? n : DEFAULT_SETTINGS.standardIntervallJahre;
}

export function normalizeNetzteil(n = {}) {
  return {
    id: str(n.id) || newId(),
    hersteller: str(n.hersteller),
    modell: str(n.modell),
    katalogId: str(n.katalogId) || null,
    intervallJahre: intervall(n.intervallJahre),
    batterien: (Array.isArray(n.batterien) ? n.batterien : []).map(normalizeBatterie),
    historie: (Array.isArray(n.historie) ? n.historie : [])
      .filter((t) => t && isIsoDate(t.datum))
      .map((t) => ({
        id: str(t.id) || newId(),
        datum: t.datum,
        ausgebaut: (Array.isArray(t.ausgebaut) ? t.ausgebaut : []).map(normalizeBatterie),
      })),
  };
}

export function normalizeSchrank(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Ungültiger Schrank-Eintrag.');
  const inventarnummer = str(raw.inventarnummer ?? raw.key).replace(/\s+/g, ' ');
  const key = normKey(inventarnummer);
  if (!key) throw new Error('Schrank ohne Inventarnummer.');
  const deleted = raw.deleted === true;
  return {
    key,
    inventarnummer,
    raum: deleted ? '' : str(raw.raum),
    bemerkung: deleted ? '' : str(raw.bemerkung),
    netzteile: deleted ? [] : (Array.isArray(raw.netzteile) ? raw.netzteile : []).map(normalizeNetzteil),
    createdAt: stamp(raw.createdAt),
    updatedAt: stamp(raw.updatedAt),
    deleted,
  };
}

export function normalizeKatalog(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Ungültiger Katalog-Eintrag.');
  const hersteller = str(raw.hersteller);
  const modell = str(raw.modell);
  if (!hersteller && !modell) throw new Error('Katalog-Eintrag ohne Hersteller und Modell.');
  const deleted = raw.deleted === true;
  return {
    id: str(raw.id) || katalogIdFor(hersteller, modell),
    hersteller,
    modell,
    intervallJahre: intervall(raw.intervallJahre),
    batterien: deleted ? [] : (Array.isArray(raw.batterien) ? raw.batterien : []).map(normalizeBatterie),
    updatedAt: stamp(raw.updatedAt),
    deleted,
  };
}

/** Exportdatei (Text oder Objekt) prüfen. Wirft Error mit deutscher Meldung. */
export function parseExport(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new Error('Die Datei ist keine gültige Exportdatei (kein lesbares JSON).');
    }
  }
  if (!data || typeof data !== 'object' || data.format !== FORMAT) {
    throw new Error('Die Datei stammt nicht aus dem Batteriemanagement.');
  }
  if (!Number.isInteger(data.version) || data.version > FORMAT_VERSION) {
    throw new Error('Die Datei wurde mit einer neueren App-Version erstellt. Bitte die App aktualisieren.');
  }
  let skipped = 0;
  const collect = (list, fn) =>
    (Array.isArray(list) ? list : []).flatMap((item) => {
      try {
        return [fn(item)];
      } catch {
        skipped += 1;
        return [];
      }
    });
  return {
    schraenke: collect(data.schraenke, normalizeSchrank),
    katalog: collect(data.katalog, normalizeKatalog),
    skipped,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
  };
}

export function buildExport({ schraenke, katalog, appVersion }, now = new Date().toISOString()) {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: now,
    appVersion: appVersion ?? null,
    schraenke,
    katalog,
  };
}

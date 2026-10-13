// Zentraler Zustand: alle Daten liegen im Speicher und werden bei jeder
// Änderung in IndexedDB geschrieben. Die Oberfläche hört über onChange zu.

import { DEFAULT_SETTINGS, faelligkeitNetzteil, nowIso, todayIso } from './model.js';
import { applyPlan } from './merge.js';
import { buildExport } from './schema.js';
import * as store from './store.js';

const schraenke = new Map(); // key -> Schrank (inkl. Löschvermerke)
const katalog = new Map(); // id -> Katalogeintrag (inkl. Löschvermerke)
let settings = { ...DEFAULT_SETTINGS };
let meta = {};
let persisted = false;

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

export async function init() {
  const data = await store.loadAll();
  data.schraenke.forEach((s) => schraenke.set(s.key, s));
  data.katalog.forEach((k) => katalog.set(k.id, k));
  meta = data.meta;
  settings = { ...DEFAULT_SETTINGS, ...(meta.settings ?? {}) };
}

/* ---------- Lesen ---------- */

export const getSettings = () => settings;
export const getSchrank = (key) => {
  const s = schraenke.get(key);
  return s && !s.deleted ? s : null;
};
export const hasTombstone = (key) => schraenke.get(key)?.deleted === true;
export const listSchraenke = () => [...schraenke.values()].filter((s) => !s.deleted);
export const listKatalog = () => [...katalog.values()].filter((k) => !k.deleted);
export const getKatalogEintrag = (id) => {
  const k = katalog.get(id);
  return k && !k.deleted ? k : null;
};
export const lastExportAt = () => meta.lastExportAt ?? null;
export const hasImportBackup = () => Boolean(meta.importBackup);
export const importBackupInfo = () => meta.importBackup?.createdAt ?? null;
export const isPersisted = () => persisted;

/** Alle Netzteile mit Fälligkeit, dringendste zuerst. */
export function faelligkeiten(today = todayIso()) {
  const items = [];
  for (const schrank of listSchraenke()) {
    if (!schrank.netzteile.length) {
      items.push({ schrank, netzteil: null, f: { status: 'unbekannt', datum: null, tage: null } });
    }
    for (const netzteil of schrank.netzteile) {
      items.push({ schrank, netzteil, f: faelligkeitNetzteil(netzteil, today, settings.vorlaufTage) });
    }
  }
  return items;
}

/** Anzahl Datensätze, die seit dem letzten Export geändert wurden. */
export function changesSinceExport() {
  const since = lastExportAt();
  const changed = (r) => !since || r.updatedAt > since;
  return [...schraenke.values()].filter(changed).length + [...katalog.values()].filter(changed).length;
}

export function exportData() {
  return buildExport({
    schraenke: [...schraenke.values()],
    katalog: [...katalog.values()],
    appVersion: globalThis.APP_VERSION,
  });
}

export const snapshotForMerge = () => ({
  schraenke: [...schraenke.values()],
  katalog: [...katalog.values()],
});

/* ---------- Schreiben ---------- */

async function afterWrite() {
  if (!persisted) persisted = await store.requestPersistence();
  emit();
}

export async function saveSchrank(schrank) {
  const rec = { ...schrank, deleted: false, updatedAt: nowIso() };
  await store.putMany('schraenke', [rec]);
  schraenke.set(rec.key, rec);
  await afterWrite();
  return rec;
}

/** Löschen bleibt als Vermerk erhalten, damit es beim Abgleich ankommt. */
export async function removeSchrank(key) {
  const old = schraenke.get(key);
  if (!old) return;
  const rec = { ...old, raum: '', bemerkung: '', netzteile: [], deleted: true, updatedAt: nowIso() };
  await store.putMany('schraenke', [rec]);
  schraenke.set(key, rec);
  await afterWrite();
}

export async function saveKatalog(eintrag) {
  const rec = { ...eintrag, deleted: false, updatedAt: nowIso() };
  await store.putMany('katalog', [rec]);
  katalog.set(rec.id, rec);
  await afterWrite();
  return rec;
}

export async function removeKatalog(id) {
  const old = katalog.get(id);
  if (!old) return;
  const rec = { ...old, batterien: [], deleted: true, updatedAt: nowIso() };
  await store.putMany('katalog', [rec]);
  katalog.set(id, rec);
  await afterWrite();
}

export async function saveSettings(partial) {
  settings = { ...settings, ...partial };
  meta.settings = settings;
  await store.putMeta('settings', settings);
  emit();
}

export async function markExported() {
  meta.lastExportAt = nowIso();
  await store.putMeta('lastExportAt', meta.lastExportAt);
  emit();
}

/** Importplan anwenden. Vorher wird der Stand für "Rückgängig" gesichert. */
export async function applyImport(plan, selectedIds) {
  const backup = { createdAt: nowIso(), ...snapshotForMerge() };
  const { schraenke: s, katalog: k } = applyPlan(plan, selectedIds);
  await store.putMeta('importBackup', backup);
  meta.importBackup = backup;
  await store.putMany('schraenke', s);
  await store.putMany('katalog', k);
  s.forEach((r) => schraenke.set(r.key, r));
  k.forEach((r) => katalog.set(r.id, r));
  await afterWrite();
  return { schraenke: s.length, katalog: k.length };
}

export async function undoImport() {
  const backup = meta.importBackup;
  if (!backup) return false;
  await store.replaceAll(backup);
  schraenke.clear();
  katalog.clear();
  backup.schraenke.forEach((r) => schraenke.set(r.key, r));
  backup.katalog.forEach((r) => katalog.set(r.id, r));
  delete meta.importBackup;
  await store.putMeta('importBackup', null);
  emit();
  return true;
}

export async function wipeAll() {
  await store.clearAll();
  schraenke.clear();
  katalog.clear();
  meta = {};
  settings = { ...DEFAULT_SETTINGS };
  emit();
}

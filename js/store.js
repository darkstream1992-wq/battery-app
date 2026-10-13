// Persistenz in IndexedDB. Alle Daten bleiben auf dem Gerät.

const DB_NAME = 'batteriemanagement';
const DB_VERSION = 1;

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Dieser Browser kann keine Daten speichern (IndexedDB fehlt).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('schraenke', { keyPath: 'key' });
      db.createObjectStore('katalog', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Speicher konnte nicht geöffnet werden.'));
  });
  return dbPromise;
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Speichern abgebrochen.'));
  });

const result = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function loadAll() {
  const db = await open();
  const tx = db.transaction(['schraenke', 'katalog', 'meta'], 'readonly');
  const [schraenke, katalog, meta] = await Promise.all([
    result(tx.objectStore('schraenke').getAll()),
    result(tx.objectStore('katalog').getAll()),
    result(tx.objectStore('meta').getAll()),
  ]);
  return { schraenke, katalog, meta: Object.fromEntries(meta.map((m) => [m.k, m.v])) };
}

export async function putMany(storeName, records) {
  if (!records.length) return;
  const db = await open();
  const tx = db.transaction(storeName, 'readwrite');
  for (const r of records) tx.objectStore(storeName).put(r);
  await done(tx);
}

export async function putMeta(k, v) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ k, v });
  await done(tx);
}

/** Ersetzt Schränke und Katalog komplett (für "Import rückgängig"). */
export async function replaceAll({ schraenke, katalog }) {
  const db = await open();
  const tx = db.transaction(['schraenke', 'katalog'], 'readwrite');
  tx.objectStore('schraenke').clear();
  tx.objectStore('katalog').clear();
  for (const s of schraenke) tx.objectStore('schraenke').put(s);
  for (const k of katalog) tx.objectStore('katalog').put(k);
  await done(tx);
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(['schraenke', 'katalog', 'meta'], 'readwrite');
  for (const name of ['schraenke', 'katalog', 'meta']) tx.objectStore(name).clear();
  await done(tx);
}

/** Bittet den Browser, die Daten nicht von selbst zu löschen. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

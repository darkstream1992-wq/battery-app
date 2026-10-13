// Einzige Quelle für die App-Version. Wird von index.html (klassisches Script)
// und vom Service Worker (importScripts) geladen. Bei jeder Änderung an der App
// hochzählen, sonst holen sich bereits installierte Geräte die neuen Dateien nicht.
self.APP_VERSION = '1.0.3';

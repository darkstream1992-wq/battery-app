// Service Worker: legt die komplette App beim ersten Laden im Cache ab, danach
// startet sie auch ohne Internet. Eine neue Version wird erst aktiv, wenn der
// Nutzer im Hinweisbalken "Jetzt aktualisieren" tippt.

importScripts('./js/version.js');

const CACHE = `bm-${self.APP_VERSION}`;

// Muss alle Dateien der App enthalten (wird in tests/unit/app-files.test.js geprüft).
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/dialogs.js',
  './js/dom.js',
  './js/editors.js',
  './js/flows.js',
  './js/forms.js',
  './js/merge.js',
  './js/model.js',
  './js/scanner.js',
  './js/schema.js',
  './js/state.js',
  './js/store.js',
  './js/ui.js',
  './js/version.js',
  './js/views/faellig.js',
  './js/views/katalog.js',
  './js/views/mehr.js',
  './js/views/schraenke.js',
  './js/views/schrank.js',
  './vendor/zxing-wasm/reader/index.js',
  './vendor/zxing-wasm/share.js',
  './vendor/zxing-wasm/zxing_reader.wasm',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' umgeht den HTTP-Cache, damit keine veralteten Dateien in die neue Version geraten
      Promise.all(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bm-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
    ),
  );
});

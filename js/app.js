// Einstieg: Rahmen, Routing, Service Worker.

import { clear, h } from './dom.js';
import { scanAndOpen } from './flows.js';
import * as S from './state.js';
import { icon } from './ui.js';
import { renderFaellig } from './views/faellig.js';
import { renderKatalog } from './views/katalog.js';
import { renderMehr } from './views/mehr.js';
import { renderSchraenke } from './views/schraenke.js';
import { renderSchrank } from './views/schrank.js';

const NAV = [
  ['#/', 'Fällig', 'clock'],
  ['#/schraenke', 'Schränke', 'cabinet'],
  ['#/katalog', 'Katalog', 'book'],
  ['#/mehr', 'Mehr', 'more'],
];

const view = h('main', { id: 'view', tabindex: '-1' });
const nav = h(
  'nav',
  { class: 'nav', 'aria-label': 'Hauptmenü' },
  NAV.map(([href, label, ic]) => h('a', { href, dataset: { href } }, icon(ic), h('span', null, label))),
);
const banner = h('div', { id: 'update-banner', class: 'update-banner', hidden: true });
const datalists = ['dl-np-hersteller', 'dl-np-modell', 'dl-bat-hersteller', 'dl-bat-typ'].map((id) => h('datalist', { id }));

function buildShell() {
  const root = document.getElementById('app');
  root.append(
    banner,
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '▮'), 'Batteriemanagement'),
      nav,
      h('button', { type: 'button', class: 'btn primary scan-top', onclick: scanAndOpen }, icon('scan'), 'Scannen'),
    ),
    view,
    h('button', { type: 'button', class: 'scan-fab', onclick: scanAndOpen, 'aria-label': 'Strichcode scannen' }, icon('scan')),
    ...datalists,
  );
}

/** Vorschlagslisten aus Katalog und erfassten Geräten füllen. */
function updateDatalists() {
  const uniq = (values) => [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const netzteile = [...S.listKatalog(), ...S.listSchraenke().flatMap((s) => s.netzteile)];
  const batterien = [...S.listKatalog().flatMap((k) => k.batterien), ...S.listSchraenke().flatMap((s) => s.netzteile.flatMap((n) => n.batterien))];
  const fill = (id, values) => document.getElementById(id).replaceChildren(...uniq(values).map((v) => h('option', { value: v })));
  fill('dl-np-hersteller', netzteile.map((n) => n.hersteller));
  fill('dl-np-modell', netzteile.map((n) => n.modell));
  fill('dl-bat-hersteller', batterien.map((b) => b.hersteller));
  fill('dl-bat-typ', batterien.map((b) => b.typ));
}

/* ---------- Routing ---------- */

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  return { parts, params: new URLSearchParams(query), path };
}

let lastPath = null;

function renderRoute() {
  const { parts, params, path } = parseHash();
  const scrollY = window.scrollY;
  clear(view);

  const [first, arg] = parts;
  let active = '#/';
  if (!first) renderFaellig(view);
  else if (first === 'schraenke') (active = '#/schraenke'), renderSchraenke(view, { focusSearch: params.has('suche') && path !== lastPath });
  else if (first === 'schrank' && arg) (active = '#/schraenke'), renderSchrank(view, arg);
  else if (first === 'katalog') (active = '#/katalog'), renderKatalog(view);
  else if (first === 'mehr') (active = '#/mehr'), renderMehr(view);
  else renderFaellig(view);

  nav.querySelectorAll('a').forEach((a) => {
    const on = a.dataset.href === active;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (path === lastPath) window.scrollTo(0, scrollY);
  else window.scrollTo(0, 0);
  lastPath = path;
}

/* ---------- Service Worker ---------- */

function showUpdate(worker) {
  banner.hidden = false;
  banner.replaceChildren(
    h('span', null, 'Eine neue App-Version ist bereit.'),
    h(
      'button',
      {
        type: 'button',
        class: 'btn small primary',
        onclick: () => {
          worker.postMessage('SKIP_WAITING');
        },
      },
      'Jetzt aktualisieren',
    ),
  );
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Bei der Erstinstallation übernimmt der Service Worker die Seite, ohne dass neu geladen werden muss.
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });
    })
    .catch(() => {
      /* ohne Service Worker (z. B. http) läuft die App weiter, nur nicht offline */
    });
}

/* ---------- Start ---------- */

async function main() {
  try {
    await S.init();
  } catch (e) {
    document.getElementById('app').append(
      h('div', { class: 'empty fatal' }, h('h2', null, 'Speicher nicht verfügbar'), h('p', null, e.message), h('p', { class: 'muted' }, 'Bitte nicht im privaten Modus öffnen und Website-Daten im Browser zulassen.')),
    );
    return;
  }
  buildShell();
  updateDatalists();
  S.onChange(() => {
    updateDatalists();
    renderRoute();
  });
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
  registerServiceWorker();
}

main();

// Minimaler DOM-Builder. Texte werden immer als Textknoten eingefügt, nie als
// HTML, damit Inhalte aus importierten Dateien keinen Schaden anrichten können.

const ATTR_ONLY = new Set(['list', 'form', 'role']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && !ATTR_ONLY.has(k) && !k.includes('-')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Wie el.append(), aber null/false werden übersprungen (natives append schreibt sonst den Text "null"). */
export const add = (el, ...children) => append(el, children);

export function clear(el) {
  el.replaceChildren();
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

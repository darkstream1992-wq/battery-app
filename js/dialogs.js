// Modale Dialoge (<dialog>), Rückfragen und Hinweis-Toasts.

import { h } from './dom.js';

let toastTimer;
export function toast(message, { error = false } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = error ? 'toast show error' : 'toast show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), error ? 6000 : 3500);
}

/**
 * Formular-Dialog. `onSubmit` darf einen Error werfen (wird im Dialog angezeigt)
 * oder `false` liefern, um offen zu bleiben. Löst mit true/false auf.
 */
export function openForm({ title, body, submitLabel = 'Speichern', danger = false, extraActions = [], onSubmit }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'sheet' });
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const submit = h('button', { type: 'submit', class: danger ? 'btn danger' : 'btn primary' }, submitLabel);
    const cancel = h('button', { type: 'button', class: 'btn', onclick: () => dlg.close('cancel') }, 'Abbrechen');
    const form = h(
      'form',
      { class: 'sheet-form', method: 'dialog' },
      h('header', { class: 'sheet-head' }, h('h2', null, title)),
      h('div', { class: 'sheet-body' }, body, err),
      h('footer', { class: 'sheet-foot' }, extraActions, cancel, submit),
    );
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.hidden = true;
      submit.disabled = true;
      try {
        if ((await onSubmit()) === false) return;
        dlg.close('ok');
      } catch (e) {
        err.textContent = e?.message ?? String(e);
        err.hidden = false;
        err.scrollIntoView({ block: 'nearest' });
      } finally {
        submit.disabled = false;
      }
    });
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'ok';
      dlg.remove();
      resolve(ok);
    });
    dlg.append(form);
    document.body.append(dlg);
    dlg.showModal();
    // Fokus auf das erste Eingabefeld, aber nicht auf Touch-Geräten (Tastatur würde aufspringen)
    if (!matchMedia('(pointer: coarse)').matches) form.querySelector('input,select,textarea')?.focus();
  });
}

export function confirmBox({ title, message, confirmLabel = 'OK', danger = false }) {
  return openForm({
    title,
    submitLabel: confirmLabel,
    danger,
    body: h('p', null, message),
    onSubmit: () => true,
  });
}

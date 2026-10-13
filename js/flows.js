// Abläufe, die mehrere Bausteine verbinden: Scannen → Schrank öffnen oder anlegen.

import { confirmBox } from './dialogs.js';
import { editNetzteil, editSchrank } from './editors.js';
import { normKey } from './model.js';
import { openScanner } from './scanner.js';
import * as S from './state.js';

export const schrankHref = (key) => `#/schrank/${encodeURIComponent(key)}`;

export async function scanAndOpen() {
  const code = await openScanner();
  if (code) await openOrCreate(code);
}

/** Öffnet den Schrank zur Inventarnummer; ist er unbekannt, wird nachgefragt, ob er angelegt werden soll. */
export async function openOrCreate(code) {
  const key = normKey(code);
  if (!key) return;
  if (S.getSchrank(key)) {
    location.hash = schrankHref(key);
    return;
  }
  const anlegen = await confirmBox({
    title: 'Schrank nicht gefunden',
    message: `Zur Inventarnummer „${String(code).trim()}“ ist noch kein Schrank angelegt. Jetzt neu anlegen?`,
    confirmLabel: 'Neu anlegen',
  });
  if (!anlegen) return;
  const schrank = await editSchrank({ inventarnummer: String(code).trim() });
  if (!schrank) return;
  location.hash = schrankHref(schrank.key);
  await editNetzteil(schrank.key);
}

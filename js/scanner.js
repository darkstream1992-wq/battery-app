// Strichcode-Scanner.
//
// Wege zum Code (der Nutzer kann jederzeit wechseln):
//   1. Live-Kamera. Nativ per BarcodeDetector (Android/Chrome), sonst per
//      zxing-wasm (iPhone/Safari, Desktop). Die Bibliothek liegt lokal in vendor/,
//      damit es auch ohne Netz geht.
//   2. Foto aufnehmen oder aus der Galerie wählen (hilft bei schwierigen Codes).
//   3. Inventarnummer eintippen (oder USB-Scanner, der wie eine Tastatur arbeitet).
//
// Sind mehrere Codes im Bild (z. B. eine Etikettenrolle), gilt der Code, der der
// Bildmitte am nächsten liegt.

import { h } from './dom.js';

const NATIVE_FORMATS = ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'qr_code', 'data_matrix'];
const WASM_FORMATS = ['Code128', 'Code39', 'Code93', 'Codabar', 'ITF', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'QRCode', 'DataMatrix'];
const SCAN_INTERVAL_MS = 120;
const LIVE_MAX_WIDTH = 1600;
const PHOTO_MAX_SIDE = 2400;
// Kleine oder unscharfe Codes werden im vergrößerten Bildausschnitt (Bildmitte) oft noch gelesen.
const CROP_SCALES = [1.5, 2, 3];
const CROP_FRACTION = 0.6;

/* ---------- Erkennung ---------- */

/** Wählt aus mehreren Treffern {text, x, y} den, der der Bildmitte am nächsten liegt. */
export function pickNearestCenter(hits, width, height) {
  let best = null;
  let bestDist = Infinity;
  for (const hit of hits) {
    if (!hit.text) continue;
    const d = Math.hypot(hit.x - width / 2, hit.y - height / 2);
    if (d < bestDist) {
      best = hit.text;
      bestDist = d;
    }
  }
  return best;
}

async function nativeDetector() {
  if (!('BarcodeDetector' in globalThis)) return null;
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    const detector = new BarcodeDetector({ formats });
    return {
      async detect(source, width, height) {
        const found = await detector.detect(source);
        const hits = found.map((f) => ({ text: f.rawValue, x: f.boundingBox.x + f.boundingBox.width / 2, y: f.boundingBox.y + f.boundingBox.height / 2 }));
        return pickNearestCenter(hits, width, height);
      },
    };
  } catch {
    return null;
  }
}

let wasmPromise;
function loadWasmReader() {
  wasmPromise ??= import('../vendor/zxing-wasm/reader/index.js')
    .then(async (mod) => {
      const wasmUrl = new URL('../vendor/zxing-wasm/zxing_reader.wasm', import.meta.url).href;
      // Ohne diese Angabe würde die Bibliothek die .wasm-Datei aus dem Netz (CDN) laden.
      await mod.prepareZXingModule({
        overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
        fireImmediately: true,
      });
      return mod;
    })
    .catch(() => {
      wasmPromise = undefined;
      throw new Error('Scanner-Bibliothek konnte nicht geladen werden.');
    });
  return wasmPromise;
}

/** Bildmitte (CROP_FRACTION der Breite/Höhe) vergrößert als ImageData. */
function centerCrop(canvas, scale) {
  const sw = Math.round(canvas.width * CROP_FRACTION);
  const sh = Math.round(canvas.height * CROP_FRACTION);
  const out = document.createElement('canvas');
  out.width = Math.round(sw * scale);
  out.height = Math.round(sh * scale);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, Math.round((canvas.width - sw) / 2), Math.round((canvas.height - sh) / 2), sw, sh, 0, 0, out.width, out.height);
  return ctx.getImageData(0, 0, out.width, out.height);
}

async function wasmDetector() {
  const mod = await loadWasmReader();
  let cycle = 0;

  const read = async (image) => {
    const results = await mod.readBarcodes(image, {
      formats: WASM_FORMATS,
      tryHarder: true,
      tryRotate: true,
      tryInvert: false,
      tryDownscale: true,
      maxNumberOfSymbols: 8,
    });
    const hits = results
      .filter((r) => r.isValid !== false && r.text)
      .map((r) => {
        const p = Object.values(r.position);
        return { text: r.text, x: p.reduce((sum, q) => sum + q.x, 0) / p.length, y: p.reduce((sum, q) => sum + q.y, 0) / p.length };
      });
    return pickNearestCenter(hits, image.width, image.height);
  };

  return {
    /**
     * source: Canvas mit dem Bild. Zuerst das ganze Bild, dann vergrößerte Ausschnitte der Mitte.
     * Live (thorough = false) kommt pro Aufruf nur eine Vergrößerung dran, reihum; bei Fotos alle.
     */
    async detect(canvas, width, height, thorough = false) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const text = await read(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (text) return text;
      const scales = thorough ? CROP_SCALES : [CROP_SCALES[cycle++ % CROP_SCALES.length]];
      for (const scale of scales) {
        const found = await read(centerCrop(canvas, scale));
        if (found) return found;
      }
      return null;
    },
  };
}

/** Liest einen Code aus einer Bilddatei. Gibt den Text oder null zurück. */
export async function decodeImageFile(file) {
  const bmp = await createImageBitmap(file); // berücksichtigt die EXIF-Drehung
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();

  const native = await nativeDetector();
  if (native) {
    try {
      const text = await native.detect(canvas, canvas.width, canvas.height);
      if (text) return text;
    } catch {
      /* weiter mit zxing-wasm */
    }
  }
  return (await wasmDetector()).detect(canvas, canvas.width, canvas.height, true);
}

/* ---------- Oberfläche ---------- */

/**
 * Öffnet den Scanner als Vollbild-Overlay.
 * Löst mit dem erkannten/eingegebenen Text auf, bei Abbruch mit null.
 */
export function openScanner() {
  return new Promise((resolve) => {
    let stream;
    let timer;
    let finished = false;

    const video = h('video', { class: 'scan-video', playsInline: true, muted: true, autoplay: true });
    const status = h('p', { class: 'scan-status', role: 'status' }, 'Kamera wird gestartet …');
    const torchBtn = h('button', { type: 'button', class: 'btn', hidden: true }, 'Licht');
    const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', 'aria-label': 'Foto auswählen' });
    const manual = h('input', { type: 'text', placeholder: 'Inventarnummer eingeben', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'Inventarnummer' });

    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      document.body.classList.remove('scanning');
      if (value && navigator.vibrate) navigator.vibrate(60);
      resolve(value ? String(value).trim() || null : null);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
    };

    const manualForm = h(
      'form',
      {
        class: 'scan-manual',
        onsubmit: (e) => {
          e.preventDefault();
          if (manual.value.trim()) finish(manual.value);
        },
      },
      manual,
      h('button', { type: 'submit', class: 'btn primary' }, 'Öffnen'),
    );

    const overlay = h(
      'div',
      { class: 'scanner', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Strichcode scannen' },
      h('div', { class: 'scan-view' }, video, h('div', { class: 'scan-frame' })),
      status,
      h(
        'div',
        { class: 'scan-actions' },
        torchBtn,
        h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'Foto wählen'),
        h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, 'Abbrechen'),
      ),
      manualForm,
      fileInput,
    );

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      status.textContent = 'Foto wird gelesen …';
      try {
        const text = await decodeImageFile(file);
        if (text) finish(text);
        else status.textContent = 'Im Foto wurde kein Strichcode erkannt. Bitte näher und scharf aufnehmen.';
      } catch {
        status.textContent = 'Das Foto konnte nicht gelesen werden.';
      }
    });

    document.addEventListener('keydown', onKey);
    document.body.classList.add('scanning');
    document.body.append(overlay);

    startCamera().catch((e) => {
      status.textContent = e.userMessage ?? 'Kamera nicht verfügbar. Du kannst ein Foto wählen oder die Nummer eintippen.';
    });

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('keine Kamera-API'), {
          userMessage: 'Kamera nicht verfügbar (die App muss über HTTPS geöffnet sein). Foto wählen oder Nummer eintippen.',
        });
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (e) {
        throw Object.assign(e, {
          userMessage:
            e.name === 'NotAllowedError'
              ? 'Kamerazugriff abgelehnt. In den Browser-Einstellungen erlauben, oder Foto wählen / Nummer eintippen.'
              : 'Kamera konnte nicht gestartet werden. Foto wählen oder Nummer eintippen.',
        });
      }
      if (finished) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() ?? {};
      if (caps.focusMode?.includes?.('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }
      if (caps.torch) {
        let on = false;
        torchBtn.hidden = false;
        torchBtn.onclick = async () => {
          on = !on;
          try {
            await track.applyConstraints({ advanced: [{ torch: on }] });
            torchBtn.classList.toggle('active', on);
          } catch {
            on = !on;
          }
        };
      }

      status.textContent = 'Scanner wird geladen …';
      const native = await nativeDetector();
      let wasm = null;
      if (!native) {
        try {
          wasm = await wasmDetector();
        } catch (e) {
          throw Object.assign(e, { userMessage: 'Scanner konnte nicht geladen werden. Foto wählen oder Nummer eintippen.' });
        }
      }
      if (finished) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      status.textContent = 'Strichcode ins Bild halten …';

      const tick = async () => {
        if (finished) return;
        if (video.readyState >= 2 && video.videoWidth) {
          try {
            let text;
            if (native) {
              text = await native.detect(video, video.videoWidth, video.videoHeight);
            } else {
              const scale = Math.min(1, LIVE_MAX_WIDTH / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              text = await wasm.detect(canvas, canvas.width, canvas.height);
            }
            if (text) return finish(text);
          } catch {
            /* einzelner Frame fehlgeschlagen, weiter */
          }
        }
        if (!finished) timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    }
  });
}

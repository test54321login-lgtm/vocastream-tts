/* js/ocr.js — OCR via Tesseract.js with background pre-warming */
import { showToast } from './ui.js';

let worker      = null;
let currentLang = '';
let prewarming  = false;
let prewarmed   = false;

// ══════════════════════════════════════════════════════════════════════════
// PRE-WARM: call this silently after login — downloads eng model in bg
// Why: Tesseract downloads traineddata (~10MB per language) on first use.
//      Pre-warming does it invisibly so user sees instant OCR later.
// ══════════════════════════════════════════════════════════════════════════
export async function prewarmOCR() {
  // Only pre-warm once, skip if already done or in progress
  if (prewarmed || prewarming) return;
  prewarming = true;

  try {
    await waitForTesseract(15000);
    // Pre-warm with English only — fastest, covers most use cases
    // Other languages will init on first use (user already knows to wait)
    worker      = await createWorker('eng');
    currentLang = 'eng';
    prewarmed   = true;
    console.log('[OCR] Pre-warmed successfully');
  } catch (err) {
    // Pre-warm failure is silent — OCR will still work, just with cold start
    console.warn('[OCR] Pre-warm failed (non-critical):', err.message);
  } finally {
    prewarming = false;
  }
}

// ── Get or create worker for given language ────────────────────────────────
async function getWorker(lang) {
  await waitForTesseract();

  // Reuse if same lang
  if (worker && currentLang === lang) return worker;

  // Different lang requested — terminate old, create new
  if (worker) {
    await worker.terminate().catch(() => {});
    worker = null;
  }

  worker      = await createWorker(lang);
  currentLang = lang;
  return worker;
}

// ── Create worker with progress events ────────────────────────────────────
function createWorker(lang) {
  return Tesseract.createWorker(lang, 1, {
    logger: (m) => {
      window.dispatchEvent(new CustomEvent('ocr-progress', { detail: m }));
    },
    // Use fast model for speed — quality still good for printed/typed text
    // For handwriting, standard model is better but 4x slower to download
    langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
    corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js',
  });
}

// ── Main OCR function ──────────────────────────────────────────────────────
export async function recognizeImage(imageFile, lang = 'eng') {
  await waitForTesseract();

  const w = await getWorker(lang);
  const { data: { text, confidence } } = await w.recognize(imageFile);

  if (!text.trim()) {
    throw new Error('No text detected. Try a clearer or higher-contrast image.');
  }

  return { text: text.trim(), confidence: Math.round(confidence) };
}

// ── Terminate worker (call on page unload) ─────────────────────────────────
export async function terminateOCR() {
  if (worker) {
    await worker.terminate().catch(() => {});
    worker      = null;
    currentLang = '';
    prewarmed   = false;
  }
}

// ── Wait for Tesseract CDN script to load ─────────────────────────────────
function waitForTesseract(timeout = 12000) {
  return new Promise((resolve, reject) => {
    if (typeof Tesseract !== 'undefined') { resolve(); return; }
    const start = Date.now();
    const id = setInterval(() => {
      if (typeof Tesseract !== 'undefined') {
        clearInterval(id);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(id);
        reject(new Error('Tesseract.js failed to load. Check your connection.'));
      }
    }, 150);
  });
}

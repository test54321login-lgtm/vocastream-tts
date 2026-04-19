/* js/parsers.js — File parsing: PDF, DOCX, TXT, Folder, URL */
import { authFetch } from './auth.js';
import { showToast } from './ui.js';

// ── Generic file-to-text dispatcher ───────────────────────────────────────
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf')  return parsePDF(file);
  if (ext === 'docx') return parseDOCX(file);
  if (ext === 'doc')  return parseDOCX(file); // best effort
  if (ext === 'txt')  return parseTXT(file);
  throw new Error(`Unsupported file type: .${ext}`);
}

// ── PDF ────────────────────────────────────────────────────────────────────
export async function parsePDF(file) {
  await waitForLib(() => window.pdfjsLib, 'PDF.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const arrayBuffer = await readAsArrayBuffer(file);
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText.trim();
}

// ── DOCX ───────────────────────────────────────────────────────────────────
export async function parseDOCX(file) {
  await waitForLib(() => window.mammoth, 'mammoth.js');
  const arrayBuffer = await readAsArrayBuffer(file);
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  if (result.messages?.length) {
    result.messages.forEach(m => console.warn('[DOCX]', m));
  }
  return result.value.trim();
}

// ── TXT ────────────────────────────────────────────────────────────────────
export async function parseTXT(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read text file'));
    reader.readAsText(file, 'UTF-8');
  });
}

// ── Folder batch ───────────────────────────────────────────────────────────
export async function parseFolder(files, onProgress) {
  const supported = Array.from(files).filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ['pdf', 'docx', 'doc', 'txt'].includes(ext);
  });

  if (!supported.length) {
    throw new Error('No supported files found in folder (PDF, DOCX, TXT)');
  }

  const results = [];
  for (let i = 0; i < supported.length; i++) {
    const file = supported[i];
    onProgress?.({ file: file.name, index: i, total: supported.length, status: 'loading' });
    try {
      const text = await parseFile(file);
      results.push({ file: file.name, text, status: 'done' });
      onProgress?.({ file: file.name, index: i, total: supported.length, status: 'done' });
    } catch (err) {
      results.push({ file: file.name, text: '', status: 'error', error: err.message });
      onProgress?.({ file: file.name, index: i, total: supported.length, status: 'error' });
    }
  }

  return results;
}

// ── URL fetch (via Vercel proxy to avoid CORS) ─────────────────────────────
export async function fetchURL(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('Please enter a valid URL starting with http:// or https://');
  }

  const encodedUrl = encodeURIComponent(url);
  const res = await authFetch(`/api/fetch-url?url=${encodedUrl}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch URL' }));
    throw new Error(err.error || 'Failed to fetch URL content');
  }

  const data = await res.json();
  return data.text || '';
}

// ── Helpers ────────────────────────────────────────────────────────────────
function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

function waitForLib(getter, name, timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (getter()) { resolve(); return; }
    const start = Date.now();
    const id = setInterval(() => {
      if (getter()) { clearInterval(id); resolve(); }
      else if (Date.now() - start > timeout) {
        clearInterval(id);
        reject(new Error(`${name} failed to load. Check your connection.`));
      }
    }, 100);
  });
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = { pdf: '📄', docx: '📝', doc: '📝', txt: '📃' };
  return map[ext] || '📎';
}

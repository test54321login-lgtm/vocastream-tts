/* js/tts.js — TTS Engine with chunking for Web Speech API */
import { authFetch } from './auth.js';
import { showToast } from './ui.js';

// ── State ──────────────────────────────────────────────────────────────────
let currentEngine = 'webspeech';
let naturalAudio  = null;
let isPlaying     = false;
let isPaused      = false;

// Chunking state (Web Speech API)
let chunks        = [];   // array of string chunks
let chunkIndex    = 0;    // current chunk being spoken
let currentOptions = {};  // voice/rate/pitch stored for resume
let stopRequested = false;

let onPlayCallback      = null;
let onPauseCallback     = null;
let onEndCallback       = null;
let onProgressCallback  = null;  // (current, total) → for chunk progress UI

// ── Engine selector ────────────────────────────────────────────────────────
export function setEngine(engine) {
  stopTTS();
  currentEngine = engine;
}

export function getEngine()    { return currentEngine; }
export function getIsPlaying() { return isPlaying; }
export function getIsPaused()  { return isPaused; }

// ── Callback hooks ─────────────────────────────────────────────────────────
export function setCallbacks({ onPlay, onPause, onEnd, onProgress }) {
  onPlayCallback     = onPlay     || null;
  onPauseCallback    = onPause    || null;
  onEndCallback      = onEnd      || null;
  onProgressCallback = onProgress || null;
}

// ── Main speak entry point ─────────────────────────────────────────────────
export async function speak(text, options = {}) {
  if (!text || !text.trim()) {
    showToast('Please enter some text first.', 'info');
    return;
  }
  stopTTS();
  if (currentEngine === 'webspeech') {
    speakWebSpeechChunked(text, options);
  } else {
    await speakNatural(text, options);
  }
}

// ── Toggle play/pause ──────────────────────────────────────────────────────
export function togglePlayPause(text, options = {}) {
  if (!isPlaying && !isPaused) {
    speak(text, options);
    return;
  }

  if (currentEngine === 'webspeech') {
    if (isPaused) {
      stopRequested = false;
      window.speechSynthesis.resume();
      isPlaying = true; isPaused = false;
      onPlayCallback?.();
    } else {
      window.speechSynthesis.pause();
      isPlaying = false; isPaused = true;
      onPauseCallback?.();
    }
  } else {
    if (naturalAudio) {
      if (isPaused) {
        naturalAudio.play();
        isPlaying = true; isPaused = false;
        onPlayCallback?.();
      } else {
        naturalAudio.pause();
        isPlaying = false; isPaused = true;
        onPauseCallback?.();
      }
    }
  }
}

// ── Stop ───────────────────────────────────────────────────────────────────
export function stopTTS() {
  stopRequested = true;

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (naturalAudio) {
    naturalAudio.pause();
    naturalAudio.src = '';
    naturalAudio = null;
  }

  chunks     = [];
  chunkIndex = 0;
  isPlaying  = false;
  isPaused   = false;

  onEndCallback?.();
}

// ══════════════════════════════════════════════════════════════════════════
// ENGINE 1: Web Speech API — chunked for large text
// ── Why chunking: Chrome/Android hard-limits ~32,767 chars per utterance.
//    Large PDFs can be 100,000+ chars → synthesis-failed error.
//    Solution: split at sentence boundaries, speak sequentially via onend.
// ══════════════════════════════════════════════════════════════════════════

// Max chars per utterance — 2000 is safe across all browsers including mobile
const WEB_SPEECH_CHUNK_SIZE = 2000;

// Split text at sentence boundaries — never cut mid-sentence
function splitIntoChunks(text, maxLen = WEB_SPEECH_CHUNK_SIZE) {
  const result = [];
  // Normalize whitespace
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  if (clean.length <= maxLen) return [clean];

  // Split on sentence-ending punctuation followed by space/newline
  // Keeps the punctuation with the sentence
  const sentenceRegex = /[^.!?\n]+[.!?\n]+[\s]*/g;
  const sentences = [];
  let match;
  let lastIndex = 0;

  while ((match = sentenceRegex.exec(clean)) !== null) {
    sentences.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  // Catch any remaining text after last sentence
  if (lastIndex < clean.length) {
    sentences.push(clean.slice(lastIndex));
  }

  // If no sentence splits found, force-split by maxLen at word boundaries
  if (!sentences.length) {
    let start = 0;
    while (start < clean.length) {
      let end = start + maxLen;
      if (end >= clean.length) { result.push(clean.slice(start)); break; }
      // Walk back to nearest space
      while (end > start && clean[end] !== ' ') end--;
      if (end === start) end = start + maxLen; // no space found, hard cut
      result.push(clean.slice(start, end).trim());
      start = end;
    }
    return result.filter(Boolean);
  }

  // Combine sentences into chunks that don't exceed maxLen
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      result.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) result.push(current.trim());

  return result.filter(Boolean);
}

function speakWebSpeechChunked(text, options = {}) {
  if (!('speechSynthesis' in window)) {
    showToast('Web Speech API not supported in this browser.', 'error');
    return;
  }

  chunks        = splitIntoChunks(text);
  chunkIndex    = 0;
  currentOptions = options;
  stopRequested  = false;

  speakChunk(chunkIndex, options);
}

function speakChunk(index, options) {
  if (stopRequested || index >= chunks.length) {
    // All chunks done or stopped
    isPlaying  = false;
    isPaused   = false;
    chunks     = [];
    chunkIndex = 0;
    onEndCallback?.();
    return;
  }

  const { voice, rate = 1, pitch = 1 } = options;
  const utterance = new SpeechSynthesisUtterance(chunks[index]);

  // Resolve voice object
  if (voice) {
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v => v.name === voice);
    if (match) utterance.voice = match;
  }

  utterance.rate  = parseFloat(rate);
  utterance.pitch = parseFloat(pitch);

  utterance.onstart = () => {
    isPlaying  = true;
    isPaused   = false;
    chunkIndex = index;
    onPlayCallback?.();
    // Report progress to UI: "chunk 1 / 45"
    if (chunks.length > 1) {
      onProgressCallback?.(index + 1, chunks.length);
    }
  };

  utterance.onpause = () => {
    isPlaying = false;
    isPaused  = true;
    onPauseCallback?.();
  };

  utterance.onresume = () => {
    isPlaying = true;
    isPaused  = false;
    onPlayCallback?.();
  };

  utterance.onend = () => {
    if (stopRequested) return; // stop was called, don't advance
    // Advance to next chunk
    speakChunk(index + 1, options);
  };

  utterance.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    console.error('[WebSpeech] Error on chunk', index, e.error);
    isPlaying = false; isPaused = false;
    showToast(`Speech error: ${e.error}. Try shorter text or a different voice.`, 'error');
    onEndCallback?.();
  };

  window.speechSynthesis.speak(utterance);
}

// ── Get available Web Speech voices ───────────────────────────────────────
export function getVoices() {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis?.getVoices() || [];
    if (voices.length) { resolve(voices); return; }
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      resolve(window.speechSynthesis.getVoices());
    }, { once: true });
    setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 1500);
  });
}

// ── Expose chunk info for UI ───────────────────────────────────────────────
export function getChunkInfo() {
  return { current: chunkIndex + 1, total: chunks.length };
}

// ══════════════════════════════════════════════════════════════════════════
// ENGINE 2: Natural Voice — max 5000 chars to protect Kaggle
// ══════════════════════════════════════════════════════════════════════════
const NATURAL_MAX_CHARS = 5000;

async function speakNatural(text, { language = 'en', speaker = 'meera' } = {}) {
  if (!navigator.onLine) {
    showToast('Natural Voice Engine requires internet connection.', 'error');
    return;
  }

  // Enforce 5000 char limit — warn user if truncated
  let sendText = text;
  if (text.length > NATURAL_MAX_CHARS) {
    sendText = text.slice(0, NATURAL_MAX_CHARS);
    showToast(`Text trimmed to ${NATURAL_MAX_CHARS.toLocaleString()} characters for Natural Engine.`, 'info');
  }

  try {
    onPlayCallback?.(); // show loading state

    const res = await authFetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sendText, language, speaker })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'TTS service unavailable' }));
      throw new Error(err.error || 'TTS service unavailable');
    }

    const blob     = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    naturalAudio   = new Audio(audioUrl);

    naturalAudio.onplay = () => {
      isPlaying = true; isPaused = false;
      onPlayCallback?.();
    };

    naturalAudio.onpause = () => {
      if (!naturalAudio.ended) {
        isPlaying = false; isPaused = true;
        onPauseCallback?.();
      }
    };

    naturalAudio.onended = () => {
      isPlaying = false; isPaused = false;
      URL.revokeObjectURL(audioUrl);
      onEndCallback?.();
    };

    naturalAudio.onerror = () => {
      showToast('Audio playback error.', 'error');
      isPlaying = false; isPaused = false;
      onEndCallback?.();
    };

    await naturalAudio.play();

  } catch (err) {
    isPlaying = false; isPaused = false;
    showToast(err.message || 'Natural engine error.', 'error');
    onEndCallback?.();
  }
}

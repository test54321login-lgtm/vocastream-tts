/* lib/sarvam.js — Sarvam AI TTS (Vercel) */
'use strict';
const fetch = require('node-fetch');

const SARVAM_ENDPOINT = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_MODEL    = 'bulbul:v3';
const MAX_CHARS       = 2000; // safe under Sarvam v3 limit of 2500

/**
 * All 11 Sarvam AI supported languages (frontend code → Sarvam BCP-47)
 * Source: https://docs.sarvam.ai/api-reference-docs/api-guides-tutorials/text-to-speech/rest-api
 */
const LANG_MAP = {
  en: 'en-IN',  // English (Indian accent)
  hi: 'hi-IN',  // Hindi
  bn: 'bn-IN',  // Bengali
  or: 'od-IN',  // Odia
  ta: 'ta-IN',  // Tamil
  te: 'te-IN',  // Telugu
  kn: 'kn-IN',  // Kannada
  ml: 'ml-IN',  // Malayalam
  mr: 'mr-IN',  // Marathi
  gu: 'gu-IN',  // Gujarati
  pa: 'pa-IN',  // Punjabi
};

/**
 * Valid Sarvam AI speaker names — EXACT names as returned by Sarvam API.
 * Source: error message from live API call.
 * Default: anushka (female, clear, works across all languages)
 */
const DEFAULT_SPEAKER = 'anushka';

const VALID_SPEAKERS = new Set([
  // Female
  'anushka','manisha','vidya','arya','ritu','priya','neha','pooja',
  'simran','kavya','ishita','shreya','tanya','roopa','shruti','suhani',
  'kavitha','rupali',
  // Male
  'abhilash','karun','hitesh','aditya','rahul','rohan','amit','dev',
  'ratan','varun','manan','sumit','kabir','aayan','shubh','ashutosh',
  'advait','anand','tarun','sunny','mani','gokul','vijay','mohit',
  'rehan','soham',
]);

/**
 * Split text at sentence boundaries, never exceeding maxLen per chunk.
 */
function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text.trim()];
  const chunks = [];
  let rest = text.trim();
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('.', maxLen);
    if (cut < maxLen * 0.5) cut = rest.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) cut = rest.lastIndexOf(' ', maxLen);
    if (cut < 10)           cut = maxLen;
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

/**
 * Call Sarvam API for one text chunk.
 * Returns base64-encoded WAV string.
 */
async function callSarvamChunk(text, langCode, speaker, apiKey) {
  const res = await fetch(SARVAM_ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':         'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      inputs:               [text],
      target_language_code: langCode,
      speaker,
      model:                SARVAM_MODEL,
      speech_sample_rate:   24000,
      enable_preprocessing: true,
      pace:                 1.0,
    }),
    timeout: 55000,
  });

  if (!res.ok) {
    let msg = `Sarvam API ${res.status}`;
    try {
      const err = await res.json();
      msg = err?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data.audios?.[0]) throw new Error('Sarvam returned no audio data');
  return data.audios[0]; // base64 WAV
}

/**
 * Combine multiple WAV Buffers into one valid WAV.
 * Keeps first WAV header (44 bytes), concatenates raw PCM from all chunks,
 * then rewrites the RIFF/data size fields correctly.
 */
function combineWavBuffers(buffers) {
  if (buffers.length === 1) return buffers[0];
  const HEADER_SIZE = 44;
  const header = Buffer.from(buffers[0].slice(0, HEADER_SIZE));
  const pcm    = Buffer.concat(buffers.map(b => b.slice(HEADER_SIZE)));
  header.writeUInt32LE(pcm.length + HEADER_SIZE - 8, 4); // RIFF chunk size
  header.writeUInt32LE(pcm.length, 40);                   // data chunk size
  return Buffer.concat([header, pcm]);
}

/**
 * Main synthesize function. Validates speaker, handles chunking + WAV combining.
 * @param {string} text
 * @param {string} language  - frontend code: 'en'|'hi'|'bn'|'or'|'ta'|'te'|'kn'|'ml'|'mr'|'gu'|'pa'
 * @param {string} speaker   - exact Sarvam speaker name
 * @param {string} apiKey    - SARVAM_API_KEY env var value
 * @returns {Buffer}         - Combined WAV audio buffer
 */
async function synthesize(text, language, speaker, apiKey) {
  const langCode = LANG_MAP[language] || 'en-IN';

  // Validate speaker — fall back to default if name is wrong/old
  const safeSpk = VALID_SPEAKERS.has(speaker) ? speaker : DEFAULT_SPEAKER;

  const chunks  = splitText(text.trim(), MAX_CHARS);
  const buffers = [];

  for (const chunk of chunks) {
    const b64 = await callSarvamChunk(chunk, langCode, safeSpk, apiKey);
    buffers.push(Buffer.from(b64, 'base64'));
  }

  return combineWavBuffers(buffers);
}

module.exports = {
  synthesize,
  splitText,
  combineWavBuffers,
  LANG_MAP,
  VALID_SPEAKERS,
  DEFAULT_SPEAKER,
  MAX_CHARS,
};

/* lib/sarvam.js — Sarvam AI TTS logic (Vercel + Netlify) */
'use strict';
const fetch = require('node-fetch');

const SARVAM_ENDPOINT = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_MODEL    = 'bulbul:v3';
const MAX_CHARS       = 2000; // safe under Sarvam v3 limit of 2500

/** Frontend lang code → Sarvam BCP-47 */
const LANG_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  or: 'od-IN',
};

/**
 * Split text at sentence boundaries, never exceeding maxLen per chunk.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string[]}
 */
function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text.trim()];
  const chunks = [];
  let rest = text.trim();
  while (rest.length > maxLen) {
    // Prefer sentence boundary, then word boundary, then hard cut
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
 * @throws {Error} with message from Sarvam on failure
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
 * Keeps first header (44 bytes), concatenates raw PCM from all chunks,
 * then rewrites the RIFF/data size fields.
 */
function combineWavBuffers(buffers) {
  if (buffers.length === 1) return buffers[0];
  const HEADER_SIZE = 44;
  const header = Buffer.from(buffers[0].slice(0, HEADER_SIZE));
  const pcm    = Buffer.concat(buffers.map(b => b.slice(HEADER_SIZE)));
  // Update RIFF chunk size (offset 4) and data chunk size (offset 40)
  header.writeUInt32LE(pcm.length + HEADER_SIZE - 8, 4);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Main TTS function. Handles chunking, multi-chunk WAV combining.
 * @param {string} text
 * @param {string} language - 'en'|'hi'|'bn'|'or'
 * @param {string} speaker  - Sarvam voice name
 * @param {string} apiKey   - SARVAM_API_KEY
 * @returns {Buffer} Combined WAV audio buffer
 */
async function synthesize(text, language, speaker, apiKey) {
  const langCode = LANG_MAP[language] || 'en-IN';
  const chunks   = splitText(text.trim(), MAX_CHARS);
  const buffers  = [];

  for (const chunk of chunks) {
    const b64 = await callSarvamChunk(chunk, langCode, speaker, apiKey);
    buffers.push(Buffer.from(b64, 'base64'));
  }

  return combineWavBuffers(buffers);
}

module.exports = { synthesize, splitText, combineWavBuffers, LANG_MAP, MAX_CHARS };

/* api/tts/speak.js — Vercel: POST /api/tts/speak */
'use strict';
const { verifyToken } = require('../../lib/jwt');
const { synthesize }  = require('../../lib/sarvam');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try { verifyToken(req.headers); }
  catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'SARVAM_API_KEY not set in Vercel env vars' });

  const { text, language = 'en', speaker = 'meera' } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

  try {
    const wavBuffer = await synthesize(text, language, speaker, apiKey);
    res.setHeader('Content-Type',   'audio/wav');
    res.setHeader('Content-Length', wavBuffer.length);
    res.setHeader('Cache-Control',  'no-store');
    return res.status(200).end(wavBuffer);
  } catch (err) {
    console.error('[Vercel TTS]', err.message);
    if (err.name === 'TimeoutError' || err.name === 'AbortError')
      return res.status(504).json({ error: 'Sarvam AI timed out. Try shorter text.' });
    return res.status(502).json({ error: `Sarvam AI error: ${err.message}` });
  }
};

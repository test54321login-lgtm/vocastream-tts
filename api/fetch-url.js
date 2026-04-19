/* api/fetch-url.js — Vercel: GET /api/fetch-url?url=<encoded> */
'use strict';
const fetch = require('node-fetch');
const { verifyToken }  = require('../lib/jwt');
const { htmlToText }   = require('../lib/htmlToText');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  try { verifyToken(req.headers); }
  catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const rawUrl = req.query?.url;
  if (!rawUrl) return res.status(400).json({ error: 'Missing url parameter' });

  let target;
  try { target = new URL(rawUrl); }
  catch { return res.status(400).json({ error: 'Invalid URL format' }); }

  if (['localhost','127.0.0.1','0.0.0.0','::1'].includes(target.hostname))
    return res.status(400).json({ error: 'That URL is not allowed.' });
  if (!['http:','https:'].includes(target.protocol))
    return res.status(400).json({ error: 'Only http and https URLs are supported.' });

  try {
    const response = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VocaStream/1.0)' },
      redirect: 'follow',
      timeout:  15000,
    });
    if (!response.ok) return res.status(400).json({ error: `Page returned HTTP ${response.status}` });

    const ct   = response.headers.get('content-type') || '';
    const body = await response.text();

    if (ct.includes('text/plain'))
      return res.status(200).json({ text: body.slice(0, 50000) });

    if (ct.includes('text/html') || ct.includes('application/xhtml')) {
      const text = htmlToText(body);
      if (text.length < 50) return res.status(400).json({ error: 'No readable text found on this page.' });
      return res.status(200).json({ text: text.slice(0, 50000) });
    }

    return res.status(400).json({ error: `Cannot extract text from: ${ct}` });
  } catch (err) {
    console.error('[Vercel FetchURL]', err.message);
    return res.status(500).json({ error: `Failed to fetch URL: ${err.message}` });
  }
};

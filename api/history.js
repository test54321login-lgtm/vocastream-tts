/* api/history.js — Vercel: GET/POST/DELETE /api/history */
'use strict';
const { ObjectId }    = require('mongodb');
const { getDB }       = require('../lib/db');
const { verifyToken } = require('../lib/jwt');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = verifyToken(req.headers); }
  catch { return res.status(401).json({ error: 'Unauthorized' }); }

  let db;
  try { db = await getDB(); }
  catch (err) {
    return res.status(500).json({ error: 'Database connection failed. Check MONGODB_URI and Atlas IP whitelist (0.0.0.0/0).' });
  }

  const col    = db.collection('history');
  const userId = user.id;

  if (req.method === 'GET') {
    try {
      const items = await col.find({ userId }).sort({ createdAt: -1 }).limit(100).toArray();
      return res.status(200).json({ items });
    } catch (err) {
      return res.status(500).json({ error: `Failed to fetch history: ${err.message}` });
    }
  }

  if (req.method === 'POST') {
    const { text, engine, language, voice = '' } = req.body || {};
    if (!text || !engine) return res.status(400).json({ error: 'text and engine are required' });
    try {
      await col.createIndex({ userId: 1, createdAt: -1 }).catch(() => {});
      const result = await col.insertOne({
        userId, textSnippet: text.slice(0, 200), fullText: text.slice(0, 10000),
        engine: engine === 'natural' ? 'natural' : 'webspeech',
        language: language || 'en', voice: voice || '', createdAt: new Date(),
      });
      // Rolling 200-item limit
      const count = await col.countDocuments({ userId });
      if (count > 200) {
        const old = await col.find({ userId }).sort({ createdAt: 1 }).limit(count - 200).toArray();
        if (old.length) await col.deleteMany({ _id: { $in: old.map(d => d._id) } });
      }
      return res.status(200).json({ _id: result.insertedId });
    } catch (err) {
      return res.status(500).json({ error: `Failed to save: ${err.message}` });
    }
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id is required' });
    let oid;
    try { oid = new ObjectId(id); }
    catch { return res.status(400).json({ error: 'Invalid id format' }); }
    try {
      const r = await col.deleteOne({ _id: oid, userId });
      if (r.deletedCount === 0) return res.status(404).json({ error: 'Item not found' });
      return res.status(200).json({ deleted: true });
    } catch (err) {
      return res.status(500).json({ error: `Failed to delete: ${err.message}` });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

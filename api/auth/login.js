/* api/auth/login.js — Vercel: POST /api/auth/login */
'use strict';
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { getDB } = require('../../lib/db');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.MONGODB_URI) return res.status(500).json({ error: 'MONGODB_URI not set' });
  if (!process.env.JWT_SECRET)  return res.status(500).json({ error: 'JWT_SECRET not set' });

  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    const db   = await getDB();
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });

    const dummy    = '$2a$12$dummyhashfortimingsafety000000000000000000000';
    const valid    = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummy).then(() => false);

    if (!user || !valid)
      return res.status(401).json({ error: 'Invalid email or password' });

    const payload = { id: user._id.toString(), email: user.email };
    const token   = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({ token, user: payload });

  } catch (err) {
    console.error('[Vercel Login]', err.name, err.message);
    if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError')
      return res.status(500).json({ error: 'Database connection failed. Check MONGODB_URI and Atlas IP whitelist (0.0.0.0/0).' });
    return res.status(500).json({ error: `Login failed: ${err.message}` });
  }
};

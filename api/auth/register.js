/* api/auth/register.js — Vercel: POST /api/auth/register */
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

  // Vercel auto-parses JSON body
  const body     = req.body || {};
  const { email, password } = body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email address' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const db    = await getDB();
    const users = db.collection('users');

    if (await users.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ error: 'An account with this email already exists' });

    const hashed = await bcrypt.hash(password, 12);
    const result = await users.insertOne({
      email:     email.toLowerCase(),
      password:  hashed,
      createdAt: new Date(),
    });
    await users.createIndex({ email: 1 }, { unique: true }).catch(() => {});

    const user  = { id: result.insertedId.toString(), email: email.toLowerCase() };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({ token, user });

  } catch (err) {
    console.error('[Vercel Register]', err.name, err.message);
    if (err.code === 11000)
      return res.status(400).json({ error: 'Email already exists' });
    if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError')
      return res.status(500).json({ error: 'Database connection failed. Check MONGODB_URI and Atlas IP whitelist (0.0.0.0/0).' });
    return res.status(500).json({ error: `Registration failed: ${err.message}` });
  }
};

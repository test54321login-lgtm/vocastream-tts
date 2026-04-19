/* lib/jwt.js — Shared JWT verify (Vercel + Netlify) */
'use strict';
const jwt = require('jsonwebtoken');

/**
 * Extract and verify Bearer token from a headers object.
 * Works with both Vercel (req.headers) and Netlify (event.headers).
 * Both platforms lower-case header names.
 */
function verifyToken(headers) {
  const auth  = headers['authorization'] || headers['Authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) throw new Error('No token provided');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { verifyToken };

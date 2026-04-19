/* lib/db.js — Shared MongoDB singleton (Vercel + Netlify) */
'use strict';
const { MongoClient } = require('mongodb');

let client = null;

async function getDB() {
  if (client && client.topology && client.topology.isConnected()) {
    return client.db('vocastream');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not set in environment variables');
  }
  client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS:         10000,
    maxPoolSize:              5,
  });
  await client.connect();
  return client.db('vocastream');
}

module.exports = { getDB };

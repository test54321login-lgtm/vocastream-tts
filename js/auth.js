/* js/auth.js — Authentication: login, register, JWT */

const TOKEN_KEY = 'voca_token';
const USER_KEY  = 'voca_user';

// ── Safe JSON parse — fixes "Unexpected end of JSON input" ─────────────────
// Root cause: server returns empty body on crash → res.json() throws.
// Fix: read as text first, then parse — with a human-readable fallback.
async function safeJson(res) {
  const text = await res.text().catch(() => '');
  if (!text || !text.trim()) {
    // Empty body — generate error from HTTP status
    const msgs = {
      500: 'Server error. Check Vercel function logs.',
      502: 'Bad gateway. Check your environment variables in Vercel.',
      503: 'Service unavailable.',
      401: 'Unauthorized.',
      403: 'Forbidden.',
      404: 'API route not found.',
    };
    throw new Error(msgs[res.status] || `HTTP ${res.status} with empty response`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // Body exists but is not JSON (e.g. HTML error page from Vercel)
    const preview = text.slice(0, 120).replace(/<[^>]+>/g, '').trim();
    throw new Error(`Unexpected server response: ${preview || 'non-JSON body'}`);
  }
}

// ── Token helpers ──────────────────────────────────────────────────────────
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  const token = getToken();
  if (!token) return false;
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// ── Register ───────────────────────────────────────────────────────────────
export async function register(email, password) {
  let res;
  try {
    res = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });
  } catch (networkErr) {
    throw new Error('Network error — are you offline?');
  }

  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || 'Registration failed');

  saveSession(data.token, data.user);
  return data;
}

// ── Login ──────────────────────────────────────────────────────────────────
export async function login(email, password) {
  let res;
  try {
    res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });
  } catch (networkErr) {
    throw new Error('Network error — are you offline?');
  }

  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || 'Login failed');

  saveSession(data.token, data.user);
  return data;
}

// ── Authenticated fetch wrapper ────────────────────────────────────────────
export async function authFetch(url, options = {}) {
  const token = getToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`
    }
  });
}

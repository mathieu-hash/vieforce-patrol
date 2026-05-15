/**
 * PATCH /api/user/language
 * Body: { "language": "en" | "tl" | "ceb" }
 * Header: x-session-id (Patrol session UUID = users.id)
 */
const { verifySession, unauthorized } = require('../_lib/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yolxcmeoovztuindrglk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED = { en: true, tl: true, ceb: true };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-session-id, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' });

  const user = await verifySession(req);
  if (!user) return unauthorized(res);

  const body = req.body || {};
  const lang = String(body.language || '').toLowerCase().trim();
  if (!ALLOWED[lang]) {
    return res.status(400).json({ error: 'Invalid language', allowed: ['en', 'tl', 'ceb'] });
  }

  const url =
    SUPABASE_URL +
    '/rest/v1/users?id=eq.' +
    encodeURIComponent(user.id) +
    '&select=id,language';

  const upstream = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ language: lang, updated_at: new Date().toISOString() })
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    let detail;
    try {
      detail = JSON.parse(text);
    } catch (_) {
      detail = text;
    }
    return res.status(upstream.status).json({ error: 'update failed', detail });
  }

  let rows = [];
  try {
    rows = JSON.parse(text);
  } catch (_) {}
  const row = Array.isArray(rows) ? rows[0] : rows;
  return res.status(200).json({ ok: true, language: (row && row.language) || lang });
};

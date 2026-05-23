/**
 * PATCH /api/user/language
 * Body: { "language": "en" | "tl" | "ceb" }
 *
 * Wave 1 (W1-ApiGates): requireUser; user can only patch their own row.
 * Wrapped Supabase REST call in try/catch (Audit C P1-10).
 */
const { requireUser } = require('../_lib/api-auth');
const { applyPatrolCors } = require('../_lib/patrol-cors');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yolxcmeoovztuindrglk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED = { en: true, tl: true, ceb: true };

module.exports = async function handler(req, res) {
  applyPatrolCors(req, res, 'PATCH, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' });

  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(req.body || '{}'); } catch (_) { body = {}; }
  }
  const lang = String(body.language || '').toLowerCase().trim();
  if (!ALLOWED[lang]) {
    return res.status(400).json({ error: 'Invalid language', allowed: ['en', 'tl', 'ceb'] });
  }

  // Self-only — patch user.id from session, never trust client-provided id.
  const url =
    SUPABASE_URL +
    '/rest/v1/users?id=eq.' +
    encodeURIComponent(user.id) +
    '&select=id,language';

  try {
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
      try { detail = JSON.parse(text); } catch (_) { detail = text; }
      if (detail && typeof detail === 'object') delete detail.hint;
      const mapped = upstream.status >= 500 ? 502 : upstream.status;
      return res.status(mapped).json({ error: 'update failed', detail });
    }

    let rows = [];
    try { rows = JSON.parse(text); } catch (_) {}
    const row = Array.isArray(rows) ? rows[0] : rows;
    return res.status(200).json({ ok: true, language: (row && row.language) || lang });
  } catch (err) {
    console.error('[api/user/language] supabase fetch failed:', (err && err.message) || err);
    return res.status(502).json({ error: 'SUPABASE_UNREACHABLE', message: 'Could not reach Supabase REST' });
  }
};

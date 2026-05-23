// POST /api/farms — create a farm row, owned by the calling user.
// Audit C P0-S6: add role gate via requireUser + try/catch on Supabase fetch.
const { requireUser } = require('./_lib/api-auth');
const { applyPatrolCors } = require('./_lib/patrol-cors');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yolxcmeoovztuindrglk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Conservative length caps to keep PostgREST + UI safe (Audit C P1-3).
function cap(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function cleanFarmPayload(input, user) {
  const src = input || {};
  const heads = parseInt(src.heads, 10);
  return {
    name: cap(src.name, 200) || '',
    type: cap(src.type, 60),
    heads: Number.isFinite(heads) ? Math.max(0, heads) : 0,
    breed: cap(src.breed, 80),
    feed_partner: cap(src.feed_partner, 120),
    vet_support: cap(src.vet_support, 120),
    owner_name: cap(src.owner_name, 120),
    phone: cap(src.phone, 32),
    lat: src.lat == null ? null : Number(src.lat),
    lng: src.lng == null ? null : Number(src.lng),
    created_by: user.id
  };
}

module.exports = async function handler(req, res) {
  applyPatrolCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' });

  // Audit C P0-S6: every authenticated user can create a farm (TSR/DSM/RSM/etc).
  // Role refinement (TSR-vs-manager) is deliberately deferred — Audit C P1-3
  // notes broader role allowlist work, but the immediate gate is "is logged in".
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  // Defensive JSON parse (Audit C P1-6).
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(req.body || '{}');
    } catch (_) {
      body = {};
    }
  }

  const payload = cleanFarmPayload(body, user);
  if (!payload.name) return res.status(400).json({ error: 'Farm name is required' });

  try {
    const upstream = await fetch(SUPABASE_URL + '/rest/v1/farms?select=*', {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      let detail;
      try { detail = JSON.parse(text); } catch (_) { detail = text; }
      // Strip PostgREST internal hints to avoid leaking policy expressions (Audit C P1-4).
      if (detail && typeof detail === 'object') {
        delete detail.hint;
      }
      const mapped = upstream.status >= 500 ? 502 : upstream.status;
      return res.status(mapped).json({ error: 'createFarm failed', detail });
    }

    let rows = [];
    try { rows = JSON.parse(text); } catch (_) {}
    return res.status(200).json(Array.isArray(rows) ? rows[0] : rows);
  } catch (err) {
    console.error('[api/farms] supabase fetch failed:', (err && err.message) || err);
    return res.status(502).json({ error: 'SUPABASE_UNREACHABLE', message: 'Could not reach Supabase REST' });
  }
};

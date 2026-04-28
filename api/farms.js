const { verifySession, unauthorized } = require('./_lib/auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yolxcmeoovztuindrglk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-session-id, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function cleanFarmPayload(input, user) {
  const src = input || {};
  const heads = parseInt(src.heads, 10);
  return {
    name: String(src.name || '').trim(),
    type: src.type || null,
    heads: Number.isFinite(heads) ? Math.max(0, heads) : 0,
    breed: src.breed || null,
    feed_partner: src.feed_partner || null,
    vet_support: src.vet_support || null,
    owner_name: src.owner_name || null,
    phone: src.phone || null,
    lat: src.lat == null ? null : Number(src.lat),
    lng: src.lng == null ? null : Number(src.lng),
    created_by: user.id
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' });

  const user = await verifySession(req);
  if (!user) return unauthorized(res);

  const payload = cleanFarmPayload(req.body, user);
  if (!payload.name) return res.status(400).json({ error: 'Farm name is required' });

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
    return res.status(upstream.status).json({ error: 'createFarm failed', detail });
  }

  let rows = [];
  try { rows = JSON.parse(text); } catch (_) {}
  return res.status(200).json(Array.isArray(rows) ? rows[0] : rows);
};

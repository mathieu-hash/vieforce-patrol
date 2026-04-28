// Server-side session verifier for SAP proxy routes.
// Reads x-session-id header, looks up the user via Supabase REST + service-role key.
// Returns the user record or null. Caches positive results for 30s in-memory.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yolxcmeoovztuindrglk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const _sessionCache = new Map(); // sessionId -> { user, ts }
const SESSION_TTL_MS = 30 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifySession(req) {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId || !UUID_RE.test(sessionId)) return null;

  // Cache hit
  const cached = _sessionCache.get(sessionId);
  if (cached && (Date.now() - cached.ts) < SESSION_TTL_MS) return cached.user;

  if (!SERVICE_KEY) {
    console.error('[auth] SUPABASE_SERVICE_ROLE_KEY missing — cannot verify session');
    return null;
  }

  const url = SUPABASE_URL + '/rest/v1/users'
    + '?id=eq.' + encodeURIComponent(sessionId)
    + '&select=id,role,region,district,territory,name,is_active,sap_slpcode,sap_district_code,district_label'
    + '&limit=1';

  try {
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY
      }
    });
    if (!res.ok) {
      console.error('[auth] Supabase lookup ' + res.status);
      return null;
    }
    const rows = await res.json();
    const user = Array.isArray(rows) && rows[0];
    if (!user || user.is_active === false) return null;

    _sessionCache.set(sessionId, { user, ts: Date.now() });
    return user;
  } catch (e) {
    console.error('[auth] verifySession failed:', e.message);
    return null;
  }
}

function unauthorized(res, msg) {
  res.setHeader('Content-Type', 'application/json');
  res.status(401).json({ error: 'Unauthorized', message: msg || 'Missing or invalid session' });
}

module.exports = { verifySession, unauthorized };

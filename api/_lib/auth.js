// Server-side session verifier for Patrol Vercel functions.
//
// Wave 1 (W1-AuthCore): replaces the legacy x-session-id UUID system with
// proper Supabase Auth Bearer-JWT validation.
//
// Contract (relied on by W1-ApiGates):
//   requireUser(req)  → { user_id, role, email, name, region, district, territory, ... }
//                       or throws { status: 401, message }
//   requireRole(req, allowedRoles)
//                     → same, or throws { status: 401|403, message }
//   withAuth(handler, { roles })
//                     → Vercel-style (req,res) wrapper that 401/403s on its own
//
// Backwards-compat: verifySession(req) + unauthorized(res) are kept as thin
// wrappers so existing api/sap/*.js + api/admin/*.js handlers keep compiling
// without W1-ApiGates having to land first. verifySession now returns the
// same shape it used to (id, role, region, district, territory, name, ...) so
// downstream code (callHqProxy session.id, scope/wrapPatrolMeta) works
// unchanged.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yolxcmeoovztuindrglk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 5-second positive cache (down from 30s) so role-downgrade or is_active=false
// propagates fast. Keyed by JWT (last 32 chars used as a cheap dedupe key — the
// JWT signature already makes the full token tamper-evident).
const _userCache = new Map(); // key -> { user, ts }
const USER_CACHE_TTL_MS = 5 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class AuthError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

function _bearerToken(req) {
  const h = req && req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!h) return null;
  const s = String(h).trim();
  if (s.toLowerCase().startsWith('bearer ')) return s.slice(7).trim();
  return null;
}

function _cacheKey(jwt) {
  // Last 32 chars of a JWT is the start of its signature — unique per token.
  return jwt.length > 32 ? jwt.slice(-32) : jwt;
}

/**
 * Validate a Supabase Auth JWT by calling the Auth user endpoint. This is the
 * same path `supabase.auth.getUser(jwt)` takes under the hood. We do it with
 * plain fetch to avoid pulling @supabase/supabase-js into the serverless
 * bundle (Patrol's existing api/_lib/* already uses raw fetch + service key).
 *
 * Returns the normalised Patrol user object, or throws AuthError.
 */
async function _validateAndLoad(jwt) {
  if (!SERVICE_KEY) {
    throw new AuthError(500, 'SUPABASE_SERVICE_ROLE_KEY missing — cannot verify session');
  }

  // Cache check
  const key = _cacheKey(jwt);
  const cached = _userCache.get(key);
  if (cached && (Date.now() - cached.ts) < USER_CACHE_TTL_MS) {
    return cached.user;
  }

  // Ask GoTrue to validate the JWT and return its user payload.
  let authUser;
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + jwt
      }
    });
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(401, 'Invalid or expired session');
    }
    if (!res.ok) {
      throw new AuthError(401, 'Auth lookup failed (' + res.status + ')');
    }
    authUser = await res.json();
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(401, 'Auth lookup error: ' + (e && e.message ? e.message : 'unknown'));
  }

  if (!authUser || !authUser.id) {
    throw new AuthError(401, 'Auth user payload missing id');
  }

  // The verify-pin Edge Function stamps the Patrol user_id + role + org fields
  // into app_metadata (server-side-only writable). For Google OAuth managers
  // we still need to look up the row by email since they don't go through
  // verify-pin. Both paths converge on the same shape below.
  const appMeta = authUser.app_metadata || {};
  let patrolUser;

  if (appMeta.patrol_user_id && appMeta.role) {
    // PIN path — trust the stamped metadata, but enrich with fresh DB row so
    // role/is_active changes propagate within the cache TTL.
    patrolUser = await _loadPatrolUserById(appMeta.patrol_user_id);
  } else if (authUser.email) {
    // Google OAuth path — look up by email.
    patrolUser = await _loadPatrolUserByEmail(authUser.email);
  } else {
    throw new AuthError(401, 'Session has no patrol_user_id or email — cannot resolve role');
  }

  if (!patrolUser || patrolUser.is_active === false) {
    throw new AuthError(401, 'User not active');
  }

  // Normalise to the contract shape consumed by W1-ApiGates and existing
  // session.id-based callers (callHqProxy, scope, etc.).
  const normalised = {
    id: patrolUser.id,
    user_id: patrolUser.id,
    role: patrolUser.role,
    email: patrolUser.email || authUser.email || null,
    name: patrolUser.name,
    region: patrolUser.region,
    district: patrolUser.district,
    territory: patrolUser.territory,
    is_active: patrolUser.is_active !== false,
    language: patrolUser.language || 'en',
    // Fields some legacy callers read directly (sap proxy scope, admin):
    sap_slpcode: patrolUser.sap_slpcode || null,
    sap_district_code: patrolUser.sap_district_code || null,
    district_label: patrolUser.district_label || null
  };

  _userCache.set(key, { user: normalised, ts: Date.now() });
  return normalised;
}

async function _loadPatrolUserById(id) {
  if (!UUID_RE.test(String(id))) return null;
  const url = SUPABASE_URL + '/rest/v1/users'
    + '?id=eq.' + encodeURIComponent(id)
    + '&select=id,role,region,district,territory,name,email,is_active,language,sap_slpcode,sap_district_code,district_label'
    + '&limit=1';
  return _restSingle(url);
}

async function _loadPatrolUserByEmail(email) {
  const url = SUPABASE_URL + '/rest/v1/users'
    + '?email=eq.' + encodeURIComponent(String(email).toLowerCase())
    + '&select=id,role,region,district,territory,name,email,is_active,language,sap_slpcode,sap_district_code,district_label'
    + '&limit=1';
  return _restSingle(url);
}

async function _restSingle(url) {
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY
      }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? (rows[0] || null) : null;
  } catch (e) {
    return null;
  }
}

// --- Public contract --------------------------------------------------------

/**
 * Returns the authenticated user object, or throws AuthError({status, message}).
 * Caller is responsible for catching and responding.
 */
async function requireUser(req) {
  // Reject legacy x-session-id callers cleanly with a migration hint.
  const legacy = req && req.headers && (req.headers['x-session-id'] || req.headers['X-Session-Id']);
  if (legacy) {
    throw new AuthError(401, 'x-session-id is no longer supported — re-login to get a Bearer JWT', {
      migration_required: true
    });
  }

  const jwt = _bearerToken(req);
  if (!jwt) {
    throw new AuthError(401, 'Missing Authorization: Bearer header');
  }
  return _validateAndLoad(jwt);
}

/**
 * Returns the authenticated user, or throws AuthError if the role is not in
 * allowedRoles. Role compare is case-insensitive.
 */
async function requireRole(req, allowedRoles) {
  const user = await requireUser(req);
  const want = (allowedRoles || []).map(function (r) { return String(r).toLowerCase(); });
  const have = String(user.role || '').toLowerCase();
  if (want.indexOf(have) === -1) {
    throw new AuthError(403, 'Role "' + have + '" not allowed for this endpoint');
  }
  return user;
}

/**
 * Convenience wrapper for Vercel-style handlers. Catches AuthError and
 * responds 401/403 directly so handlers can stay terse.
 */
function withAuth(handler, opts) {
  opts = opts || {};
  return async function (req, res) {
    let user;
    try {
      user = opts.roles ? await requireRole(req, opts.roles) : await requireUser(req);
    } catch (e) {
      if (e instanceof AuthError) {
        res.setHeader('Content-Type', 'application/json');
        const body = { error: e.status === 403 ? 'Forbidden' : 'Unauthorized', message: e.message };
        if (e.extra && e.extra.migration_required) body.migration_required = true;
        return res.status(e.status).json(body);
      }
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ error: 'AuthInternal', message: (e && e.message) || String(e) });
    }
    req.patrolUser = user;
    return handler(req, res);
  };
}

// --- Legacy shims (kept for existing handlers + their unit tests) ------------

/**
 * Legacy: returns the Patrol user object (id, role, ...) or null. Used by
 * api/sap/*.js + api/admin/*.js until W1-ApiGates migrates them to
 * requireUser/withAuth. Now sources the user from the Bearer JWT, not
 * x-session-id.
 */
async function verifySession(req) {
  try {
    return await requireUser(req);
  } catch (e) {
    return null;
  }
}

function unauthorized(res, msg) {
  res.setHeader('Content-Type', 'application/json');
  res.status(401).json({ error: 'Unauthorized', message: msg || 'Missing or invalid session' });
}

module.exports = {
  // New W1-AuthCore contract
  requireUser,
  requireRole,
  withAuth,
  AuthError,
  // Legacy shims (kept until W1-ApiGates lands)
  verifySession,
  unauthorized
};

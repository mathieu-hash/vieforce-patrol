/**
 * Reflective CORS for Patrol browser clients — no wildcard in production-facing flows.
 * Merge env PATROL_CORS_ORIGINS (comma-separated) with defaults.
 */

const DEFAULT_ORIGINS = [
  'https://vieforce-patrol.vercel.app',
  'https://patrol.vienovo.ph',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://localhost:3000'
];

function _originSet() {
  const set = new Set(DEFAULT_ORIGINS);
  const extra = String(process.env.PATROL_CORS_ORIGINS || '')
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  for (var i = 0; i < extra.length; i++) set.add(extra[i]);
  return set;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {string} methods e.g. "GET, OPTIONS"
 * @returns {Record<string, string>}
 */
function patrolCorsHeaders(req, methods) {
  const allowed = _originSet();
  const raw = (req.headers && (req.headers.origin || req.headers.Origin)) || '';
  const origin = String(raw).trim();
  const headers = {
    'Access-Control-Allow-Headers': 'x-session-id, content-type',
    'Access-Control-Allow-Methods': methods || 'GET, OPTIONS'
  };
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function applyPatrolCors(req, res, methods) {
  const h = patrolCorsHeaders(req, methods);
  for (var k in h) {
    if (Object.prototype.hasOwnProperty.call(h, k)) res.setHeader(k, h[k]);
  }
}

module.exports = { patrolCorsHeaders, applyPatrolCors, _originSetForTests: _originSet };

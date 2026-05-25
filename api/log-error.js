// Vercel Serverless Function — POST /api/log-error
//
// Receives client-side error events from js/_util/error-reporter.js (beta channel only).
// Writes structured logs that Vercel/Datadog can scrape. Cheap, fire-and-forget,
// best-effort. Rate-limited in-memory per cold start to deter accidental floods;
// if the worker is recycled, the counter resets — that's acceptable for beta.
//
// Why not Sentry? See js/_util/error-reporter.js header. The DSN field is in
// config.js if/when Mat enables it later.

var _bucket = { count: 0, windowStart: Date.now() };
var WINDOW_MS = 60 * 1000;
var MAX_PER_WINDOW = 300; // ~5 req/sec sustained across all clients

function _rateLimited() {
  var now = Date.now();
  if (now - _bucket.windowStart > WINDOW_MS) {
    _bucket = { count: 0, windowStart: now };
  }
  _bucket.count++;
  return _bucket.count > MAX_PER_WINDOW;
}

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (_rateLimited()) {
    // Silent drop — still 204 so clients don't retry-storm.
    res.status(204).end();
    return;
  }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_e) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    res.status(204).end();
    return;
  }

  // Structured JSON line. Vercel log search will index this.
  try {
    var line = {
      tag: 'patrol_client_error',
      kind: String(body.kind || 'unknown').slice(0, 32),
      version: String(body.version || '').slice(0, 32),
      channel: String(body.channel || '').slice(0, 16),
      user_id: body.user_id || null,
      role: body.role ? String(body.role).slice(0, 32) : null,
      url: String(body.url || '').slice(0, 256),
      ua: String(body.ua || '').slice(0, 200),
      ts: String(body.ts || ''),
      detail: body.detail || null
    };
    // eslint-disable-next-line no-console
    console.error('[patrol_client_error]', JSON.stringify(line));
  } catch (_e) { /* never throw out of telemetry */ }

  res.status(204).end();
};

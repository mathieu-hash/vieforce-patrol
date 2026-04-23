// HTTP client to the HQ Cloud Run API. Server-to-server only.
// ─────────────────────────────────────────────────────────────────────────────
// Phase D (2026-04-19): deprecated callHqApi / callHqApiCached removed.
// Single public entry: callHqProxy — Bearer auth, scope=user:<uuid>,
// retry-once on 5xx, 10s timeout, structured {status, body} response.
// ─────────────────────────────────────────────────────────────────────────────

// Env-var name resolution: accept either HQ_API_BASE_URL (new) or HQ_API_BASE
// (legacy) so existing Vercel deployments don't break mid-rollout.
const DEFAULT_HQ_BASE = 'https://vieforce-hq-api-1057619753074.asia-southeast1.run.app';
function _hqBase() {
  return process.env.HQ_API_BASE_URL || process.env.HQ_API_BASE || DEFAULT_HQ_BASE;
}
const HQ_API_BASE = _hqBase(); // module-level export for test pinning

/**
 * Call an HQ endpoint with Bearer service-token auth and scope=user:<uuid>.
 *
 * @param {string}  hqPath   HQ path starting with '/' (e.g. '/api/sales')
 * @param {object}  session  Supabase session — must include `.id`
 * @param {object}  [params] Query params (merged with scope=user:<uuid>)
 * @param {object}  [opts]   Test-only injection. `timeoutMs` overrides the
 *                           10 000 ms default so unit tests don't wait 10s.
 * @returns {Promise<{status:number, body:object}>}
 *          - 2xx / 4xx / 5xx from HQ pass through
 *          - 504 on timeout (no retry)
 *          - 502 on network/DNS failure
 *          - Retries ONCE on a real HQ 5xx after a 500 ms backoff
 */
async function callHqProxy(hqPath, session, params, opts) {
  params = params || {};
  opts = opts || {};
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 10000;

  if (!session || !session.id) {
    return { status: 401, body: { error: 'NO_SESSION' } };
  }

  const qp = new URLSearchParams();
  for (const k in params) {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') qp.append(k, params[k]);
  }
  qp.append('scope', 'user:' + session.id);

  const url = _hqBase() + hqPath + '?' + qp.toString();
  const token = process.env.HQ_SERVICE_TOKEN || '';

  async function attempt() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'patrol-sap-proxy/2.0'
      };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const res = await fetch(url, { method: 'GET', headers: headers, signal: ctrl.signal });
      clearTimeout(timer);

      let body = {};
      try { body = await res.json(); } catch (_) { /* non-JSON — leave empty */ }
      return { status: res.status, body: body, timedOut: false };
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        return { status: 504, body: { error: 'HQ timeout', message: 'No response within ' + timeoutMs + 'ms' }, timedOut: true };
      }
      return { status: 502, body: { error: 'HQ_FETCH_FAILED', message: (err && err.message) || String(err) }, timedOut: false };
    }
  }

  const first = await attempt();
  if (!first.timedOut && first.status >= 500 && first.status < 600) {
    await new Promise(function (r) { setTimeout(r, 500); });
    const second = await attempt();
    return { status: second.status, body: second.body };
  }
  return { status: first.status, body: first.body };
}

module.exports = { callHqProxy, HQ_API_BASE };

// HTTP client to the HQ Cloud Run API. Server-to-server only.
// ─────────────────────────────────────────────────────────────────────────────
// Phase C (2026-04-19): added callHqProxy — Bearer auth, scope=user:<uuid>,
// retry-once on 5xx, 10s timeout, structured {status, body} response.
// Old callHqApi / callHqApiCached kept alive for the 6 existing /api/sap/*
// endpoints until Phase D refactors them.
// ─────────────────────────────────────────────────────────────────────────────

// Env-var name resolution: the original endpoint commit used HQ_API_BASE.
// The new Day-2 brief calls it HQ_API_BASE_URL. We accept either so Phase D
// can pivot Vercel env at its own pace without a big-bang rename.
const DEFAULT_HQ_BASE = 'https://vieforce-hq-api-1057619753074.asia-southeast1.run.app';
function _hqBase() {
  return process.env.HQ_API_BASE_URL || process.env.HQ_API_BASE || DEFAULT_HQ_BASE;
}
const HQ_API_BASE = _hqBase(); // kept as module-level export for backward compat

// ═══════════════════════════════════════════════════════════════════════════
// Phase C — the new standard proxy helper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call an HQ endpoint with Bearer service-token auth and scope=user:<uuid>.
 *
 * @param {string}  hqPath  HQ path starting with '/' (e.g. '/api/sales')
 * @param {object}  session Supabase session object — must include `.id`
 * @param {object}  [params] Query params (merged with scope=user:<uuid>)
 * @param {object}  [opts]  Test-only injection. `timeoutMs` overrides the
 *                          10 000 ms default so unit tests don't wait 10s.
 * @returns {Promise<{status:number, body:object}>}
 *          - 2xx / 4xx / 5xx from HQ pass through
 *          - 504 on timeout (no retry)
 *          - 502 on network/DNS failure (after retry-once on transient fail)
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
      try { body = await res.json(); } catch (_) { /* non-JSON body — leave empty */ }
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
  // Retry ONCE on a real HQ 5xx (not on our own timeout/502).
  if (!first.timedOut && first.status >= 500 && first.status < 600) {
    await new Promise(function (r) { setTimeout(r, 500); });
    const second = await attempt();
    return { status: second.status, body: second.body };
  }
  return { status: first.status, body: first.body };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED — kept until Phase D refactors the 6 /api/sap/* endpoints.
// DO NOT use in new code. Forwards x-session-id header (old auth pattern).
// ═══════════════════════════════════════════════════════════════════════════

const _hqCache = new Map();
const HQ_CACHE_TTL_MS = 60 * 1000;

function _key(endpoint, sessionId, params) {
  return endpoint + ':' + sessionId + ':' + JSON.stringify(params || {});
}

/** @deprecated — use callHqProxy. Will be removed in Phase D cleanup. */
async function callHqApi(endpoint, sessionId, params) {
  const qs = new URLSearchParams(params || {}).toString();
  const url = _hqBase() + endpoint + (qs ? '?' + qs : '');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-session-id': sessionId,
        'Content-Type': 'application/json',
        'User-Agent': 'patrol-sap-proxy/1.0'
      },
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[hq] ' + res.status + ' ' + url + ' :: ' + body.slice(0, 200));
      return { error: 'HQ_API_ERROR', status: res.status };
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    const msg = err && err.name === 'AbortError' ? 'timeout after 15s' : (err.message || String(err));
    console.error('[hq] fetch failed: ' + msg + ' (' + url + ')');
    return { error: 'HQ_FETCH_FAILED', message: msg };
  }
}

/** @deprecated — use callHqProxy. Will be removed in Phase D cleanup. */
async function callHqApiCached(endpoint, sessionId, params) {
  const k = _key(endpoint, sessionId, params);
  const hit = _hqCache.get(k);
  if (hit && (Date.now() - hit.ts) < HQ_CACHE_TTL_MS) return hit.data;

  const data = await callHqApi(endpoint, sessionId, params);
  if (!data || !data.error) _hqCache.set(k, { data, ts: Date.now() });
  return data;
}

module.exports = { callHqProxy, callHqApi, callHqApiCached, HQ_API_BASE };

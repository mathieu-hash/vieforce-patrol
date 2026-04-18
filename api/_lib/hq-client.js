// HTTP client to the HQ Cloud Run API. Server-to-server only.
// Forwards the user's session id as x-session-id (HQ trusts this header).
// In-memory cache with 60s TTL (best-effort — no shared cache across instances).

const HQ_API_BASE = process.env.HQ_API_BASE
  || 'https://vieforce-hq-api-1057619753074.asia-southeast1.run.app';

const _hqCache = new Map();
const HQ_CACHE_TTL_MS = 60 * 1000;

function _key(endpoint, sessionId, params) {
  return endpoint + ':' + sessionId + ':' + JSON.stringify(params || {});
}

async function callHqApi(endpoint, sessionId, params) {
  const qs = new URLSearchParams(params || {}).toString();
  const url = HQ_API_BASE + endpoint + (qs ? '?' + qs : '');

  // 15s timeout via AbortController (Vercel default is 10-30s; keep tight)
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

async function callHqApiCached(endpoint, sessionId, params) {
  const k = _key(endpoint, sessionId, params);
  const hit = _hqCache.get(k);
  if (hit && (Date.now() - hit.ts) < HQ_CACHE_TTL_MS) return hit.data;

  const data = await callHqApi(endpoint, sessionId, params);
  if (!data || !data.error) _hqCache.set(k, { data, ts: Date.now() });
  return data;
}

module.exports = { callHqApi, callHqApiCached, HQ_API_BASE };

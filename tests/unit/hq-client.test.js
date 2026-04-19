// Unit tests for api/_lib/hq-client.js — callHqProxy only.
// Runs via: npm run test:unit   (Node 22+ node:test, no external deps).

const test = require('node:test');
const assert = require('node:assert/strict');
const { callHqProxy } = require('../../api/_lib/hq-client.js');

// ── fetch mock harness ──────────────────────────────────────────────────
const _origFetch = global.fetch;
function mockFetch(handler) { global.fetch = handler; }
function restoreFetch() { global.fetch = _origFetch; }

function jsonResponse(status, body) {
  return {
    status,
    json: async () => body
  };
}

const SESSION = { id: '11111111-2222-3333-4444-555555555555', role: 'dsm' };

// Pin env for deterministic URL + auth checks.
process.env.HQ_API_BASE_URL = 'https://test-hq.local';
process.env.HQ_SERVICE_TOKEN = 'test-token-abc123';

test('callHqProxy success returns body', async () => {
  const captured = { url: null, headers: null };
  mockFetch(async (url, opts) => {
    captured.url = url;
    captured.headers = opts.headers;
    return jsonResponse(200, { ok: true, scope: { is_empty: false } });
  });
  try {
    const r = await callHqProxy('/api/sales', SESSION, { period: 'MTD' });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  } finally { restoreFetch(); }
});

test('callHqProxy 5xx retries once then fails', async () => {
  let calls = 0;
  mockFetch(async () => { calls++; return jsonResponse(503, { error: 'down' }); });
  try {
    const r = await callHqProxy('/api/sales', SESSION, { period: 'MTD' });
    assert.equal(calls, 2, 'should have retried exactly once');
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'down');
  } finally { restoreFetch(); }
});

test('callHqProxy 4xx returns immediately no retry', async () => {
  let calls = 0;
  mockFetch(async () => { calls++; return jsonResponse(404, { error: 'not found' }); });
  try {
    const r = await callHqProxy('/api/sales', SESSION, { period: 'MTD' });
    assert.equal(calls, 1, 'no retry on 4xx');
    assert.equal(r.status, 404);
  } finally { restoreFetch(); }
});

test('callHqProxy timeout returns 504', async () => {
  // fetch that never resolves — only rejects when the AbortSignal fires.
  mockFetch(async (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
    });
  }));
  try {
    const r = await callHqProxy('/api/sales', SESSION, { period: 'MTD' }, { timeoutMs: 50 });
    assert.equal(r.status, 504);
    assert.equal(r.body.error, 'HQ timeout');
  } finally { restoreFetch(); }
});

test('callHqProxy timeout does NOT retry', async () => {
  let calls = 0;
  mockFetch(async (url, opts) => new Promise((resolve, reject) => {
    calls++;
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
    });
  }));
  try {
    await callHqProxy('/api/sales', SESSION, {}, { timeoutMs: 25 });
    assert.equal(calls, 1, 'timeout should not trigger retry');
  } finally { restoreFetch(); }
});

test('callHqProxy includes scope=user:<uuid> param', async () => {
  let seenUrl = null;
  mockFetch(async (url) => { seenUrl = url; return jsonResponse(200, {}); });
  try {
    await callHqProxy('/api/sales', SESSION, { period: 'MTD' });
    assert.ok(seenUrl.indexOf('scope=user%3A' + SESSION.id) !== -1
           || seenUrl.indexOf('scope=user:' + SESSION.id) !== -1,
      'URL should include scope=user:<uuid>: ' + seenUrl);
    assert.ok(seenUrl.indexOf('period=MTD') !== -1, 'URL should include period');
  } finally { restoreFetch(); }
});

test('callHqProxy sends Authorization: Bearer header', async () => {
  let seenHeaders = null;
  mockFetch(async (url, opts) => { seenHeaders = opts.headers; return jsonResponse(200, {}); });
  try {
    await callHqProxy('/api/sales', SESSION, {});
    assert.equal(seenHeaders['Authorization'], 'Bearer test-token-abc123');
    assert.equal(seenHeaders['Content-Type'], 'application/json');
    // Legacy x-session-id MUST NOT be present on new proxy calls.
    assert.equal(seenHeaders['x-session-id'], undefined);
  } finally { restoreFetch(); }
});

test('callHqProxy 401 when session has no id', async () => {
  mockFetch(async () => jsonResponse(200, {}));
  try {
    const r = await callHqProxy('/api/sales', {}, {});
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'NO_SESSION');
  } finally { restoreFetch(); }
});

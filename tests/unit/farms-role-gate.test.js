// Unit tests for /api/farms — Wave 1 (W1-ApiGates): requireUser gate.
// Audit C P0-S6: farms.js previously had no auth gate. Confirm the new
// requireUser layer rejects unauthenticated callers with 401 and lets
// authenticated callers through.
const test = require('node:test');
const assert = require('node:assert/strict');

const AUTH_PATH = require.resolve('../../api/_lib/auth.js');
const _state = { session: null, fetchHandler: null };

function installAuthMock() {
  require.cache[AUTH_PATH] = {
    id: AUTH_PATH,
    filename: AUTH_PATH,
    loaded: true,
    exports: {
      verifySession: async () => _state.session,
      unauthorized: (res) => {
        res.setHeader && res.setHeader('Content-Type', 'application/json');
        res.status(401).json({ error: 'Unauthorized' });
      }
    }
  };
}

const _origFetch = global.fetch;
function mockFetch(handler) { global.fetch = handler; }
function restoreFetch() { global.fetch = _origFetch; }

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; }
  };
}

function mockReq(opts) {
  opts = opts || {};
  return {
    method: opts.method || 'POST',
    headers: opts.headers || {},
    query: opts.query || {},
    body: opts.body
  };
}

function loadHandler() {
  delete require.cache[require.resolve('../../api/_lib/api-auth.js')];
  delete require.cache[require.resolve('../../api/farms.js')];
  return require('../../api/farms.js');
}

const TSR = {
  id: '5d710fc6-8351-439f-b0e1-c91a76719ccb',
  role: 'tsr',
  name: 'Test TSR'
};

// Ensure SERVICE_KEY is set so the handler doesn't bail with 503.
const _origServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

test('farms: rejects unauthenticated request with 401', async () => {
  installAuthMock();
  _state.session = null;
  mockFetch(async () => { throw new Error('supabase should not be called'); });
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ body: { name: 'Test Farm' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'UNAUTHORIZED');
  restoreFetch();
});

test('farms: rejects missing-name with 400 even when authed', async () => {
  installAuthMock();
  _state.session = TSR;
  mockFetch(async () => { throw new Error('supabase should not be called'); });
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ body: { name: '' } }), res);
  assert.equal(res.statusCode, 400);
  restoreFetch();
});

test('farms: authenticated POST forwards to supabase with created_by=session.id', async () => {
  installAuthMock();
  _state.session = TSR;
  let capturedPayload = null;
  let capturedUrl = null;
  mockFetch(async (url, opts) => {
    capturedUrl = url;
    capturedPayload = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ id: 'f1', name: capturedPayload.name, created_by: capturedPayload.created_by }])
    };
  });
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ body: { name: 'Farm A', heads: 100 } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(capturedPayload.created_by, TSR.id, 'created_by must come from session, not request body');
  assert.equal(capturedPayload.name, 'Farm A');
  assert.equal(capturedPayload.heads, 100);
  assert.match(capturedUrl, /\/rest\/v1\/farms/);
  restoreFetch();
});

test('farms: supabase fetch failure returns 502 (not crash)', async () => {
  installAuthMock();
  _state.session = TSR;
  mockFetch(async () => { throw new Error('network down'); });
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ body: { name: 'Farm B' } }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'SUPABASE_UNREACHABLE');
  restoreFetch();
});

test('farms: created_by cannot be spoofed by request body', async () => {
  installAuthMock();
  _state.session = TSR;
  let capturedPayload = null;
  mockFetch(async (url, opts) => {
    capturedPayload = JSON.parse(opts.body);
    return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 'f1' }]) };
  });
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ body: { name: 'Farm C', created_by: 'attacker-uuid' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(capturedPayload.created_by, TSR.id, 'created_by always overridden by session.id');
  restoreFetch();
});

test('farms: OPTIONS preflight returns 200', async () => {
  installAuthMock();
  _state.session = null;
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ method: 'OPTIONS' }), res);
  assert.equal(res.statusCode, 200);
});

test('farms: rejects non-POST/OPTIONS with 405', async () => {
  installAuthMock();
  _state.session = TSR;
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
});

// Restore env on suite end.
test('teardown', () => {
  if (_origServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = _origServiceKey;
});

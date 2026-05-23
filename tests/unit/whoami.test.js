// Unit tests for /api/whoami — now session-gated via requireUser (Wave 1).
// Previous PATROL_WHOAMI_KEY query-param gate is removed; auth IS the gate.
const test = require('node:test');
const assert = require('node:assert/strict');

const AUTH_PATH = require.resolve('../../api/_lib/auth.js');

const _state = { session: null };

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

function makeRes() {
  return {
    _status: 200,
    _json: null,
    _headers: {},
    status(s) { this._status = s; return this; },
    setHeader(k, v) { this._headers[k] = v; },
    getHeader(k) { return this._headers[k]; },
    json(b) { this._json = b; return this; }
  };
}

const USER = {
  id: '5d710fc6-8351-439f-b0e1-c91a76719ccb',
  role: 'dsm',
  name: 'Test DSM',
  region: 'Luzon',
  district: 'MM-North',
  territory: null
};

function loadWhoami() {
  // api-auth.js requires auth.js — re-load both so the mock binds.
  delete require.cache[require.resolve('../../api/_lib/api-auth.js')];
  delete require.cache[require.resolve('../../api/whoami.js')];
  return require('../../api/whoami.js');
}

test('whoami: no session returns 401', async () => {
  installAuthMock();
  _state.session = null;
  const whoami = loadWhoami();
  mockFetch(async () => { throw new Error('fetch should not run'); });
  const res = makeRes();
  await whoami({ headers: {}, query: {} }, res);
  assert.equal(res._status, 401);
  assert.equal(res._json.error, 'UNAUTHORIZED');
  restoreFetch();
});

test('whoami: valid session returns user identity + egress_ip', async () => {
  installAuthMock();
  _state.session = USER;
  const whoami = loadWhoami();
  mockFetch(async () => ({ json: async () => ({ ip: '203.0.113.9' }) }));
  const res = makeRes();
  await whoami({ headers: { 'x-session-id': USER.id }, query: {} }, res);
  assert.equal(res._status, 200);
  assert.equal(res._json.egress_ip, '203.0.113.9');
  assert.equal(res._json.user.id, USER.id);
  assert.equal(res._json.user.role, 'dsm');
  restoreFetch();
});

test('whoami: ipify failure still returns 200 with null egress_ip', async () => {
  installAuthMock();
  _state.session = USER;
  const whoami = loadWhoami();
  mockFetch(async () => { throw new Error('ipify down'); });
  const res = makeRes();
  await whoami({ headers: { 'x-session-id': USER.id }, query: {} }, res);
  assert.equal(res._status, 200);
  assert.equal(res._json.egress_ip, null);
  assert.equal(res._json.user.id, USER.id);
  restoreFetch();
});

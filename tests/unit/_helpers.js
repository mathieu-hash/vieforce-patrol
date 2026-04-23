// Shared mock harness for the api/sap/* endpoint tests.
// Pre-populates require.cache so the handler under test picks up stubbed
// verifySession + callHqProxy without any external mocking library.

const path = require('path');

const AUTH_PATH = require.resolve('../../api/_lib/auth.js');
const HQ_PATH = require.resolve('../../api/_lib/hq-client.js');

const _state = { session: null, proxy: { status: 200, body: {} }, lastCall: null };

function installMocks() {
  require.cache[AUTH_PATH] = {
    id: AUTH_PATH,
    filename: AUTH_PATH,
    loaded: true,
    exports: {
      verifySession: async () => _state.session,
      unauthorized: (res) => {
        res.setHeader('Content-Type', 'application/json');
        res.status(401).json({ error: 'Unauthorized' });
      }
    }
  };
  require.cache[HQ_PATH] = {
    id: HQ_PATH,
    filename: HQ_PATH,
    loaded: true,
    exports: {
      callHqProxy: async (hqPath, session, params) => {
        _state.lastCall = { hqPath, session, params };
        return _state.proxy;
      },
      HQ_API_BASE: 'https://test-hq.local'
    }
  };
}

function setSession(s) { _state.session = s; }
function setProxyResult(r) { _state.proxy = r; }
function getLastCall() { return _state.lastCall; }
function reset() { _state.session = null; _state.proxy = { status: 200, body: {} }; _state.lastCall = null; }

function mockRes() {
  const r = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(b) { this.body = b; return this; }
  };
  return r;
}

function mockReq(opts) {
  opts = opts || {};
  return { headers: opts.headers || {}, query: opts.query || {} };
}

// Require endpoint AFTER mocks are installed so it binds to the stubs.
function loadEndpoint(relPath) {
  const resolved = require.resolve(relPath);
  delete require.cache[resolved];
  return require(resolved);
}

module.exports = {
  installMocks, setSession, setProxyResult, getLastCall, reset,
  mockRes, mockReq, loadEndpoint
};

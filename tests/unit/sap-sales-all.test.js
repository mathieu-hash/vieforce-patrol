// Unit tests for /api/sap/sales/all — HQ proxy + reshape (no direct MSSQL).
const test = require('node:test');
const assert = require('node:assert/strict');

const AUTH_PATH = require.resolve('../../api/_lib/auth.js');
const HQ_CLIENT_PATH = require.resolve('../../api/_lib/hq-client.js');

const _captures = { hqCalls: [] };

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
  require.cache[HQ_CLIENT_PATH] = {
    id: HQ_CLIENT_PATH,
    filename: HQ_CLIENT_PATH,
    loaded: true,
    exports: {
      callHqProxy: async (hqPath, session, params) => {
        _captures.hqCalls.push({ hqPath, session, params });
        return _captures.hqResult || { status: 500, body: { error: 'unset mock' } };
      }
    }
  };
}

const _state = { session: null };

function reset() {
  _state.session = null;
  _captures.hqCalls = [];
  _captures.hqResult = undefined;
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}
function mockReq(q) { return { headers: {}, query: q || {} }; }

function load(rel) {
  const r = require.resolve(rel);
  delete require.cache[r];
  return require(rel);
}

installMocks();

const DSM = {
  id: '5d710fc6-8351-439f-b0e1-c91a76719ccb',
  role: 'dsm',
  sap_slpcode: 41,
  name: 'Test DSM'
};

test('/all: 401 when no session', async () => {
  reset();
  _state.session = null;
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 401);
});

test('/all: 502 when HQ returns upstream error', async () => {
  reset();
  _state.session = DSM;
  _captures.hqResult = { status: 503, body: { error: 'upstream' } };
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.hq_status, 503);
});

test('/all: 504 when HQ times out', async () => {
  reset();
  _state.session = DSM;
  _captures.hqResult = { status: 504, body: { error: 'HQ timeout' } };
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 504);
  assert.match(res.body.message, /timeout/i);
});

test('/all: reshapes HQ body + calls callHqProxy with include', async () => {
  reset();
  _state.session = DSM;
  _captures.hqResult = {
    status: 200,
    body: {
      scope: { is_empty: false, district_label: 'Cebu South', name: 'Test DSM' },
      kpis: { volume_bags: 2480 },
      by_brand: [
        { brand: 'ViePro', volume_bags: 900 },
        { brand: 'Other', volume_bags: 100 },
        { brand: 'x', volume_bags: 1 },
        { brand: 'y', volume_bags: 1 },
        { brand: 'z', volume_bags: 1 },
        { brand: 'drop', volume_bags: 999 }
      ],
      top_customers: [
        { customer_code: 'CA000001', customer_name: 'PACIFICA', volume_bags: 1012 }
      ],
      whitespace: [{ cardcode: 'CA1', name: 'WS', phone: '09' }],
      at_risk: [{
        cardcode: 'CA2',
        name: 'AR',
        last_date: '2026-01-01',
        days_since_last_order: 116,
        tier: 'at_risk'
      }]
    }
  };
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq({ period: 'YTD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(_captures.hqCalls.length, 1);
  assert.equal(_captures.hqCalls[0].hqPath, '/api/sales');
  assert.equal(_captures.hqCalls[0].params.period, 'YTD');
  assert.equal(_captures.hqCalls[0].params.include, 'whitespace,at_risk');

  assert.equal(res.body.kpis.bags, 2480);
  assert.equal(res.body.by_brand.length, 5);
  assert.equal(res.body.by_brand[0].name, 'ViePro');
  assert.equal(res.body.by_customer[0].cardcode, 'CA000001');
  assert.equal(res.body.whitespace[0].name, 'WS');
  assert.equal(res.body.at_risk[0].tier, 'at_risk');

  assert.equal(res.body.patrol_meta.period, 'YTD');
  assert.equal(res.body.patrol_meta.hq_scope && res.body.patrol_meta.hq_scope.district_label, 'Cebu South');
});

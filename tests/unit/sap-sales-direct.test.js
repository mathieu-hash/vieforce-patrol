// Unit tests for the direct-SAP sales endpoints (by-customer, whitespace, at-risk).
// Mocks verifySession + sap-mssql so handlers can be exercised without real SAP.

const test = require('node:test');
const assert = require('node:assert/strict');

const AUTH_PATH = require.resolve('../../api/_lib/auth.js');
const SAP_PATH = require.resolve('../../api/_lib/sap-mssql.js');

const _state = { session: null, rows: [], throwErr: null, lastSql: null, lastParams: null };

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
  require.cache[SAP_PATH] = {
    id: SAP_PATH,
    filename: SAP_PATH,
    loaded: true,
    exports: {
      querySelect: async (sqlText, params) => {
        _state.lastSql = sqlText;
        _state.lastParams = params;
        if (_state.throwErr) throw _state.throwErr;
        return _state.rows;
      },
      sql: { Int: 'Int' }
    }
  };
}

function setSession(s) { _state.session = s; }
function setRows(rows) { _state.rows = rows || []; }
function setError(e) { _state.throwErr = e; }
function reset() {
  _state.session = null;
  _state.rows = [];
  _state.throwErr = null;
  _state.lastSql = null;
  _state.lastParams = null;
}
function lastSql() { return _state.lastSql; }
function lastParams() { return _state.lastParams; }

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

const DSM = { id: '5d710fc6-8351-439f-b0e1-c91a76719ccb', role: 'dsm', sap_slpcode: 41 };
const DSM_NO_SLP = { id: 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', role: 'dsm', sap_slpcode: null };

// ---------- by-customer ----------
test('by-customer: 401 with no session', async () => {
  reset();
  setSession(null);
  const handler = load('../../api/sap/sales/by-customer.js');
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 401);
});

test('by-customer: empty when user has no slpcode', async () => {
  reset();
  setSession(DSM_NO_SLP);
  const handler = load('../../api/sap/sales/by-customer.js');
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.patrol_meta.is_empty, true);
  assert.deepEqual(res.body.by_customer, []);
});

test('by-customer: maps rows + parameterizes slpCode', async () => {
  reset();
  setSession(DSM);
  setRows([
    { CardCode: 'CA000001', CardName: 'PACIFICA', bags: '1012' },
    { CardCode: 'CA000002', CardName: 'MJ', bags: 717 }
  ]);
  const handler = load('../../api/sap/sales/by-customer.js');
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.by_customer.length, 2);
  assert.equal(res.body.by_customer[0].cardcode, 'CA000001');
  assert.equal(res.body.by_customer[0].bags, 1012);
  const params = lastParams();
  const slp = params.find((p) => p.name === 'slpCode');
  assert.equal(slp.value, 41);
});

test('by-customer: 502 on SAP failure', async () => {
  reset();
  setSession(DSM);
  setError(new Error('connection refused'));
  const handler = load('../../api/sap/sales/by-customer.js');
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 502);
});

// ---------- whitespace ----------
test('whitespace: empty when no slpcode', async () => {
  reset();
  setSession(DSM_NO_SLP);
  const handler = load('../../api/sap/sales/whitespace.js');
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.whitespace, []);
});

test('whitespace: maps phone null safely', async () => {
  reset();
  setSession(DSM);
  setRows([
    { CardCode: 'CA000182', CardName: 'ENGGI & CHOWI', Phone1: null },
    { CardCode: 'CA000832', CardName: 'SOUTH AGRIVET', Phone1: '0917...' }
  ]);
  const handler = load('../../api/sap/sales/whitespace.js');
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.body.whitespace[0].phone, null);
  assert.equal(res.body.whitespace[1].phone, '0917...');
});

// ---------- at-risk ----------
test('at-risk: tiers + handles no-history', async () => {
  reset();
  setSession(DSM);
  setRows([
    { CardCode: 'CA1', CardName: 'A', last_date: null, days_since: null },
    { CardCode: 'CA2', CardName: 'B', last_date: '2026-01-01', days_since: 116 },
    { CardCode: 'CA3', CardName: 'C', last_date: '2026-04-01', days_since: 26 }
  ]);
  const handler = load('../../api/sap/sales/at-risk.js');
  const res = mockRes();
  await handler(mockReq(), res);
  const arr = res.body.at_risk;
  assert.equal(arr[0].tier, 'no_history');
  assert.equal(arr[1].tier, 'at_risk');
  assert.equal(arr[2].tier, 'slowing');
  assert.equal(arr[1].last_date, '2026-01-01');
});

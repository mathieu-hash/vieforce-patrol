// Unit tests for the combined /api/sap/sales/all endpoint.
// Mocks verifySession + sap-mssql so handler can be exercised without real SAP.
// `querySelect` returns from a queue (one entry per Promise.all branch) so we
// can verify each section maps correctly.

const test = require('node:test');
const assert = require('node:assert/strict');

const AUTH_PATH = require.resolve('../../api/_lib/auth.js');
const SAP_PATH = require.resolve('../../api/_lib/sap-mssql.js');

const _state = {
  session: null,
  queue: [],          // FIFO of result rows (one per querySelect call)
  throwErr: null,
  calls: []           // captured { sql, params } per call
};

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
        _state.calls.push({ sql: sqlText, params });
        if (_state.throwErr) throw _state.throwErr;
        return _state.queue.shift() || [];
      },
      sql: { Int: 'Int' }
    }
  };
}

function setSession(s) { _state.session = s; }
function setQueue(arr) { _state.queue = arr.slice(); }
function setError(e) { _state.throwErr = e; }
function reset() {
  _state.session = null;
  _state.queue = [];
  _state.throwErr = null;
  _state.calls = [];
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

const DSM = { id: '5d710fc6-8351-439f-b0e1-c91a76719ccb', role: 'dsm', sap_slpcode: 41 };
const DSM_NO_SLP = { id: 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', role: 'dsm', sap_slpcode: null };

test('/all: 401 when no session', async () => {
  reset();
  setSession(null);
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 401);
});

test('/all: empty zero-state when user has no slpcode (no SAP calls)', async () => {
  reset();
  setSession(DSM_NO_SLP);
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.patrol_meta.is_empty, true);
  assert.deepEqual(res.body.kpis, { bags: 0 });
  assert.deepEqual(res.body.by_brand, []);
  assert.deepEqual(res.body.by_customer, []);
  assert.deepEqual(res.body.whitespace, []);
  assert.deepEqual(res.body.at_risk, []);
  assert.equal(_state.calls.length, 0, 'no SAP calls should be made when out-of-scope');
});

test('/all: maps all 5 query result sets in declared order', async () => {
  reset();
  setSession(DSM);
  // Order matches Promise.all in api/sap/sales/all.js:
  // 1) totalBagsSql, 2) byBrandSql, 3) byCustomerSql, 4) whitespaceSql, 5) atRiskSql
  setQueue([
    [{ total_bags: '2480' }],
    [{ brand: 'ViePro', bags: '900' }, { brand: '(no brand)', bags: '120' }],
    [{ CardCode: 'CA000001', CardName: 'PACIFICA', bags: 1012 }],
    [{ CardCode: 'CA000182', CardName: 'ENGGI & CHOWI', Phone1: null }],
    [{ CardCode: 'CA000346', CardName: 'MJ', last_date: '2026-01-01', days_since: 116 }]
  ]);
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);

  assert.equal(res.body.kpis.bags, 2480);

  assert.equal(res.body.by_brand.length, 2);
  assert.equal(res.body.by_brand[0].name, 'ViePro');
  assert.equal(res.body.by_brand[0].bags, 900);
  assert.equal(res.body.by_brand[1].name, '(no brand)');

  assert.equal(res.body.by_customer.length, 1);
  assert.equal(res.body.by_customer[0].cardcode, 'CA000001');

  assert.equal(res.body.whitespace[0].phone, null);

  assert.equal(res.body.at_risk[0].tier, 'at_risk');
  assert.equal(res.body.at_risk[0].days_since_last_order, 116);
  assert.equal(res.body.at_risk[0].last_date, '2026-01-01');

  // Sanity: 5 SAP calls fired, each with @slpCode = 41
  assert.equal(_state.calls.length, 5);
  for (const c of _state.calls) {
    const slp = c.params.find((p) => p.name === 'slpCode');
    assert.equal(slp.value, 41);
  }
});

test('/all: 502 with friendly message on connection failure', async () => {
  reset();
  setSession(DSM);
  setError(new Error('Failed to connect to analytics.vienovo.ph:4444 in 15000ms'));
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'SAP_UNAVAILABLE');
  assert.match(res.body.message, /SAP server unreachable/i);
  assert.match(res.body.detail, /Failed to connect/);
});

test('/all: 502 with generic message on non-connection failure', async () => {
  reset();
  setSession(DSM);
  setError(new Error('Login failed for user'));
  const handler = load('../../api/sap/sales/all.js');
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'SAP_UNAVAILABLE');
  assert.match(res.body.message, /SAP query failed/i);
});

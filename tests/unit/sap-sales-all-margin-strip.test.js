// Unit test for /api/sap/sales/all margin stripping — Wave 1 (Audit C P0-S5).
//
// The endpoint previously imported wrapPatrolMeta but NOT stripMarginsIfNeeded,
// so HQ-emitted margin keys on `scope`, `whitespace[]`, `at_risk[]`, or any
// nested rollup could leak to the browser. This test asserts every margin key
// listed in MARGIN_KEYS is deleted from the final response payload regardless
// of where HQ placed it.
const test = require('node:test');
const assert = require('node:assert/strict');

const AUTH_PATH = require.resolve('../../api/_lib/auth.js');
const HQ_CLIENT_PATH = require.resolve('../../api/_lib/hq-client.js');
const { MARGIN_KEYS } = require('../../api/_lib/scope.js');

const _state = { session: null, hqResult: null };

function installMocks() {
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
  require.cache[HQ_CLIENT_PATH] = {
    id: HQ_CLIENT_PATH,
    filename: HQ_CLIENT_PATH,
    loaded: true,
    exports: {
      callHqProxy: async () => _state.hqResult,
      HQ_API_BASE: 'https://test-hq.local'
    }
  };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}
function mockReq(q) { return { headers: {}, query: q || {} }; }

function loadHandler() {
  delete require.cache[require.resolve('../../api/_lib/api-auth.js')];
  delete require.cache[require.resolve('../../api/sap/sales/all.js')];
  return require('../../api/sap/sales/all.js');
}

const DSM = {
  id: '5d710fc6-8351-439f-b0e1-c91a76719ccb',
  role: 'dsm',
  name: 'Test DSM'
};
const EXEC = { id: 'b3bb7fc6-8e8d-4529-9166-db11b2c78b61', role: 'exec', name: 'Test EXEC' };

test('/sales/all: strips margin keys from kpis (when HQ emits them)', async () => {
  installMocks();
  _state.session = DSM;
  _state.hqResult = {
    status: 200,
    body: {
      kpis: {
        volume_bags: 2480,
        gross_profit: 99000,
        gm_ton: 6500,
        gross_margin: 0.3
      },
      by_brand: [],
      top_customers: [],
      whitespace: [],
      at_risk: [],
      scope: { is_empty: false }
    }
  };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  // kpis becomes { bags: ... } after reshape — margin keys never made it through.
  assert.equal(res.body.kpis.bags, 2480);
  assert.equal('gross_profit' in res.body.kpis, false);
  assert.equal('gm_ton' in res.body.kpis, false);
});

test('/sales/all: strips margin keys from by_brand reshape', async () => {
  installMocks();
  _state.session = DSM;
  _state.hqResult = {
    status: 200,
    body: {
      kpis: { volume_bags: 100 },
      by_brand: [
        { brand: 'ViePro', volume_bags: 50, gm_per_bag: 12, gross_margin: 0.4 }
      ],
      top_customers: [],
      whitespace: [],
      at_risk: [],
      scope: { is_empty: false }
    }
  };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.by_brand[0].name, 'ViePro');
  assert.equal('gm_per_bag' in res.body.by_brand[0], false);
  assert.equal('gross_margin' in res.body.by_brand[0], false);
});

test('/sales/all: strips margin keys from whitespace[] (forwarded-through array)', async () => {
  installMocks();
  _state.session = DSM;
  _state.hqResult = {
    status: 200,
    body: {
      kpis: { volume_bags: 0 },
      by_brand: [],
      top_customers: [],
      whitespace: [
        { cardcode: 'C1', name: 'WS Customer', phone: '09', gross_profit: 500, gm_ton: 100 }
      ],
      at_risk: [],
      scope: { is_empty: false }
    }
  };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.whitespace[0].cardcode, 'C1');
  assert.equal('gross_profit' in res.body.whitespace[0], false);
  assert.equal('gm_ton' in res.body.whitespace[0], false);
});

test('/sales/all: strips margin keys from at_risk[] (forwarded-through array)', async () => {
  installMocks();
  _state.session = DSM;
  _state.hqResult = {
    status: 200,
    body: {
      kpis: { volume_bags: 0 },
      by_brand: [],
      top_customers: [],
      whitespace: [],
      at_risk: [
        { cardcode: 'C2', name: 'AR Customer', last_date: '2026-01-01', tier: 'at_risk', gp: 1000, margin_pct: 0.25 }
      ],
      scope: { is_empty: false }
    }
  };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.at_risk[0].cardcode, 'C2');
  assert.equal('gp' in res.body.at_risk[0], false);
  assert.equal('margin_pct' in res.body.at_risk[0], false);
});

test('/sales/all: even exec role gets margin stripped (no role bypass on Patrol)', async () => {
  installMocks();
  _state.session = EXEC;
  _state.hqResult = {
    status: 200,
    body: {
      kpis: { volume_bags: 9999, gross_profit: 50000 },
      by_brand: [{ brand: 'ViePro', volume_bags: 100, ytd_gm_ton: 6000 }],
      top_customers: [],
      whitespace: [],
      at_risk: [],
      scope: { is_empty: false }
    }
  };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal('gross_profit' in res.body.kpis, false, 'exec still gets margins stripped');
  assert.equal('ytd_gm_ton' in res.body.by_brand[0], false, 'exec by_brand still stripped');
});

test('/sales/all: full MARGIN_KEYS coverage — none survive in deep payload', async () => {
  installMocks();
  _state.session = DSM;
  // Build a polluted scope object containing every known margin key.
  const polluted = {};
  for (const k of MARGIN_KEYS) polluted[k] = 999;
  polluted.is_empty = false;
  polluted.role = 'dsm';
  _state.hqResult = {
    status: 200,
    body: {
      kpis: { volume_bags: 1 },
      by_brand: [],
      top_customers: [],
      whitespace: [],
      at_risk: [],
      scope: polluted
    }
  };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 200);
  const scope = res.body.scope || (res.body.patrol_meta && res.body.patrol_meta.hq_scope) || {};
  for (const k of MARGIN_KEYS) {
    assert.equal(k in scope, false, 'margin key "' + k + '" must be stripped from scope');
  }
  // Non-margin scope fields preserved.
  assert.equal(scope.is_empty, false);
  assert.equal(scope.role, 'dsm');
});

test('/sales/all: rejects unauthenticated with 401', async () => {
  installMocks();
  _state.session = null;
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 401);
});

test('/sales/all: rejects TSR role with 403 (not in SAP_ROLES allowlist)', async () => {
  installMocks();
  _state.session = { id: 'tsr-uuid', role: 'tsr', name: 'Test TSR' };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq({ period: 'MTD' }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'FORBIDDEN');
});

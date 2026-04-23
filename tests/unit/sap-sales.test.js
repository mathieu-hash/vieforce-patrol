// Unit tests for api/sap/sales.js — Phase D refactored endpoint.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

H.installMocks();
const handler = H.loadEndpoint('../../api/sap/sales.js');

const DSM = { id: '5d710fc6-8351-439f-b0e1-c91a76719ccb', role: 'dsm' };
const EXEC = { id: 'b3bb7fc6-8e8d-4529-9166-db11b2c78b61', role: 'exec' };

test('returns 200 with patrol_meta wrapper on HQ success', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 200, body: { kpis: { volume_mt: 100 }, scope: { is_empty: false, role: 'dsm' } } });
  const req = H.mockReq({ query: { period: 'MTD' } });
  const res = H.mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.patrol_meta, 'patrol_meta present');
  assert.equal(res.body.patrol_meta.user_id, DSM.id);
  assert.equal(res.body.patrol_meta.role, 'dsm');
  assert.equal(res.body.patrol_meta.period, 'MTD');
  assert.equal(res.body.kpis.volume_mt, 100);
  assert.equal(H.getLastCall().hqPath, '/api/sales');
  assert.equal(H.getLastCall().params.period, 'MTD');
});

test('defaults period to MTD when missing', async () => {
  H.reset();
  H.setSession(EXEC);
  H.setProxyResult({ status: 200, body: {} });
  await handler(H.mockReq(), H.mockRes());
  assert.equal(H.getLastCall().params.period, 'MTD');
});

test('returns 502 on HQ 500', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 500, body: { error: 'boom' } });
  const res = H.mockRes();
  await handler(H.mockReq({ query: { period: 'MTD' } }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.hq_status, 500);
});

test('returns 504 on HQ timeout', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 504, body: { error: 'HQ timeout' } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 504);
  assert.equal(res.body.error, 'HQ timeout');
});

test('strips margins for dsm', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({
    status: 200,
    body: {
      kpis: { volume_mt: 100, gross_profit: 5000, gm_ton: 6500 },
      by_brand: [{ name: 'ViePro', gross_margin: 0.3 }],
      scope: { is_empty: false }
    }
  });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal('gross_profit' in res.body.kpis, false);
  assert.equal('gm_ton' in res.body.kpis, false);
  assert.equal('gross_margin' in res.body.by_brand[0], false);
  assert.equal(res.body.kpis.volume_mt, 100);
});

test('preserves margins for exec', async () => {
  H.reset();
  H.setSession(EXEC);
  H.setProxyResult({
    status: 200,
    body: { kpis: { volume_mt: 100, gross_profit: 5000, gm_ton: 6500 } }
  });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.body.kpis.gross_profit, 5000);
  assert.equal(res.body.kpis.gm_ton, 6500);
});

test('returns 401 when no session', async () => {
  H.reset();
  H.setSession(null);
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 401);
});

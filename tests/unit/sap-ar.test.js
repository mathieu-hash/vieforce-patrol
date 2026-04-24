// Unit tests for api/sap/ar.js — Phase D refactored endpoint.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

H.installMocks();
const handler = H.loadEndpoint('../../api/sap/ar.js');

const DSM = { id: '5d710fc6-8351-439f-b0e1-c91a76719ccb', role: 'dsm' };
const EXEC = { id: 'b3bb7fc6-8e8d-4529-9166-db11b2c78b61', role: 'exec' };

test('returns 200 with patrol_meta wrapper on HQ success', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 200, body: { customers: [], aging_buckets: {}, scope: { is_empty: false } } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.patrol_meta);
  assert.equal(res.body.patrol_meta.user_id, DSM.id);
  assert.equal(H.getLastCall().hqPath, '/api/ar');
});

test('forwards no extra params (ar has no whitelist)', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 200, body: {} });
  await handler(H.mockReq({ query: { foo: 'bar' } }), H.mockRes());
  assert.deepEqual(H.getLastCall().params, {});
});

test('returns 502 on HQ 500', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 500, body: { error: 'boom' } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
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
});

test('strips margins for dsm', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({
    status: 200,
    body: {
      customers: [{ CardCode: 'C1', balance: 1000, gross_profit: 300 }],
      aging_buckets: { current: { total: 500, margin_pct: 0.2 } }
    }
  });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal('gross_profit' in res.body.customers[0], false);
  assert.equal('margin_pct' in res.body.aging_buckets.current, false);
  assert.equal(res.body.customers[0].balance, 1000);
});

test('strips margins even for exec (no role bypass on Patrol)', async () => {
  H.reset();
  H.setSession(EXEC);
  H.setProxyResult({ status: 200, body: { customers: [{ CardCode: 'C1', gross_profit: 300 }] } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal('gross_profit' in res.body.customers[0], false, 'exec role still gets margins stripped');
  assert.equal(res.body.customers[0].CardCode, 'C1', 'non-margin fields preserved');
});

test('returns 401 when no session', async () => {
  H.reset();
  H.setSession(null);
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 401);
});

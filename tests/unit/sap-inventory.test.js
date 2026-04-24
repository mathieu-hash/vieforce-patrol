// Unit tests for api/sap/inventory.js — Phase D refactored endpoint.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

H.installMocks();
const handler = H.loadEndpoint('../../api/sap/inventory.js');

const DSM = { id: '5d710fc6-8351-439f-b0e1-c91a76719ccb', role: 'dsm' };
const EXEC = { id: 'b3bb7fc6-8e8d-4529-9166-db11b2c78b61', role: 'exec' };

test('returns 200 with patrol_meta wrapper on HQ success', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 200, body: { items: [], scope: { is_empty: false } } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.patrol_meta);
  assert.equal(H.getLastCall().hqPath, '/api/inventory');
});

test('defaults plant to ALL', async () => {
  H.reset();
  H.setSession(EXEC);
  H.setProxyResult({ status: 200, body: {} });
  await handler(H.mockReq(), H.mockRes());
  assert.equal(H.getLastCall().params.plant, 'ALL');
});

test('forwards plant when provided', async () => {
  H.reset();
  H.setSession(EXEC);
  H.setProxyResult({ status: 200, body: {} });
  await handler(H.mockReq({ query: { plant: 'CEBU' } }), H.mockRes());
  assert.equal(H.getLastCall().params.plant, 'CEBU');
});

test('returns 502 on HQ 500', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 500, body: { error: 'boom' } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 502);
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
    body: { items: [{ sku: 'SKU1', qty: 500, unit_cost: 100, gp: 25 }] }
  });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal('unit_cost' in res.body.items[0], false);
  assert.equal('gp' in res.body.items[0], false);
  assert.equal(res.body.items[0].qty, 500);
});

test('strips margins even for exec (no role bypass on Patrol)', async () => {
  H.reset();
  H.setSession(EXEC);
  H.setProxyResult({ status: 200, body: { items: [{ sku: 'SKU1', unit_cost: 100 }] } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal('unit_cost' in res.body.items[0], false, 'exec role still gets margins stripped');
  assert.equal(res.body.items[0].sku, 'SKU1', 'non-margin fields preserved');
});

test('returns 401 when no session', async () => {
  H.reset();
  H.setSession(null);
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 401);
});

// Unit tests for api/sap/customer/[cardcode].js — Phase D refactored endpoint.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

H.installMocks();
const handler = H.loadEndpoint('../../api/_lib/sap-proxy.js').customer;

const DSM = { id: '5d710fc6-8351-439f-b0e1-c91a76719ccb', role: 'dsm' };
const EXEC = { id: 'b3bb7fc6-8e8d-4529-9166-db11b2c78b61', role: 'exec' };

test('returns 200 with patrol_meta wrapper on HQ success', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({
    status: 200,
    body: { customer: { CardCode: 'C00001', name: 'Acme' }, scope: { is_empty: false } }
  });
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'C00001' } }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.patrol_meta);
  assert.equal(H.getLastCall().hqPath, '/api/customer');
  assert.equal(H.getLastCall().params.id, 'C00001', 'passes cardcode as params.id');
});

test('returns 400 on missing cardcode', async () => {
  H.reset();
  H.setSession(DSM);
  const res = H.mockRes();
  await handler(H.mockReq({ query: {} }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'BAD_CARDCODE');
});

test('returns 400 on oversized cardcode', async () => {
  H.reset();
  H.setSession(DSM);
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'X'.repeat(65) } }), res);
  assert.equal(res.statusCode, 400);
});

test('returns 403 when HQ says OUT_OF_SCOPE', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 403, body: { error: 'OUT_OF_SCOPE' } });
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'C00001' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'OUT_OF_SCOPE');
});

test('returns 404 when HQ says not found', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 404, body: { error: 'NOT_FOUND' } });
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'MISSING' } }), res);
  assert.equal(res.statusCode, 404);
});

test('returns 502 on HQ 500', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 500, body: { error: 'boom' } });
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'C00001' } }), res);
  assert.equal(res.statusCode, 502);
});

test('returns 504 on HQ timeout', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 504, body: { error: 'HQ timeout' } });
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'C00001' } }), res);
  assert.equal(res.statusCode, 504);
});

test('strips margins for dsm', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({
    status: 200,
    body: { customer: { CardCode: 'C1', balance: 1000, gross_profit: 400, ytd_gm_ton: 3500 } }
  });
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'C1' } }), res);
  assert.equal('gross_profit' in res.body.customer, false);
  assert.equal('ytd_gm_ton' in res.body.customer, false);
  assert.equal(res.body.customer.balance, 1000);
});

test('strips margins even for exec (no role bypass on Patrol)', async () => {
  H.reset();
  H.setSession(EXEC);
  H.setProxyResult({ status: 200, body: { customer: { CardCode: 'C1', gross_profit: 400 } } });
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'C1' } }), res);
  assert.equal('gross_profit' in res.body.customer, false, 'exec role still gets margins stripped');
  assert.equal(res.body.customer.CardCode, 'C1', 'non-margin fields preserved');
});

test('returns 401 when no session', async () => {
  H.reset();
  H.setSession(null);
  const res = H.mockRes();
  await handler(H.mockReq({ query: { cardcode: 'C1' } }), res);
  assert.equal(res.statusCode, 401);
});

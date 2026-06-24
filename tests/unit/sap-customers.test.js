// Unit tests for api/sap/customers.js — Phase D refactored endpoint.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_helpers');

H.installMocks();
const handler = H.loadEndpoint('../../api/_lib/sap-proxy.js').customers;

const DSM = { id: '5d710fc6-8351-439f-b0e1-c91a76719ccb', role: 'dsm' };
const EXEC = { id: 'b3bb7fc6-8e8d-4529-9166-db11b2c78b61', role: 'exec' };

test('returns 200 with patrol_meta wrapper on HQ success', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 200, body: { customers: [], scope: { is_empty: false } } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.patrol_meta);
  assert.equal(H.getLastCall().hqPath, '/api/customers');
});

test('whitelists + defaults params (page=1, limit=50)', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 200, body: {} });
  await handler(H.mockReq({ query: { foo: 'ignored' } }), H.mockRes());
  const p = H.getLastCall().params;
  assert.equal(p.page, 1);
  assert.equal(p.limit, 50);
  assert.equal(p.foo, undefined, 'unlisted param should not be forwarded');
});

test('clamps limit to max 200', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 200, body: {} });
  await handler(H.mockReq({ query: { limit: '9999' } }), H.mockRes());
  assert.equal(H.getLastCall().params.limit, 200);
});

test('forwards search, region, sort', async () => {
  H.reset();
  H.setSession(DSM);
  H.setProxyResult({ status: 200, body: {} });
  await handler(H.mockReq({ query: { search: 'acme', region: 'LUZON', sort: 'ytd_sales_desc' } }), H.mockRes());
  const p = H.getLastCall().params;
  assert.equal(p.search, 'acme');
  assert.equal(p.region, 'LUZON');
  assert.equal(p.sort, 'ytd_sales_desc');
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
    body: { customers: [{ CardCode: 'C1', ytd_revenue: 100000, ytd_gm_ton: 5000, gross_profit: 20000 }] }
  });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal('ytd_gm_ton' in res.body.customers[0], false);
  assert.equal('gross_profit' in res.body.customers[0], false);
  assert.equal(res.body.customers[0].ytd_revenue, 100000);
});

test('strips margins even for exec (no role bypass on Patrol)', async () => {
  H.reset();
  H.setSession(EXEC);
  H.setProxyResult({ status: 200, body: { customers: [{ CardCode: 'C1', ytd_gm_ton: 5000 }] } });
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal('ytd_gm_ton' in res.body.customers[0], false, 'exec role still gets margins stripped');
  assert.equal(res.body.customers[0].CardCode, 'C1', 'non-margin fields preserved');
});

test('returns 401 when no session', async () => {
  H.reset();
  H.setSession(null);
  const res = H.mockRes();
  await handler(H.mockReq(), res);
  assert.equal(res.statusCode, 401);
});

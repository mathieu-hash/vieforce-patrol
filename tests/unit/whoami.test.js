const test = require('node:test');
const assert = require('node:assert/strict');

const _origFetch = global.fetch;
function mockFetch(handler) {
  global.fetch = handler;
}
function restoreFetch() {
  global.fetch = _origFetch;
}

function makeRes() {
  const res = {
    _status: 200,
    _json: null,
    status(s) {
      this._status = s;
      return this;
    },
    setHeader() {},
    json(b) {
      this._json = b;
    }
  };
  return res;
}

test('whoami: production without gate key returns 404', async () => {
  delete require.cache[require.resolve('../../api/whoami.js')];
  const whoami = require('../../api/whoami.js');
  const prevVercel = process.env.VERCEL_ENV;
  const prevKey = process.env.PATROL_WHOAMI_KEY;
  const prevWho = process.env.WHOAMI_KEY;
  process.env.VERCEL_ENV = 'production';
  delete process.env.PATROL_WHOAMI_KEY;
  delete process.env.WHOAMI_KEY;
  mockFetch(async () => {
    throw new Error('fetch should not run');
  });
  const res = makeRes();
  await whoami({ query: {} }, res);
  assert.equal(res._status, 404);
  assert.equal(res._json.error, 'Not found');
  process.env.VERCEL_ENV = prevVercel;
  if (prevKey === undefined) delete process.env.PATROL_WHOAMI_KEY;
  else process.env.PATROL_WHOAMI_KEY = prevKey;
  if (prevWho === undefined) delete process.env.WHOAMI_KEY;
  else process.env.WHOAMI_KEY = prevWho;
  restoreFetch();
});

test('whoami: production wrong key returns 404', async () => {
  delete require.cache[require.resolve('../../api/whoami.js')];
  const whoami = require('../../api/whoami.js');
  const prevVercel = process.env.VERCEL_ENV;
  const prevKey = process.env.PATROL_WHOAMI_KEY;
  process.env.VERCEL_ENV = 'production';
  process.env.PATROL_WHOAMI_KEY = 'sekrit';
  mockFetch(async () => {
    throw new Error('fetch should not run');
  });
  const res = makeRes();
  await whoami({ query: { key: 'nope' } }, res);
  assert.equal(res._status, 404);
  process.env.VERCEL_ENV = prevVercel;
  if (prevKey === undefined) delete process.env.PATROL_WHOAMI_KEY;
  else process.env.PATROL_WHOAMI_KEY = prevKey;
  restoreFetch();
});

test('whoami: non-production returns egress_ip from ipify', async () => {
  delete require.cache[require.resolve('../../api/whoami.js')];
  const whoami = require('../../api/whoami.js');
  const prevVercel = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  mockFetch(async () => ({ json: async () => ({ ip: '203.0.113.9' }) }));
  const res = makeRes();
  await whoami({ query: {} }, res);
  assert.equal(res._status, 200);
  assert.equal(res._json.egress_ip, '203.0.113.9');
  if (prevVercel === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = prevVercel;
  restoreFetch();
});

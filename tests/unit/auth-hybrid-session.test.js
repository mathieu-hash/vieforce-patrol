// Unit tests for api/_lib/auth.js — HYBRID auth, x-session-id branch.
//
// auth-jwt.test.js already covers the Bearer JWT path. R6 audit
// (_audit/HARDENING/R6_EXECUTIVE_REVIEW.md:81) flagged the legacy
// x-session-id branch (auth.js:191-224) as uncovered. This file closes
// that gap.
//
// Branch under test (post-W1.4 rollback 2026-05-24):
//   requireUser({ headers: { 'x-session-id': UUID } })
//     → service-role REST lookup → patrol user object (cached 5s)
//   requireUser({ headers: { 'x-session-id': 'not-a-uuid' } })
//     → falls through to JWT branch → no Bearer header → 401
//   requireUser({ headers: {} })
//     → 401 'Missing x-session-id or Authorization'

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

function loadAuth() {
  const p = require.resolve('../../api/_lib/auth.js');
  delete require.cache[p];
  return require(p);
}

const UUID_VALID = '11111111-2222-3333-4444-555555555555';
const UUID_NONEXISTENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UUID_INACTIVE = '99999999-8888-7777-6666-555555555555';

const PATROL_USER_ROW = {
  id: UUID_VALID,
  role: 'tsr',
  region: 'LUZON',
  district: 'Cavite',
  territory: 'Tagaytay',
  name: 'Jane Test',
  email: null,
  is_active: true,
  language: 'tl',
  sap_slpcode: null,
  sap_district_code: null,
  district_label: null
};

const _origFetch = global.fetch;
function installFetch(handler) { global.fetch = handler; }
function restoreFetch() { global.fetch = _origFetch; }

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function makeReq(headers) {
  return { headers: headers || {} };
}

// ─────────────────────────────────────────────────────────────────────────
test('requireUser: valid x-session-id UUID returns patrol user via service-role lookup', async () => {
  const auth = loadAuth();
  let fetchedUrl = null;
  let fetchedHeaders = null;
  installFetch(async (url, opts) => {
    fetchedUrl = String(url);
    fetchedHeaders = opts && opts.headers;
    if (fetchedUrl.includes('/rest/v1/users')) {
      return jsonResponse(200, [PATROL_USER_ROW]);
    }
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    const user = await auth.requireUser(makeReq({ 'x-session-id': UUID_VALID }));
    assert.equal(user.id, UUID_VALID);
    assert.equal(user.user_id, UUID_VALID);
    assert.equal(user.role, 'tsr');
    assert.equal(user.name, 'Jane Test');
    assert.equal(user.is_active, true);
    // The lookup must hit the REST users endpoint with the UUID filter.
    assert.match(fetchedUrl, /\/rest\/v1\/users\?id=eq\./);
    assert.match(fetchedUrl, new RegExp(UUID_VALID));
    // Service-role auth is used (bypasses RLS — the W1.6b users base table
    // SELECT-revoke means anon-key lookups would now return empty).
    assert.equal(fetchedHeaders.apikey, 'service-role-test-key');
    assert.match(String(fetchedHeaders.Authorization), /^Bearer service-role-test-key$/);
  } finally {
    restoreFetch();
  }
});

test('requireUser: non-UUID x-session-id falls through to JWT branch (no Bearer → 401)', async () => {
  // The auth module only treats x-session-id as a session token when it
  // matches UUID_RE. A garbage value should NOT trigger the service-role
  // REST lookup; it should drop through to _bearerToken, find nothing,
  // and 401 with 'Missing x-session-id or Authorization'.
  const auth = loadAuth();
  installFetch(async () => {
    throw new Error('fetch should not be called when x-session-id is not a UUID');
  });

  try {
    await auth.requireUser(makeReq({ 'x-session-id': 'not-a-uuid' }));
    assert.fail('expected requireUser to throw');
  } catch (e) {
    assert.ok(e instanceof auth.AuthError, 'expected AuthError');
    assert.equal(e.status, 401);
    assert.match(e.message, /Missing x-session-id or Authorization/);
  } finally {
    restoreFetch();
  }
});

test('requireUser: x-session-id UUID with no matching patrol user throws 401 Invalid or inactive session', async () => {
  const auth = loadAuth();
  installFetch(async (url) => {
    if (String(url).includes('/rest/v1/users')) {
      // Lookup returns empty array — no row matches.
      return jsonResponse(200, []);
    }
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    await auth.requireUser(makeReq({ 'x-session-id': UUID_NONEXISTENT }));
    assert.fail('expected requireUser to throw');
  } catch (e) {
    assert.ok(e instanceof auth.AuthError);
    assert.equal(e.status, 401);
    assert.match(e.message, /Invalid or inactive session/);
  } finally {
    restoreFetch();
  }
});

test('requireUser: is_active=false patrol user throws 401', async () => {
  const auth = loadAuth();
  installFetch(async (url) => {
    if (String(url).includes('/rest/v1/users')) {
      const inactiveRow = Object.assign({}, PATROL_USER_ROW, {
        id: UUID_INACTIVE,
        is_active: false
      });
      return jsonResponse(200, [inactiveRow]);
    }
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    await auth.requireUser(makeReq({ 'x-session-id': UUID_INACTIVE }));
    assert.fail('expected requireUser to throw');
  } catch (e) {
    assert.ok(e instanceof auth.AuthError);
    assert.equal(e.status, 401);
    assert.match(e.message, /Invalid or inactive session/);
  } finally {
    restoreFetch();
  }
});

test('requireUser: no headers at all throws 401 Missing x-session-id or Authorization', async () => {
  const auth = loadAuth();
  installFetch(async () => {
    throw new Error('fetch should not be called when no auth headers are present');
  });

  try {
    await auth.requireUser(makeReq({}));
    assert.fail('expected requireUser to throw');
  } catch (e) {
    assert.ok(e instanceof auth.AuthError);
    assert.equal(e.status, 401);
    assert.match(e.message, /Missing x-session-id or Authorization/);
  } finally {
    restoreFetch();
  }
});

test('requireUser: x-session-id hits the 5s positive cache on the second call (no second fetch)', async () => {
  // Fresh module load → empty cache. First call must fetch; second call
  // (within the 5s TTL) must NOT fetch — the cached user is returned.
  const auth = loadAuth();
  let fetchCount = 0;
  installFetch(async (url) => {
    if (String(url).includes('/rest/v1/users')) {
      fetchCount++;
      return jsonResponse(200, [PATROL_USER_ROW]);
    }
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    const u1 = await auth.requireUser(makeReq({ 'x-session-id': UUID_VALID }));
    const u2 = await auth.requireUser(makeReq({ 'x-session-id': UUID_VALID }));
    assert.equal(fetchCount, 1, 'cache must dedupe the second lookup');
    assert.equal(u1.id, UUID_VALID);
    assert.equal(u2.id, UUID_VALID);
  } finally {
    restoreFetch();
  }
});

test('requireUser: x-session-id cache expires after 5s TTL (Date.now mocked)', async () => {
  // Mock Date.now() so we can fast-forward past the 5s TTL without sleeping.
  const auth = loadAuth();
  const realNow = Date.now;
  let fakeNow = 1_700_000_000_000;
  Date.now = () => fakeNow;

  let fetchCount = 0;
  installFetch(async (url) => {
    if (String(url).includes('/rest/v1/users')) {
      fetchCount++;
      return jsonResponse(200, [PATROL_USER_ROW]);
    }
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    await auth.requireUser(makeReq({ 'x-session-id': UUID_VALID }));
    assert.equal(fetchCount, 1, 'first call must fetch');

    // Within TTL (4.9s later): cache hit.
    fakeNow += 4900;
    await auth.requireUser(makeReq({ 'x-session-id': UUID_VALID }));
    assert.equal(fetchCount, 1, 'within 5s TTL: no new fetch');

    // After TTL (5.1s later): cache miss — must refetch.
    fakeNow += 200; // total elapsed: 5.1s
    await auth.requireUser(makeReq({ 'x-session-id': UUID_VALID }));
    assert.equal(fetchCount, 2, 'after 5s TTL: cache miss, refetch');
  } finally {
    Date.now = realNow;
    restoreFetch();
  }
});

test('requireUser: x-session-id case-insensitive header lookup (X-Session-Id)', async () => {
  // The HTTP spec treats headers as case-insensitive; auth.js reads both
  // 'x-session-id' and 'X-Session-Id'. Vercel lowercases incoming headers
  // but the dual-check exists as a belt-and-suspenders guard.
  const auth = loadAuth();
  installFetch(async (url) => {
    if (String(url).includes('/rest/v1/users')) return jsonResponse(200, [PATROL_USER_ROW]);
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    const user = await auth.requireUser(makeReq({ 'X-Session-Id': UUID_VALID }));
    assert.equal(user.id, UUID_VALID);
  } finally {
    restoreFetch();
  }
});

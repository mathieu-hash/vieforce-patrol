// Unit tests for api/_lib/auth.js (W1-AuthCore).
// Covers:
//   1. Valid Bearer JWT → requireUser returns normalised user
//   2. Expired / invalid JWT → requireUser throws 401
//   3. Missing Authorization header → requireUser throws 401
//   4. Wrong role → requireRole throws 403
//
// The auth module talks to two Supabase endpoints:
//   - GET /auth/v1/user            (validates the JWT, returns auth user payload)
//   - GET /rest/v1/users?id=eq.<>  (loads the Patrol row)
// We stub global.fetch to script those responses per test.

const test = require('node:test');
const assert = require('node:assert/strict');

// Pre-set env so api/_lib/auth.js initializes correctly.
process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

// Always load a fresh copy of the module so cached state (the 5s user cache)
// doesn't leak between tests.
function loadAuth() {
  const p = require.resolve('../../api/_lib/auth.js');
  delete require.cache[p];
  return require(p);
}

const PATROL_USER_ID = '11111111-2222-3333-4444-555555555555';
const PATROL_USER_ROW = {
  id: PATROL_USER_ID,
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

function installFetch(handler) {
  global.fetch = handler;
}
function restoreFetch() {
  global.fetch = _origFetch;
}

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

test('requireUser: valid Bearer JWT returns normalised Patrol user', async () => {
  const auth = loadAuth();
  installFetch(async (url) => {
    if (String(url).includes('/auth/v1/user')) {
      return jsonResponse(200, {
        id: PATROL_USER_ID,
        email: null,
        phone: '639171234567',
        app_metadata: {
          patrol_user_id: PATROL_USER_ID,
          role: 'tsr',
          name: 'Jane Test',
          region: 'LUZON',
          district: 'Cavite',
          territory: 'Tagaytay'
        }
      });
    }
    if (String(url).includes('/rest/v1/users')) {
      return jsonResponse(200, [PATROL_USER_ROW]);
    }
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    const user = await auth.requireUser(makeReq({ authorization: 'Bearer good.jwt.token' }));
    assert.equal(user.id, PATROL_USER_ID);
    assert.equal(user.user_id, PATROL_USER_ID);
    assert.equal(user.role, 'tsr');
    assert.equal(user.name, 'Jane Test');
    assert.equal(user.region, 'LUZON');
    assert.equal(user.district, 'Cavite');
    assert.equal(user.territory, 'Tagaytay');
    assert.equal(user.is_active, true);
  } finally {
    restoreFetch();
  }
});

test('requireUser: expired / invalid JWT throws AuthError 401', async () => {
  const auth = loadAuth();
  installFetch(async (url) => {
    if (String(url).includes('/auth/v1/user')) {
      // GoTrue responds 401 when the JWT is expired or signature invalid.
      return jsonResponse(401, { msg: 'invalid jwt: token is expired' });
    }
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    await auth.requireUser(makeReq({ authorization: 'Bearer expired.jwt.token' }));
    assert.fail('expected requireUser to throw');
  } catch (e) {
    assert.ok(e instanceof auth.AuthError, 'expected AuthError');
    assert.equal(e.status, 401);
  } finally {
    restoreFetch();
  }
});

test('requireUser: missing Authorization header throws 401', async () => {
  const auth = loadAuth();
  installFetch(async () => {
    throw new Error('fetch should not be called when Authorization is missing');
  });

  try {
    await auth.requireUser(makeReq({}));
    assert.fail('expected requireUser to throw');
  } catch (e) {
    assert.ok(e instanceof auth.AuthError);
    assert.equal(e.status, 401);
    assert.match(e.message, /Missing Authorization/);
  } finally {
    restoreFetch();
  }
});

test('requireRole: wrong role throws 403', async () => {
  const auth = loadAuth();
  installFetch(async (url) => {
    if (String(url).includes('/auth/v1/user')) {
      return jsonResponse(200, {
        id: PATROL_USER_ID,
        app_metadata: {
          patrol_user_id: PATROL_USER_ID,
          role: 'tsr'
        }
      });
    }
    if (String(url).includes('/rest/v1/users')) {
      return jsonResponse(200, [PATROL_USER_ROW]);
    }
    throw new Error('Unexpected fetch URL: ' + url);
  });

  try {
    await auth.requireRole(
      makeReq({ authorization: 'Bearer good.jwt.token' }),
      ['admin', 'ceo']
    );
    assert.fail('expected requireRole to throw 403');
  } catch (e) {
    assert.ok(e instanceof auth.AuthError);
    assert.equal(e.status, 403);
  } finally {
    restoreFetch();
  }
});

test('requireUser: legacy x-session-id header rejected with migration hint', async () => {
  const auth = loadAuth();
  installFetch(async () => {
    throw new Error('fetch should not be called for legacy header');
  });

  try {
    await auth.requireUser(makeReq({ 'x-session-id': PATROL_USER_ID }));
    assert.fail('expected requireUser to throw');
  } catch (e) {
    assert.ok(e instanceof auth.AuthError);
    assert.equal(e.status, 401);
    assert.equal(e.extra && e.extra.migration_required, true);
  } finally {
    restoreFetch();
  }
});

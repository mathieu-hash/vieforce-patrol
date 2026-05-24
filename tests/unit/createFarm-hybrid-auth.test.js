// Unit test for js/db.js::createFarm hybrid auth (R6 P0 regression).
//
// Pre-fix (post W1.4 AuthCore rollback): createFarm threw "no auth token"
// whenever window.getAuthBearer() returned null — which is every TSR PIN
// session, because TSR clients never call supabase.auth.setSession(). The
// thrown Error had no .code, classifyError() routed it to 'transient', the
// offline queue retried forever. TSR farm rows wedged in the queue
// indefinitely; the sync badge sat at "pending" with no path to drain.
//
// Fix (R7): hybrid header — Authorization: Bearer <jwt> when bearer is
// available, otherwise x-session-id: <uuid>. api/_lib/auth.js requireUser()
// accepts both (see api/_lib/auth.js:192-224).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'db.js'), 'utf8').replace(/\r\n/g, '\n');
// Match from `async function createFarm` up to the next blank line followed by
// a fresh top-level `async function` or `function ` — body's closing `}` is the
// last `}` before that next definition.
const fnMatch = src.match(/async function createFarm[\s\S]+?\n\}\n(?=\nasync function |\nfunction |\n\/\/ ── )/);
if (!fnMatch) throw new Error('could not locate createFarm in js/db.js');

const FAKE_SESSION_ID = '5d710fc6-8351-439f-b0e1-c91a76719ccb';

function makeSandbox(opts) {
  opts = opts || {};
  const captured = { url: null, init: null };
  const sandbox = {
    window: {},
    getSession: function () { return opts.session === undefined ? { id: FAKE_SESSION_ID } : opts.session; },
    fetch: async function (url, init) {
      captured.url = url;
      captured.init = init;
      return {
        ok: opts.ok !== false,
        status: opts.status || 200,
        json: async () => (opts.body || { id: 'farm-1', name: 'X' })
      };
    },
    captured: captured
  };
  if (opts.bearer) sandbox.window.getAuthBearer = async function () { return opts.bearer; };
  vm.createContext(sandbox);
  vm.runInContext('createFarm = (' + fnMatch[0].replace('async function createFarm', 'async function') + ');', sandbox);
  return sandbox;
}

// ─────────────────────────────────────────────────────────────────────────
test('TSR PIN session sends x-session-id header (R6 P0 regression)', async () => {
  const sb = makeSandbox({ session: { id: FAKE_SESSION_ID } });
  const result = await vm.runInContext('createFarm({ name: "Farm A", heads: 50 })', sb);
  assert.ok(result, 'createFarm must resolve, not throw');
  assert.equal(sb.captured.init.headers['x-session-id'], FAKE_SESSION_ID,
    'PIN session must use x-session-id (api/_lib/auth.js:192 accepts it)');
  assert.equal(sb.captured.init.headers['Authorization'], undefined,
    'PIN session must NOT send Authorization (no JWT available)');
  assert.equal(sb.captured.init.headers['Content-Type'], 'application/json');
});

test('OAuth manager session prefers Bearer JWT', async () => {
  const sb = makeSandbox({ session: { id: FAKE_SESSION_ID }, bearer: 'eyJfake.jwt.token' });
  await vm.runInContext('createFarm({ name: "Farm B", heads: 100 })', sb);
  assert.equal(sb.captured.init.headers['Authorization'], 'Bearer eyJfake.jwt.token',
    'Manager OAuth session must send Bearer JWT');
  assert.equal(sb.captured.init.headers['x-session-id'], undefined,
    'When Bearer is present, x-session-id must NOT be sent (avoid hybrid ambiguity)');
});

test('no session still rejects (defensive — should never happen via UI)', async () => {
  const sb = makeSandbox({ session: null });
  await assert.rejects(
    () => vm.runInContext('createFarm({ name: "Farm C" })', sb),
    /no active session/
  );
});

test('heads is coerced to integer (chatbot string input)', async () => {
  const sb = makeSandbox({ session: { id: FAKE_SESSION_ID } });
  await vm.runInContext('createFarm({ name: "Farm D", heads: "75" })', sb);
  const body = JSON.parse(sb.captured.init.body);
  assert.equal(body.heads, 75);
  assert.equal(typeof body.heads, 'number');
});

test('server error surfaces as throw with message detail', async () => {
  const sb = makeSandbox({ session: { id: FAKE_SESSION_ID }, ok: false, status: 500, body: { error: 'db down' } });
  await assert.rejects(
    () => vm.runInContext('createFarm({ name: "Farm E" })', sb),
    /createFarm:/
  );
});

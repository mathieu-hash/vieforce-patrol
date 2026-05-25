// Contract tests for the W1.6b users_safe VIEW + base-table REVOKE.
//
// R6 audit (_audit/HARDENING/R6_EXECUTIVE_REVIEW.md:82) flagged that
// no test confirms the security model is wired correctly: anon SELECT
// on public.users must be revoked, AND js/db.js + js/export.js must
// route through users_safe (or never expose pin_hash).
//
// This is a textual contract test — no Supabase calls, no browser. It
// asserts the source files and migrations contain the exact strings the
// security model depends on, so a careless future edit ("oh let me just
// switch back to .from('users') here") fails CI loudly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'js', 'db.js');
const EXPORT_PATH = path.join(ROOT, 'js', 'export.js');
const M_USERS_VIEW = path.join(ROOT, 'supabase', 'migrations', '20260524151500_w16_rls_users_view.sql');
const M_RLS_SCOPING = path.join(ROOT, 'supabase', 'migrations', '20260524150000_w16_rls_scoping_hardening.sql');

// ─────────────────────────────────────────────────────────────────────────
// js/db.js — getUsers() must query users_safe, not users.
// ─────────────────────────────────────────────────────────────────────────

// Slice db.js#getUsers from its declaration to the next function (getUsersForAdmin)
// so neighbouring helpers don't leak into the assertion window.
function getUsersBody() {
  const src = fs.readFileSync(DB_PATH, 'utf8');
  const fnStart = src.indexOf('async function getUsers()');
  assert.notEqual(fnStart, -1, 'getUsers() must exist in js/db.js');
  const nextFn = src.indexOf('async function getUsersForAdmin', fnStart);
  assert.notEqual(nextFn, -1, 'getUsersForAdmin must follow getUsers');
  return src.slice(fnStart, nextFn);
}

test('js/db.js#getUsers selects from users_safe (NOT base users table)', () => {
  const body = getUsersBody();
  assert.match(
    body,
    /\.from\(['"]users_safe['"]\)/,
    'getUsers must call supabaseClient.from("users_safe") — never the base "users" table'
  );
  // And it must NOT fall through to .from('users') in this function body.
  assert.equal(
    /\.from\(['"]users['"]\)/.test(body),
    false,
    'getUsers must not query base public.users (anon SELECT was REVOKEd in W1.6b)'
  );
});

test('js/db.js#getUsers select list does NOT include pin_hash', () => {
  const body = getUsersBody();
  // Match the .select('…') argument literal — the inline JSDoc comments
  // legitimately MENTION pin_hash when explaining WHY it's excluded, so
  // scanning the raw body would false-positive. The actual contract is
  // about what's passed to .select().
  const selectMatch = body.match(/\.select\(\s*['"]([^'"]+)['"]\s*\)/);
  assert.ok(selectMatch, 'getUsers must call .select("...") with a literal column list');
  assert.equal(
    /pin_hash/.test(selectMatch[1]),
    false,
    'getUsers .select() argument must never include pin_hash (would defeat users_safe shielding)'
  );
});

test('js/db.js#getUsersForAdmin is the ONLY function allowed to read pin_hash', () => {
  // Admin path explicitly opts into PIN material for the admin UI; getUsers
  // (used by all patrol app screens) must not. This contract guards against
  // a silent swap between them.
  const src = fs.readFileSync(DB_PATH, 'utf8');
  const adminStart = src.indexOf('async function getUsersForAdmin()');
  assert.notEqual(adminStart, -1, 'getUsersForAdmin() must exist');
  const adminSlice = src.slice(adminStart, adminStart + 600);
  assert.match(adminSlice, /pin_hash/, 'getUsersForAdmin must explicitly select pin_hash');
  assert.match(adminSlice, /\.from\(['"]users['"]\)/, 'getUsersForAdmin reads base users via authenticated session');
});

// ─────────────────────────────────────────────────────────────────────────
// js/export.js — user export whitelist includes safe fields, NOT pin_hash.
// ─────────────────────────────────────────────────────────────────────────

test('js/export.js user-export whitelist excludes pin_hash', () => {
  const src = fs.readFileSync(EXPORT_PATH, 'utf8');
  // Find every .from('users').select(...) call. The user-export whitelist
  // is the one with the long column list (email/phone/role/...); the other
  // call sites pull only id+name for label maps. Concatenate ALL select
  // arguments and (a) prove none contain pin_hash, and (b) prove the long
  // whitelist exists.
  const allMatches = Array.from(src.matchAll(/\.from\(['"]users['"]\)[\s\S]{0,40}\.select\(([^)]+)\)/g));
  assert.ok(allMatches.length >= 1, 'export.js must contain a .from("users").select(...) call');

  for (const m of allMatches) {
    assert.equal(
      /pin_hash/.test(m[1]),
      false,
      'export.js .select() arg must NEVER include pin_hash (Q-P0-2 regression guard)'
    );
  }

  // The export-whitelist call (the one that pulls the full user record for
  // CSV/XLSX export) must include email/phone/role/etc.
  const exportSelect = allMatches.find(m => /email/.test(m[1]) && /role/.test(m[1]));
  assert.ok(exportSelect, 'export.js must contain a user-export .select() whitelist with email + role');
  for (const col of ['email', 'phone', 'role', 'region', 'district', 'territory']) {
    assert.match(
      exportSelect[1],
      new RegExp('\\b' + col + '\\b'),
      `export.js user-export whitelist must include "${col}"`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Migration 20260524151500_w16_rls_users_view.sql contract
// ─────────────────────────────────────────────────────────────────────────

test('migration 20260524151500 exists and REVOKEs anon SELECT on users', () => {
  assert.ok(fs.existsSync(M_USERS_VIEW), 'W1.6b users_safe migration file must exist');
  const sql = fs.readFileSync(M_USERS_VIEW, 'utf8');
  assert.match(
    sql,
    /REVOKE\s+SELECT\s+ON\s+public\.users\s+FROM\s+anon/i,
    'W1.6b must REVOKE SELECT ON public.users FROM anon (table-level)'
  );
});

test('migration 20260524151500 creates public.users_safe view', () => {
  const sql = fs.readFileSync(M_USERS_VIEW, 'utf8');
  assert.match(
    sql,
    /CREATE\s+VIEW\s+public\.users_safe/i,
    'W1.6b must CREATE VIEW public.users_safe'
  );
});

test('users_safe view definition does NOT include pin_hash', () => {
  const sql = fs.readFileSync(M_USERS_VIEW, 'utf8');
  // Extract the CREATE VIEW ... AS SELECT ... FROM public.users; block.
  const viewMatch = sql.match(/CREATE\s+VIEW\s+public\.users_safe\s+AS\s+SELECT([\s\S]+?)FROM\s+public\.users/i);
  assert.ok(viewMatch, 'CREATE VIEW users_safe AS SELECT ... FROM public.users block must exist');
  const columnList = viewMatch[1];
  assert.equal(
    /\bpin_hash\b/.test(columnList),
    false,
    'users_safe view MUST NOT expose pin_hash (defeats the W1.6b shield)'
  );
});

test('users_safe view GRANTs SELECT to anon + authenticated', () => {
  const sql = fs.readFileSync(M_USERS_VIEW, 'utf8');
  assert.match(
    sql,
    /GRANT\s+SELECT\s+ON\s+public\.users_safe\s+TO\s+anon,\s*authenticated/i,
    'users_safe must be readable by anon + authenticated (TSR PIN clients are anon)'
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Migration 20260524150000_w16_rls_scoping_hardening.sql contract
// ─────────────────────────────────────────────────────────────────────────

test('migration 20260524150000 exists and ENABLEs RLS on users', () => {
  assert.ok(fs.existsSync(M_RLS_SCOPING), 'W1.6 RLS-scoping migration file must exist');
  const sql = fs.readFileSync(M_RLS_SCOPING, 'utf8');
  assert.match(
    sql,
    /ALTER\s+TABLE\s+public\.users\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    'W1.6 must ENABLE RLS on public.users'
  );
});

test('migration 20260524150000 column-level REVOKE on users.pin_hash from anon', () => {
  const sql = fs.readFileSync(M_RLS_SCOPING, 'utf8');
  assert.match(
    sql,
    /REVOKE\s+SELECT\s*\(\s*pin_hash\s*\)\s+ON\s+public\.users\s+FROM\s+anon/i,
    'W1.6 must REVOKE SELECT (pin_hash) ON public.users FROM anon (defense in depth)'
  );
});

test('migration 20260524150000 GRANTs pin_hash back to authenticated + service_role', () => {
  const sql = fs.readFileSync(M_RLS_SCOPING, 'utf8');
  assert.match(
    sql,
    /GRANT\s+SELECT\s*\(\s*pin_hash\s*\)\s+ON\s+public\.users\s+TO\s+authenticated,\s*service_role/i,
    'W1.6 must keep pin_hash readable to authenticated managers + service role'
  );
});

// Unit tests for the Wave 2 retry / quarantine refactor in js/offline.js
// (Audit D P0 O1).
//
// The previous behavior was: 3 failures → silently delete record, sync
// badge then renders green because pending=0.
//
// New behavior:
//   - classifyError(err) → 'transient' | 'permanent'
//   - transient → retry forever with capped exponential backoff
//   - permanent → quarantine on first hit (still in IDB, surfaced via
//     getSyncState)
//   - records are NEVER deleted by the retry loop
//
// js/offline.js is browser code (Dexie + window globals). We extract
// pure functions and pure logic via vm — same pattern as
// offline-queue-payload.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_PATH = path.join(__dirname, '..', '..', 'js', 'offline.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

function extractFunction(src, name) {
  // Match: [async] function NAME(...) { ... } — non-greedy up to a newline-`}` boundary.
  // We accept the optional `async` keyword because _handleSyncFailure /
  // _computeQueueStats / getSyncState are all async.
  const re = new RegExp('(?:async\\s+)?function ' + name + '\\b[\\s\\S]+?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('could not locate ' + name + ' in js/offline.js');
  return m[0];
}

// Build a small evaluation context that exposes classifyError, the
// backoff schedule, and the in-place handler.  We also stub a minimal
// `navigator` so classifyError can check navigator.onLine.
function buildCtx(overrides) {
  const ctx = {
    Promise, setTimeout, Math, Date, JSON,
    console: { warn() {}, error() {}, log() {} },
    navigator: { onLine: true },
    isFinite,
    String, Number, Object,
  };
  if (overrides) Object.assign(ctx, overrides);
  vm.createContext(ctx);

  // Inject the constants + helpers we need from offline.js. We
  // include the whole file's relevant top-level chunks so the function
  // bodies' references (e.g. _BACKOFF_SCHEDULE_MS) resolve.
  const chunk = [
    'var SYNC_SLOW_HINT_ATTEMPTS;',
    SRC.match(/var SYNC_SLOW_HINT_ATTEMPTS[\s\S]+?;/)[0],
    SRC.match(/var _BACKOFF_SCHEDULE_MS[\s\S]+?\];/)[0],
    extractFunction(SRC, '_nextBackoffMs'),
    extractFunction(SRC, 'classifyError'),
  ].join('\n');
  vm.runInContext(chunk, ctx);
  return ctx;
}

// ──────────────────────────────────────────────────────────────────────
// classifyError — the matrix the audit calls out
// ──────────────────────────────────────────────────────────────────────
test('classifyError: fetch TypeError "Failed to fetch" → transient', () => {
  const ctx = buildCtx();
  const err = new TypeError('Failed to fetch');
  assert.equal(ctx.classifyError(err), 'transient');
});

test('classifyError: AbortError → transient', () => {
  const ctx = buildCtx();
  const err = new Error('aborted'); err.name = 'AbortError';
  assert.equal(ctx.classifyError(err), 'transient');
});

test('classifyError: navigator.onLine === false → transient regardless of shape', () => {
  const ctx = buildCtx({ navigator: { onLine: false } });
  // Even a "permanent-looking" 400 should be transient if we are offline
  assert.equal(ctx.classifyError({ status: 400, message: 'bad request' }), 'transient');
});

test('classifyError: 502/503/504 → transient', () => {
  const ctx = buildCtx();
  assert.equal(ctx.classifyError({ status: 502 }), 'transient');
  assert.equal(ctx.classifyError({ status: 503 }), 'transient');
  assert.equal(ctx.classifyError({ status: 504 }), 'transient');
  assert.equal(ctx.classifyError({ status: 500 }), 'transient');
});

test('classifyError: 429 rate limit → transient', () => {
  const ctx = buildCtx();
  assert.equal(ctx.classifyError({ status: 429 }), 'transient');
});

test('classifyError: 408 request timeout → transient', () => {
  const ctx = buildCtx();
  assert.equal(ctx.classifyError({ status: 408 }), 'transient');
});

test('classifyError: 4xx (400/401/403/404/409/422) → permanent', () => {
  const ctx = buildCtx();
  assert.equal(ctx.classifyError({ status: 400 }), 'permanent');
  assert.equal(ctx.classifyError({ status: 401 }), 'permanent');
  assert.equal(ctx.classifyError({ status: 403 }), 'permanent');
  assert.equal(ctx.classifyError({ status: 404 }), 'permanent');
  assert.equal(ctx.classifyError({ status: 409 }), 'permanent');
  assert.equal(ctx.classifyError({ status: 422 }), 'permanent');
});

test('classifyError: PostgREST PGRST204 schema error → permanent', () => {
  const ctx = buildCtx();
  // The 2026-04-25 regression that originally caused silent ejection
  assert.equal(ctx.classifyError({ code: 'PGRST204', message: "Could not find the 'offline_id' column" }), 'permanent');
});

test('classifyError: PostgREST PGRST116 row not found → transient (replication lag tolerance)', () => {
  const ctx = buildCtx();
  assert.equal(ctx.classifyError({ code: 'PGRST116' }), 'transient');
});

test('classifyError: Postgres NOT NULL (23502) and CHECK (23514) → permanent', () => {
  const ctx = buildCtx();
  assert.equal(ctx.classifyError({ code: '23502' }), 'permanent');
  assert.equal(ctx.classifyError({ code: '23514' }), 'permanent');
});

test('classifyError: unknown/unshaped error → transient (safe default — never lose data)', () => {
  const ctx = buildCtx();
  assert.equal(ctx.classifyError(new Error('weird thing happened')), 'transient');
  assert.equal(ctx.classifyError({}), 'transient');
  assert.equal(ctx.classifyError(null), 'transient');
});

test('classifyError: message-shaped permanent (constraint phrasing) → permanent', () => {
  const ctx = buildCtx();
  assert.equal(
    ctx.classifyError({ message: 'duplicate key value violates unique constraint' }),
    'permanent'
  );
  assert.equal(
    ctx.classifyError({ message: 'column "foo" does not exist' }),
    'permanent'
  );
});

// ──────────────────────────────────────────────────────────────────────
// Backoff schedule
// ──────────────────────────────────────────────────────────────────────
test('_nextBackoffMs: schedule increments 5s, 15s, 30s, 1m, 5m...', () => {
  const ctx = buildCtx();
  assert.equal(ctx._nextBackoffMs(1), 5 * 1000);
  assert.equal(ctx._nextBackoffMs(2), 15 * 1000);
  assert.equal(ctx._nextBackoffMs(3), 30 * 1000);
  assert.equal(ctx._nextBackoffMs(4), 60 * 1000);
  assert.equal(ctx._nextBackoffMs(5), 5 * 60 * 1000);
});

test('_nextBackoffMs: caps at 24h after 12 attempts (retries forever)', () => {
  const ctx = buildCtx();
  const cap = 24 * 60 * 60 * 1000;
  assert.equal(ctx._nextBackoffMs(12), cap);
  assert.equal(ctx._nextBackoffMs(13), cap);
  assert.equal(ctx._nextBackoffMs(50), cap);
  assert.equal(ctx._nextBackoffMs(999), cap);
});

// ──────────────────────────────────────────────────────────────────────
// _handleSyncFailure + queue state — exercises the in-memory bookkeeping
// against a stub Dexie table.
// ──────────────────────────────────────────────────────────────────────
function makeStubTable(initialRows) {
  const rows = new Map();
  let nextId = 1;
  for (const r of initialRows || []) {
    const id = r.id || nextId++;
    rows.set(id, Object.assign({}, r, { id }));
  }
  return {
    _rows: rows,
    async put(record) { rows.set(record.id, record); return record.id; },
    async get(id) { return rows.get(id) || null; },
    async delete(id) { rows.delete(id); },
    async toArray() { return Array.from(rows.values()); },
    async count() { return rows.size; },
    async clear() { rows.clear(); },
  };
}

function buildRetryCtx() {
  const ctx = {
    Promise, setTimeout, Math, Date, JSON,
    console: { warn() {}, error() {}, log() {} },
    navigator: { onLine: true },
    isFinite, String, Number, Object,
  };
  vm.createContext(ctx);

  // Pull in the constants, classifyError, _nextBackoffMs, _handleSyncFailure,
  // _isActive, _isQuarantined helpers.
  const pieces = [
    SRC.match(/var SYNC_SLOW_HINT_ATTEMPTS[\s\S]+?;/)[0],
    SRC.match(/var _BACKOFF_SCHEDULE_MS[\s\S]+?\];/)[0],
    extractFunction(SRC, '_nextBackoffMs'),
    extractFunction(SRC, 'classifyError'),
    extractFunction(SRC, '_handleSyncFailure'),
    extractFunction(SRC, '_isActive'),
    extractFunction(SRC, '_isQuarantined'),
  ];
  vm.runInContext(pieces.join('\n'), ctx);
  return ctx;
}

test('_handleSyncFailure: transient error sets backoff, keeps record in IDB', async () => {
  const ctx = buildRetryCtx();
  const record = { id: 1, offline_id: 'v_x', name: 'visit-1' };
  const table = makeStubTable([record]);

  // Network blip — should be transient
  const err = new TypeError('Failed to fetch');
  const cls = await ctx._handleSyncFailure(table, record, err, 'Visit');

  assert.equal(cls, 'transient');
  assert.equal(record.attempt_count, 1, 'attempt_count incremented to 1');
  assert.equal(record.last_error_class, 'transient');
  assert.ok(record.next_attempt_after, 'next_attempt_after stamped');
  assert.ok(!record.quarantined_at, 'NOT quarantined');
  assert.equal(await table.count(), 1, 'record still in IDB — never deleted');
});

test('_handleSyncFailure: permanent error quarantines on first hit, no retries', async () => {
  const ctx = buildRetryCtx();
  const record = { id: 1, offline_id: 's_x', name: 'store-1' };
  const table = makeStubTable([record]);

  // PGRST204 schema mismatch — permanent
  const err = { code: 'PGRST204', message: "Could not find the 'offline_id' column" };
  const cls = await ctx._handleSyncFailure(table, record, err, 'Store');

  assert.equal(cls, 'permanent');
  assert.equal(record.attempt_count, 1);
  assert.equal(record.last_error_class, 'permanent');
  assert.ok(record.quarantined_at, 'quarantined_at stamped');
  assert.equal(record.next_attempt_after, null, 'no retry scheduled');
  assert.equal(await table.count(), 1, 'record STILL in IDB — quarantine ≠ delete');
});

test('12 transient failures: record never ejected, stays in IDB', async () => {
  const ctx = buildRetryCtx();
  const record = { id: 1, offline_id: 'v_x', name: 'visit-1' };
  const table = makeStubTable([record]);

  for (let i = 1; i <= 12; i++) {
    const err = new TypeError('Failed to fetch');
    await ctx._handleSyncFailure(table, record, err, 'Visit');
  }

  assert.equal(record.attempt_count, 12, '12 attempts recorded');
  assert.equal(record.last_error_class, 'transient');
  assert.ok(!record.quarantined_at, 'still NOT quarantined after 12 transient failures');
  assert.equal(await table.count(), 1, 'STILL in IDB — old 3-strike eject is gone');
});

test('_isActive: quarantined records are NOT active', () => {
  const ctx = buildRetryCtx();
  const now = Date.now();
  const quarantined = { quarantined_at: new Date(now).toISOString() };
  const fresh = { };
  const waiting = { next_attempt_after: new Date(now + 60000).toISOString() };
  const ready = { next_attempt_after: new Date(now - 60000).toISOString() };

  assert.equal(ctx._isActive(quarantined, now), false, 'quarantined → not active');
  assert.equal(ctx._isActive(fresh, now), true, 'fresh (no backoff) → active');
  assert.equal(ctx._isActive(waiting, now), false, 'backoff window in future → not active');
  assert.equal(ctx._isActive(ready, now), true, 'backoff window in past → active again');
});

// ──────────────────────────────────────────────────────────────────────
// getSyncState shape — contract for W2-SyncTruthBadge
// ──────────────────────────────────────────────────────────────────────
test('getSyncState returns the contract shape', async () => {
  // Stand up a minimal context with stub Dexie + stub queues, then
  // invoke _computeQueueStats / getSyncState definitions.
  const stubTables = {
    pendingVisits: makeStubTable([
      { id: 1, offline_id: 'v_1', created_at: new Date(Date.now() - 5000).toISOString() },
      { id: 2, offline_id: 'v_2', created_at: new Date(Date.now() - 60000).toISOString() },
    ]),
    pendingStores: makeStubTable([
      // One quarantined record
      { id: 1, offline_id: 's_1', quarantined_at: new Date().toISOString(), last_error: 'PGRST204' },
    ]),
    pendingFarms: makeStubTable([]),
  };

  const ctx = {
    Promise, setTimeout, Math, Date, JSON,
    console: { warn() {}, error() {}, log() {} },
    navigator: { onLine: true },
    isFinite, String, Number, Object, Array,
    offlineDb: stubTables,
    _syncRunning: null,
    _lastSyncSummary: { errors: 0, lastError: null },
  };
  vm.createContext(ctx);

  const pieces = [
    extractFunction(SRC, '_isActive'),
    extractFunction(SRC, '_isQuarantined'),
    extractFunction(SRC, '_computeQueueStats'),
    extractFunction(SRC, 'getSyncState'),
    extractFunction(SRC, 'getQueueStats'),
  ];
  vm.runInContext(pieces.join('\n'), ctx);

  const state = await ctx.getSyncState();
  assert.equal(typeof state.onLine, 'boolean', 'onLine is boolean');
  assert.equal(state.pending, 2, '2 active pending visits; quarantined store excluded');
  assert.equal(state.quarantined, 1, '1 quarantined record surfaced');
  assert.equal(state.syncing, false, 'syncing reflects _syncRunning');
  assert.equal(state.lastError, null, 'no lastError when nothing has failed');

  // The contract: keys must be exactly these
  const keys = Object.keys(state).sort();
  assert.deepEqual(keys, ['lastError', 'onLine', 'pending', 'quarantined', 'syncing']);
});

test('quarantined records do NOT pollute pending', async () => {
  const stubTables = {
    pendingVisits: makeStubTable([
      { id: 1, offline_id: 'v_active', created_at: new Date().toISOString() },
      { id: 2, offline_id: 'v_quarantined', quarantined_at: new Date().toISOString() },
    ]),
    pendingStores: makeStubTable([]),
    pendingFarms: makeStubTable([]),
  };
  const ctx = {
    Promise, setTimeout, Math, Date, JSON,
    console: { warn() {}, error() {}, log() {} },
    navigator: { onLine: true },
    isFinite, String, Number, Object, Array,
    offlineDb: stubTables,
    _syncRunning: null,
    _lastSyncSummary: { errors: 0, lastError: null },
  };
  vm.createContext(ctx);
  const pieces = [
    extractFunction(SRC, '_isActive'),
    extractFunction(SRC, '_isQuarantined'),
    extractFunction(SRC, '_computeQueueStats'),
    extractFunction(SRC, 'getQueueStats'),
  ];
  vm.runInContext(pieces.join('\n'), ctx);

  const stats = await ctx.getQueueStats();
  assert.equal(stats.pending, 1, 'only the active record counts as pending');
  assert.equal(stats.quarantined, 1);
});

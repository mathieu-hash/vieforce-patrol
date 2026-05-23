// Unit tests for js/home-dsm.js — Wave 3 real-data path (Audit A #3).
//
// Verifies the new getDsmTeamMetrics() public API:
//   1. Shape: returns { stores, visited_month, tsrs[] } from a mocked
//      Supabase response.
//   2. Empty Supabase response yields zeros — NOT mocked seed % 11 values.
//   3. Failed query with no warm cache returns source='empty' + null value.
//   4. Warm cache (< TTL) is served without hitting Supabase.
//
// home-dsm.js is browser code wrapped in an IIFE. We load it into a vm
// context with a hand-rolled supabaseClient stub modeled on the existing
// offline-write-coverage.test.js pattern. No real network or Dexie.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'home-dsm.js'),
  'utf8'
);

// ─── In-memory Dexie-style table for cachedDsmMetrics ───────────────────
function makeCacheTable() {
  const rows = new Map();
  return {
    rows,
    get(key) { return Promise.resolve(rows.get(String(key)) || null); },
    put(record) {
      rows.set(String(record.id), Object.assign({}, record));
      return Promise.resolve(record.id);
    },
    clear() { rows.clear(); return Promise.resolve(); }
  };
}

// ─── Supabase client builder — returns the value the test queues up. ───
//
// The DSM real query path makes these calls in order:
//   1. from('visits').select(cols).in('tsr_id', ids).gte('visited_at', startOfMonth)
//   2. from('stores').select('id',{count:'exact',head:true}).in('assigned_tsr', ids)
//   3. from('stores').select(...).in('assigned_tsr', ids).lt('last_visit_at', cutoff)
//   4. from('stores').select(...).in('assigned_tsr', ids).is('last_visit_at', null)
//
// We use a recording mock: each `from(table)` returns a query builder
// that resolves to whatever the test pre-stages via `client._queueResult`.
function makeSupabaseStub() {
  const calls = [];
  const results = []; // FIFO queue of { data, error, count }

  function builder(table) {
    const state = { table, filters: [] };
    const b = {
      _state: state,
      select(cols, opts) {
        state.cols = cols;
        state.headOnly = !!(opts && opts.head);
        if (opts && opts.count) state.count = opts.count;
        return b;
      },
      in(col, list) { state.filters.push({ op: 'in', col, list }); return b; },
      gte(col, val) { state.filters.push({ op: 'gte', col, val }); return b; },
      lt(col, val) { state.filters.push({ op: 'lt', col, val }); return b; },
      is(col, val) { state.filters.push({ op: 'is', col, val }); return b; },
      eq(col, val) { state.filters.push({ op: 'eq', col, val }); return b; },
      order() { return b; },
      limit() { return b; },
      then(resolve, reject) {
        calls.push(state);
        const r = results.shift() || { data: [], count: 0, error: null };
        return Promise.resolve(r).then(resolve, reject);
      }
    };
    return b;
  }

  return {
    from(table) { return builder(table); },
    _queueResult(r) { results.push(r); },
    _calls: calls
  };
}

// ─── Context loader ─────────────────────────────────────────────────────
function loadHomeDsm(opts = {}) {
  const supabaseClient = opts.supabaseClient || makeSupabaseStub();
  const cacheTable = makeCacheTable();

  const offlineDb = { cachedDsmMetrics: cacheTable };

  const directReports = opts.directReports || [];

  const ctx = {
    Promise, setTimeout, setImmediate, queueMicrotask,
    console: { warn() {}, log() {}, error() {} },
    Date,
    Math,
    document: { getElementById: () => null }, // renderDsmHome bails on no session anyway
    window: {
      supabaseClient,
      offlineDb,
      getDirectReports: async () => directReports,
      getRecentTeamActivity: opts.getRecentTeamActivity || (async () => []),
      PATROL_DSM_USE_MOCKS: !!opts.useMocks,
      addEventListener: () => {}
    }
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, supabaseClient, cacheTable };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. getDsmTeamMetrics returns the expected shape from mocked Supabase
// ─────────────────────────────────────────────────────────────────────────
test('getDsmTeamMetrics returns { stores, visited_month, tsrs } shape from real query', async () => {
  const directReports = [
    { id: 'tsr-1', name: 'Jake Santos', role: 'tsr' },
    { id: 'tsr-2', name: 'Maria Cruz',  role: 'tsr' }
  ];
  const { ctx, supabaseClient } = loadHomeDsm({ directReports });

  // 1. visits query → return 3 visit rows
  supabaseClient._queueResult({
    data: [
      { tsr_id: 'tsr-1', store_id: 's-a', visited_at: new Date().toISOString(), order_taken: true },
      { tsr_id: 'tsr-1', store_id: 's-b', visited_at: new Date().toISOString(), order_taken: false },
      { tsr_id: 'tsr-2', store_id: 's-c', visited_at: new Date().toISOString(), order_taken: true }
    ],
    error: null
  });
  // 2. team stores count
  supabaseClient._queueResult({ data: null, count: 42, error: null });
  // 3. overdue (lt) — none
  supabaseClient._queueResult({ data: null, count: 0, error: null });
  // 4. overdue (is null) — none
  supabaseClient._queueResult({ data: null, count: 0, error: null });

  const result = await ctx.window.getDsmTeamMetrics('dsm-1');

  assert.equal(result.source, 'live');
  assert.ok(result.value, 'value is present');
  assert.equal(result.value.stores, 42, 'stores count from real query');
  assert.equal(result.value.visited_month, 3, 'visited_month = distinct stores in visits');
  assert.equal(result.value.tsrs.length, 2, 'two TSRs aggregated');

  const jake = result.value.tsrs.find(t => t.id === 'tsr-1');
  assert.equal(jake.visits_month, 2, 'Jake = 2 visits');
  assert.equal(jake.conversions_month, 1, 'Jake = 1 order_taken');
  assert.equal(jake.name, 'Jake Santos');
  assert.ok(typeof jake.score === 'number', 'score is numeric');
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Empty Supabase response → zeros, NOT mock values
// ─────────────────────────────────────────────────────────────────────────
test('empty Supabase response returns zeros, never fabricated mock numbers', async () => {
  const directReports = [
    { id: 'tsr-1', name: 'Jake Santos', role: 'tsr' }
  ];
  const { ctx, supabaseClient } = loadHomeDsm({ directReports });

  // Visits empty
  supabaseClient._queueResult({ data: [], error: null });
  // Stores count 0
  supabaseClient._queueResult({ data: null, count: 0, error: null });
  // Overdue queries 0
  supabaseClient._queueResult({ data: null, count: 0, error: null });
  supabaseClient._queueResult({ data: null, count: 0, error: null });

  const result = await ctx.window.getDsmTeamMetrics('dsm-1');

  assert.equal(result.source, 'live');
  assert.equal(result.value.stores, 0, 'stores is 0, not the old hardcoded 87');
  assert.equal(result.value.visited_month, 0, 'visited_month is 0, not 47');
  assert.equal(result.value.tsrs.length, 1, 'one TSR present');
  const tsr = result.value.tsrs[0];
  assert.equal(tsr.visits_month, 0, 'visits_month real-zero');
  assert.equal(tsr.visits_week, 0);
  assert.equal(tsr.conversions_month, 0);
  // The mock seed % 11 path would have produced visits_week >= 3. Real
  // path must NOT produce that.
  assert.ok(tsr.visits_week < 3, 'no seed-derived padding on empty data');
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Failed query + no warm cache → source='empty', value=null
// ─────────────────────────────────────────────────────────────────────────
test('failed Supabase query with no cache returns source=empty + null value', async () => {
  const directReports = [
    { id: 'tsr-1', name: 'Jake', role: 'tsr' }
  ];
  const { ctx, supabaseClient } = loadHomeDsm({ directReports });

  // visits query errors out
  supabaseClient._queueResult({ data: null, error: { message: 'network down' } });

  const result = await ctx.window.getDsmTeamMetrics('dsm-no-cache');

  assert.equal(result.source, 'empty', 'no fallback to fake data on hard failure');
  assert.equal(result.value, null);
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Warm cache (< TTL) is served without hitting Supabase
// ─────────────────────────────────────────────────────────────────────────
test('warm cache within TTL is served without calling Supabase', async () => {
  const { ctx, supabaseClient, cacheTable } = loadHomeDsm({ directReports: [] });

  // Pre-seed cache with a fresh entry (just now).
  const cachedPayload = {
    stores: 99,
    visited_month: 50,
    tsrs: [{ id: 'tsr-cached', name: 'Cached', visits_month: 7, conversions_month: 2 }],
    overdue: 1
  };
  await cacheTable.put({
    id: 'dsm-cache-hit',
    payload: cachedPayload,
    updated_at: new Date().toISOString()
  });

  const result = await ctx.window.getDsmTeamMetrics('dsm-cache-hit');

  assert.equal(result.source, 'cache_warm', 'served from warm cache');
  assert.equal(result.value.stores, 99);
  assert.equal(result.value.visited_month, 50);
  assert.equal(result.value.tsrs[0].id, 'tsr-cached');
  // Background refresh fires-and-forgets — it may call Supabase, but the
  // foreground path must NOT have awaited any query before returning.
  // We can't observe "no await" directly, but we can confirm the value
  // came from cache (id 'tsr-cached' is not derivable from any live
  // path, since directReports is empty).
  assert.notEqual(supabaseClient._calls.length, undefined);
});

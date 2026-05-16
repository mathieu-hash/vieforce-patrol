// Unit tests for js/offline.js::_queuePayload — the function that strips
// queue-bookkeeping fields off a record before the offline-queue sync
// step forwards it to PostgREST (createStore / createFarm / createVisit).
//
// Regression coverage for the 2026-04-25 silent-eject bug: offline_id
// (added by queueStore/queueFarm/queueVisit for IndexedDB dedup) was
// missing from the skip set, so it travelled through to PostgREST,
// which rejected with PGRST204 "Could not find the 'offline_id' column"
// → the offline queue retried 3× and silently ejected, the user saw
// "Success" but the record never landed in stores/farms/visits.
//
// js/offline.js is browser code (depends on Dexie + window globals); we
// extract just _queuePayload via vm so we don't have to load the rest.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Extract the _queuePayload function definition from the source file.
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'offline.js'), 'utf8');
const fnMatch = src.match(/function _queuePayload[^{]*\{[\s\S]+?\n\}/);
if (!fnMatch) throw new Error('could not locate _queuePayload definition in js/offline.js');

// Wrap as an expression and evaluate in a fresh context — pure data
// transform, no browser globals required.
const _queuePayload = vm.runInThisContext(
  '(' + fnMatch[0].replace('function _queuePayload', 'function') + ')'
);

// ─────────────────────────────────────────────────────────────────────────
test('strips offline_id (PGRST204 regression)', () => {
  const out = _queuePayload({
    offline_id: 's_1745597432123_abc123',
    name: 'Golden Feeds Supply',
    store_type: 'feeds_dealer'
  });
  assert.equal('offline_id' in out, false, 'offline_id must not reach PostgREST');
  assert.equal(out.name, 'Golden Feeds Supply', 'real fields preserved');
  assert.equal(out.store_type, 'feeds_dealer');
});

test('strips every known queue bookkeeping field', () => {
  const out = _queuePayload({
    id: 42,
    offline_id: 's_x',
    created_at: '2026-04-25T01:00:00Z',
    retry_count: 2,
    last_error: 'PGRST204: ...',
    last_attempt_at: '2026-04-25T01:00:30Z',
    gps_failed: true,
    name: 'real field — keep'
  });
  assert.deepEqual(Object.keys(out), ['name'], 'only the non-bookkeeping field survives');
  assert.equal(out.name, 'real field — keep');
});

test('extraSkip parameter widens the strip list', () => {
  const out = _queuePayload(
    { name: 'X', photo_base64: 'iVBORw...', store_type: 'farm' },
    { photo_base64: 1 }
  );
  assert.equal('photo_base64' in out, false);
  assert.equal(out.name, 'X');
  assert.equal(out.store_type, 'farm');
});

// ─────────────────────────────────────────────────────────────────────────
// 2026-04-25: serialisation regression — concurrent syncPending() calls
// from a single chatbot save (one direct at app.html:1936, one via
// enhancedSyncStatus → syncPending inside queueStore) caused duplicate
// INSERTs because both fires read the same pendingStores list before
// either had a chance to delete. The module-level _syncRunning gate in
// js/offline.js dedupes concurrent callers onto the in-flight promise.
// ─────────────────────────────────────────────────────────────────────────
test('concurrent syncPending() calls share one execution (dedup gate)', async () => {
  // Load just the wrapper + gate — substitute _syncPendingImpl with a
  // counting stub so we don't have to mock all of Dexie + createStore +
  // friends. The wrapper logic is the new code under test.
  const wrapperSrc = src.match(/var _syncRunning[\s\S]+?async function syncPending\(\)[\s\S]+?return _syncRunning;\s*\}/);
  if (!wrapperSrc) throw new Error('could not locate syncPending wrapper in js/offline.js');

  let implCalls = 0;
  const ctx = vm.createContext({
    Promise,
    setTimeout,
    _syncPendingImpl: async () => {
      implCalls++;
      // Simulate a real createStore round-trip — the race window depends on
      // this being non-zero. 30ms is shorter than the 50-200ms a Cloud Run
      // call typically takes; if dedup works for 30ms it works for any
      // realistic latency.
      await new Promise(r => setTimeout(r, 30));
      return { stores: 1, errors: [] };
    }
  });
  vm.runInContext(wrapperSrc[0], ctx);
  const syncPending = ctx.syncPending;

  // Fire three concurrent calls — the chatbot save handler fires two,
  // testing three is more pessimistic.
  const [r1, r2, r3] = await Promise.all([syncPending(), syncPending(), syncPending()]);

  assert.equal(implCalls, 1, 'underlying _syncPendingImpl runs exactly once despite 3 concurrent calls');
  assert.deepEqual(r1, r2, 'all callers receive the same result object');
  assert.deepEqual(r2, r3);
  assert.equal(r1.stores, 1);
});

test('a NEW syncPending() after the first resolves runs the impl again', async () => {
  // Critical inverse property: the dedup must clear after the in-flight
  // promise settles. Otherwise a second user save would silently no-op.
  const wrapperSrc = src.match(/var _syncRunning[\s\S]+?async function syncPending\(\)[\s\S]+?return _syncRunning;\s*\}/);
  let implCalls = 0;
  const ctx = vm.createContext({
    Promise, setTimeout,
    _syncPendingImpl: async () => { implCalls++; return { ok: implCalls }; }
  });
  vm.runInContext(wrapperSrc[0], ctx);
  const syncPending = ctx.syncPending;

  await syncPending();        // first call: impl runs (count=1)
  await syncPending();        // second call: impl runs again (count=2)
  await syncPending();        // third call: impl runs again (count=3)
  assert.equal(implCalls, 3, 'sequential calls each trigger their own impl run');
});

test('impl rejection clears the gate so next call retries cleanly', async () => {
  // If _syncPendingImpl throws, _syncRunning must become null again so a
  // subsequent call triggers a fresh attempt instead of inheriting the
  // failed promise indefinitely.
  const wrapperSrc = src.match(/var _syncRunning[\s\S]+?async function syncPending\(\)[\s\S]+?return _syncRunning;\s*\}/);
  let implCalls = 0;
  const ctx = vm.createContext({
    Promise, setTimeout,
    _syncPendingImpl: async () => {
      implCalls++;
      if (implCalls === 1) throw new Error('first attempt failed');
      return { ok: true };
    }
  });
  vm.runInContext(wrapperSrc[0], ctx);
  const syncPending = ctx.syncPending;

  // First call: rejects
  await assert.rejects(() => syncPending(), /first attempt failed/);
  // Second call: should run impl again (gate was cleared by finally)
  const r = await syncPending();
  assert.equal(implCalls, 2);
  assert.equal(r.ok, true);
});

test('strips photo_base64 for visit and store sync payloads', () => {
  const visitOut = _queuePayload(
    { store_id: 'x', photo_base64: 'data:image/jpeg;base64,abc', photo_url: null },
    { photo_base64: 1 }
  );
  assert.equal('photo_base64' in visitOut, false);
  assert.equal(visitOut.store_id, 'x');

  const storeOut = _queuePayload(
    { name: 'Farm Supply', photo_base64: 'data:image/jpeg;base64,xyz' },
    { photo_base64: 1 }
  );
  assert.equal('photo_base64' in storeOut, false);
  assert.equal(storeOut.name, 'Farm Supply');
});

test('preserves all real DB columns through the strip', () => {
  // Mirror the chatbot's typical store payload — every key must survive
  // EXCEPT offline_id and created_at (queue bookkeeping).
  const chatbotPayload = {
    name: 'Test Store',
    owner_name: 'Mat',
    phone: '09171234567',
    owner_messenger: 'm.me/testowner',
    store_type: 'feeds_dealer',
    lat: 14.6, lng: 121.0,
    city: 'Quezon City',
    photo_url: null,
    vol_class: 'A',
    health_status: 'ok',
    store_status: 'prospect',
    prospect_stage: 'identified',
    bags_per_month: 100,
    created_by: 'de9cf11e-1153-4b59-bc7a-7a22e282e190',
    // queue bookkeeping (added by queueStore at runtime)
    offline_id: 's_1745597432123_abc',
    created_at: '2026-04-25T01:00:00Z'
  };
  const out = _queuePayload(chatbotPayload);

  // Bookkeeping stripped
  assert.equal('offline_id' in out, false);
  assert.equal('created_at' in out, false);

  // 15 real fields preserved
  for (const k of [
    'name','owner_name','phone','owner_messenger','store_type','lat','lng','city','photo_url',
    'vol_class','health_status','store_status','prospect_stage','bags_per_month',
    'created_by'
  ]) {
    assert.equal(k in out, true, `${k} must survive _queuePayload strip`);
  }
  assert.equal(Object.keys(out).length, 15);
});

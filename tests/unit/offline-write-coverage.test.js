// Unit tests for js/offline.js Wave 2 write-coverage (Audit D O3 + O4).
//
// Verifies that the four new enqueue helpers (queueStoreUpdate,
// queueAssignment, queueVisitTouch, queueProfileEdit) write to IndexedDB
// before any network call, and that the sync worker drains all four new
// tables (pendingStoreUpdates, pendingAssignments, pendingVisitTouches,
// pendingProfileEdits).
//
// js/offline.js is browser code (depends on Dexie + window globals); we
// load it into a vm context with a hand-rolled Dexie stub modeled on the
// existing offline-queue-payload.test.js pattern.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'offline.js'),
  'utf8'
);

// ─── Dexie stub ────────────────────────────────────────────────────────
// Minimal in-memory table that mimics the slice of the Dexie API the
// offline-queue code actually uses: .add, .delete, .clear, .count,
// .toArray, .put, .bulkPut.
function makeTable() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    add(record) {
      const copy = Object.assign({}, record);
      copy.id = nextId++;
      rows.push(copy);
      return Promise.resolve(copy.id);
    },
    put(record) {
      const idx = rows.findIndex(r => r.id === record.id);
      if (idx >= 0) rows[idx] = Object.assign({}, record);
      else { rows.push(Object.assign({}, record)); }
      return Promise.resolve(record.id);
    },
    delete(id) {
      const idx = rows.findIndex(r => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
      return Promise.resolve();
    },
    clear() { rows.length = 0; return Promise.resolve(); },
    count() { return Promise.resolve(rows.length); },
    toArray() { return Promise.resolve(rows.slice()); },
    bulkPut(records) {
      for (const r of records) {
        const idx = rows.findIndex(x => x.id === r.id);
        if (idx >= 0) rows[idx] = Object.assign({}, r);
        else rows.push(Object.assign({}, r));
      }
      return Promise.resolve();
    }
  };
}

function makeDexieStub() {
  // Returned constructor swallows the schema declarations and produces
  // a db object with one in-memory table per declared store name.
  function Dexie() {
    this._tables = {};
    this.version = function () {
      return {
        stores: (schema) => {
          for (const name of Object.keys(schema)) {
            if (!this._tables[name]) {
              this._tables[name] = makeTable();
              Object.defineProperty(this, name, {
                configurable: true,
                get: () => this._tables[name]
              });
            }
          }
          return this;
        }
      };
    };
  }
  return Dexie;
}

function loadOffline({ online = true, stubs = {} } = {}) {
  const ctx = {
    Dexie: makeDexieStub(),
    Promise, setTimeout, setImmediate, queueMicrotask,
    console,
    navigator: { onLine: online },
    window: {},
    Date,
    Math,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    Uint8Array, Blob: class { constructor(parts, opts){ this.parts=parts; this.opts=opts; } }
  };
  // Server-side stubs that the sync drain expects to find as globals.
  Object.assign(ctx, {
    createVisit: stubs.createVisit || (async () => {}),
    createStore: stubs.createStore || (async () => {}),
    createFarm:  stubs.createFarm  || (async () => {}),
    updateStore: stubs.updateStore || (async () => {}),
    updateUser:  stubs.updateUser  || (async () => {}),
    _rawAssignStores:   stubs._rawAssignStores   || (async () => {}),
    _rawUnassignStores: stubs._rawUnassignStores || (async () => {}),
    _rawAssignFarms:    stubs._rawAssignFarms    || (async () => {}),
    _rawUnassignFarms:  stubs._rawUnassignFarms  || (async () => {}),
    uploadPhoto: stubs.uploadPhoto || (async () => null),
    getSession:  stubs.getSession  || (() => ({ id: 'test-user' })),
    enhancedSyncStatus: () => {},
    patrolUpdatePilotCard: () => {},
    patrolIsLikelyDuplicateInsertError: () => false
  });
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. queueStoreUpdate writes to IDB
// ─────────────────────────────────────────────────────────────────────────
test('queueStoreUpdate writes to pendingStoreUpdates table', async () => {
  const ctx = loadOffline({ online: false });
  await ctx.queueStoreUpdate({
    store_id: 'store-uuid-1',
    patch: { store_status: 'active' }
  });
  const rows = await ctx.offlineDb.pendingStoreUpdates.toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].store_id, 'store-uuid-1');
  assert.deepEqual(rows[0].patch, { store_status: 'active' });
  assert.match(rows[0].offline_id, /^su_/, 'offline_id has su_ prefix');
  assert.ok(rows[0].created_at, 'created_at stamped');
});

// ─────────────────────────────────────────────────────────────────────────
// 2. queueAssignment writes to IDB
// ─────────────────────────────────────────────────────────────────────────
test('queueAssignment writes to pendingAssignments table', async () => {
  const ctx = loadOffline({ online: false });
  await ctx.queueAssignment({
    kind: 'store',
    tsr_id: 'tsr-uuid-1',
    store_id: 'store-uuid-1'
  });
  await ctx.queueAssignment({
    kind: 'farm',
    tsr_id: null,
    store_id: 'farm-uuid-1'
  });
  const rows = await ctx.offlineDb.pendingAssignments.toArray();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, 'store');
  assert.equal(rows[0].tsr_id, 'tsr-uuid-1');
  assert.equal(rows[1].kind, 'farm');
  assert.equal(rows[1].tsr_id, null, 'null tsr_id = unassign');
  assert.match(rows[0].offline_id, /^a_/);
});

// ─────────────────────────────────────────────────────────────────────────
// 3. queueVisitTouch writes to IDB
// ─────────────────────────────────────────────────────────────────────────
test('queueVisitTouch writes to pendingVisitTouches table', async () => {
  const ctx = loadOffline({ online: false });
  const ts = '2026-05-21T10:00:00Z';
  await ctx.queueVisitTouch({ store_id: 'store-uuid-1', visited_at: ts });
  const rows = await ctx.offlineDb.pendingVisitTouches.toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].store_id, 'store-uuid-1');
  assert.equal(rows[0].visited_at, ts);
  assert.match(rows[0].offline_id, /^vt_/);
});

// ─────────────────────────────────────────────────────────────────────────
// 4. queueProfileEdit writes to IDB
// ─────────────────────────────────────────────────────────────────────────
test('queueProfileEdit writes to pendingProfileEdits table', async () => {
  const ctx = loadOffline({ online: false });
  await ctx.queueProfileEdit({
    user_id: 'user-uuid-1',
    patch: { name: 'Updated Name', is_active: true }
  });
  const rows = await ctx.offlineDb.pendingProfileEdits.toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, 'user-uuid-1');
  assert.deepEqual(rows[0].patch, { name: 'Updated Name', is_active: true });
  assert.match(rows[0].offline_id, /^pe_/);
});

// ─────────────────────────────────────────────────────────────────────────
// 5. sync worker drains all four new stores
// ─────────────────────────────────────────────────────────────────────────
test('syncPending drains all four new Wave 2 stores', async () => {
  const calls = {
    updateStore: [],
    updateUser: [],
    _rawAssignStores: [],
    _rawAssignFarms: [],
    _rawUnassignStores: [],
    _rawUnassignFarms: []
  };
  const ctx = loadOffline({
    online: false, // start offline so queue helpers don't auto-drain
    stubs: {
      updateStore: async (id, patch) => { calls.updateStore.push({ id, patch }); },
      updateUser:  async (id, patch) => { calls.updateUser.push({ id, patch }); },
      _rawAssignStores:   async (ids, tsr) => { calls._rawAssignStores.push({ ids, tsr }); },
      _rawUnassignStores: async (ids)      => { calls._rawUnassignStores.push({ ids }); },
      _rawAssignFarms:    async (ids, tsr) => { calls._rawAssignFarms.push({ ids, tsr }); },
      _rawUnassignFarms:  async (ids)      => { calls._rawUnassignFarms.push({ ids }); }
    }
  });

  // Seed all four new stores while "offline"
  await ctx.queueStoreUpdate({ store_id: 's1', patch: { store_status: 'active' } });
  await ctx.queueAssignment({ kind: 'store', tsr_id: 't1', store_id: 's2' });
  await ctx.queueAssignment({ kind: 'farm',  tsr_id: null, store_id: 'f1' });
  await ctx.queueVisitTouch({ store_id: 's3', visited_at: '2026-05-21T11:00:00Z' });
  await ctx.queueProfileEdit({ user_id: 'u1', patch: { name: 'New' } });

  // Sanity: rows are present before drain
  assert.equal((await ctx.offlineDb.pendingStoreUpdates.toArray()).length, 1);
  assert.equal((await ctx.offlineDb.pendingAssignments.toArray()).length, 2);
  assert.equal((await ctx.offlineDb.pendingVisitTouches.toArray()).length, 1);
  assert.equal((await ctx.offlineDb.pendingProfileEdits.toArray()).length, 1);

  // Drain
  const results = await ctx.syncPending();

  // Each table emptied
  assert.equal((await ctx.offlineDb.pendingStoreUpdates.toArray()).length, 0,
    'pendingStoreUpdates drained');
  assert.equal((await ctx.offlineDb.pendingAssignments.toArray()).length, 0,
    'pendingAssignments drained');
  assert.equal((await ctx.offlineDb.pendingVisitTouches.toArray()).length, 0,
    'pendingVisitTouches drained');
  assert.equal((await ctx.offlineDb.pendingProfileEdits.toArray()).length, 0,
    'pendingProfileEdits drained');

  // Each server stub called the right number of times
  assert.equal(calls.updateStore.length, 2,
    'updateStore called for both pendingStoreUpdates (1) AND pendingVisitTouches (1)');
  assert.equal(calls._rawAssignStores.length, 1, '_rawAssignStores called for store assignment');
  assert.equal(calls._rawAssignStores[0].tsr, 't1');
  // ids array was constructed inside the vm context — compare by content,
  // not by constructor identity (deepStrictEqual fails cross-realm).
  assert.equal(calls._rawAssignStores[0].ids.length, 1);
  assert.equal(calls._rawAssignStores[0].ids[0], 's2');
  assert.equal(calls._rawUnassignFarms.length, 1, '_rawUnassignFarms called for null-tsr farm assignment');
  assert.equal(calls._rawUnassignFarms[0].ids.length, 1);
  assert.equal(calls._rawUnassignFarms[0].ids[0], 'f1');
  assert.equal(calls.updateUser.length, 1, 'updateUser called for profile edit');
  assert.equal(calls.updateUser[0].id, 'u1');

  // Results carry per-type counts
  assert.equal(results.storeUpdates, 1);
  assert.equal(results.assignments, 2);
  assert.equal(results.visitTouches, 1);
  assert.equal(results.profileEdits, 1);
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Queue helpers auto-drain when online
// ─────────────────────────────────────────────────────────────────────────
test('queue helpers attempt sync when navigator.onLine is true', async () => {
  let updateStoreCalls = 0;
  const ctx = loadOffline({
    online: true,
    stubs: {
      updateStore: async () => { updateStoreCalls++; }
    }
  });

  await ctx.queueStoreUpdate({ store_id: 's1', patch: { name: 'X' } });

  // Immediate sync should have drained the row
  assert.equal(updateStoreCalls, 1,
    'updateStore called once during the auto-drain after queueStoreUpdate');
  assert.equal((await ctx.offlineDb.pendingStoreUpdates.toArray()).length, 0,
    'row removed from IDB after successful drain');
});

// ─────────────────────────────────────────────────────────────────────────
// Bonus regression: when offline, queue helpers MUST NOT call the server.
// This is the heart of RULE 1 (IDB first, network never) for the new
// write paths.
// ─────────────────────────────────────────────────────────────────────────
test('queue helpers do NOT call server stubs when offline', async () => {
  let serverCalls = 0;
  const ctx = loadOffline({
    online: false,
    stubs: {
      updateStore: async () => { serverCalls++; },
      updateUser:  async () => { serverCalls++; },
      _rawAssignStores: async () => { serverCalls++; }
    }
  });

  await ctx.queueStoreUpdate({ store_id: 's1', patch: {} });
  await ctx.queueAssignment({ kind: 'store', tsr_id: 't1', store_id: 's2' });
  await ctx.queueVisitTouch({ store_id: 's3', visited_at: '2026-05-21T11:00:00Z' });
  await ctx.queueProfileEdit({ user_id: 'u1', patch: { name: 'X' } });

  assert.equal(serverCalls, 0,
    'no server call occurred while offline — RULE 1: IDB first, sync second');
});

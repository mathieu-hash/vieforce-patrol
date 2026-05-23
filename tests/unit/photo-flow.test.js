// Unit tests for the insert→upload→patch photo flow in js/offline.js +
// js/camera.js. Closes Audit D O5 / 2026-04 H-03.
//
// The flow under test:
//   Step 1 — INSERT row with photo_url=NULL → row_id back.
//   Step 2 — Upload blob to {tsr_id}/{YYYY-MM-DD}/{row_id}.jpg (deterministic
//            path, upsert:true so retries overwrite — no orphans).
//   Step 3 — PATCH the row with photo_url.
//
// Failure at any step is rescue-able: the row exists in the DB, the path is
// deterministic, the queue record carries _inserted_row_id / _uploaded_photo_url
// flags so retries skip already-completed steps.
//
// Both files load browser globals (Dexie, supabaseClient, document, window),
// so we extract just the functions under test via vm and inject minimal
// mocks. Same pattern as offline-queue-payload.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const offlineSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'offline.js'), 'utf8');
const cameraSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'camera.js'), 'utf8');

// Extract _syncOnePhotoRecord, _queuePayload, buildPhotoPath as evaluable
// expressions. The async function syntax means we keep the exact signature.
function extractFn(src, name) {
  // Match an `async function NAME(...) { ... }` or `function NAME(...) { ... }`
  // body, balancing braces.
  var re = new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  var m = src.match(re);
  if (!m) throw new Error('could not find function ' + name);
  var start = m.index;
  var i = src.indexOf('{', start);
  var depth = 1;
  i++;
  while (i < src.length && depth > 0) {
    var c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return src.slice(start, i);
}

// Build a fresh sandbox that holds:
//   - the mocked supabaseClient (Storage + from())
//   - a tiny Dexie-like in-memory table for pendingVisits/pendingStores
//   - mock createStore / createVisit returning inserted rows with .id
//   - the actual _syncOnePhotoRecord under test
//
// Each test gets a fresh sandbox so state never leaks across tests.
function makeSandbox(opts) {
  opts = opts || {};

  // Track every Storage call (path, options) so assertions can verify
  // deterministic-path + upsert behavior.
  var uploadCalls = [];
  var patchCalls = [];
  var publicUrlCalls = [];

  // Simulated row store, keyed by `${table}:${id}`. createX inserts; the
  // .from(table).update().eq() chain reads + writes this map.
  var rows = new Map();
  var nextRowId = 1;

  // Mock supabaseClient — chainable mimic of @supabase/supabase-js@2.
  var supabaseClient = {
    storage: {
      from: function (bucket) {
        return {
          upload: async function (p, blob, options) {
            uploadCalls.push({ bucket: bucket, path: p, options: options, size: blob && blob.size });
            if (opts.uploadFails) return { data: null, error: { message: 'mock upload failure' } };
            return { data: { path: p }, error: null };
          },
          getPublicUrl: function (p) {
            publicUrlCalls.push(p);
            return { data: { publicUrl: 'https://mock.supabase.co/storage/' + bucket + '/' + p } };
          },
          remove: async function (paths) {
            return { data: paths, error: null };
          },
          list: async function (prefix, listOpts) {
            return { data: [], error: null };
          }
        };
      }
    },
    from: function (table) {
      return {
        update: function (patch) {
          return {
            eq: async function (col, val) {
              patchCalls.push({ table: table, col: col, val: val, patch: patch });
              if (opts.patchFails) return { error: { message: 'mock patch failure' } };
              var key = table + ':' + val;
              var existing = rows.get(key) || { id: val };
              Object.assign(existing, patch);
              rows.set(key, existing);
              return { error: null };
            }
          };
        }
      };
    }
  };

  // Minimal in-memory Dexie table (just enough surface for the code under test).
  function makeTable() {
    var data = new Map();
    var nextId = 1;
    return {
      add: async function (rec) { rec.id = nextId++; data.set(rec.id, rec); return rec.id; },
      put: async function (rec) { data.set(rec.id, rec); return rec.id; },
      delete: async function (id) { data.delete(id); },
      toArray: async function () { return Array.from(data.values()); },
      _peek: function () { return data; }
    };
  }
  var pendingVisits = makeTable();
  var pendingStores = makeTable();

  // Mock createStore / createVisit — they insert into the simulated `rows`
  // map and return the inserted row with a fresh id.
  async function createStore(payload) {
    if (opts.insertFails && opts.insertFails === 'store') throw new Error('mock createStore failure');
    var id = 'store-' + (nextRowId++);
    var row = Object.assign({ id: id }, payload);
    rows.set('stores:' + id, row);
    return row;
  }
  async function createVisit(payload) {
    if (opts.insertFails && opts.insertFails === 'visit') throw new Error('mock createVisit failure');
    var id = 'visit-' + (nextRowId++);
    var row = Object.assign({ id: id }, payload);
    rows.set('visits:' + id, row);
    return row;
  }

  // Mock getSession — returns a TSR session id used to build the path.
  function getSession() { return { id: opts.tsr_id || 'tsr-uuid-123' }; }

  // Build sandbox with everything the extracted code refers to.
  var sandbox = {
    Promise: Promise,
    setTimeout: setTimeout,
    console: { warn: function () {}, error: function () {}, info: function () {} },
    supabaseClient: supabaseClient,
    pendingVisits: pendingVisits,
    pendingStores: pendingStores,
    createStore: createStore,
    createVisit: createVisit,
    getSession: getSession,
    Blob: function (parts, opts) { this.size = (parts && parts[0] && parts[0].length) || 0; this.type = (opts && opts.type) || ''; },
    atob: function (b64) { return Buffer.from(b64, 'base64').toString('binary'); },
    Uint8Array: Uint8Array
  };

  // Inject helpers from offline.js that _syncOnePhotoRecord depends on.
  vm.createContext(sandbox);
  vm.runInContext(extractFn(offlineSrc, '_queuePayload'), sandbox);
  vm.runInContext(extractFn(offlineSrc, '_base64ToBlob'), sandbox);
  // Inject uploadPhoto + buildPhotoPath + patchPhotoUrl from camera.js
  vm.runInContext(extractFn(cameraSrc, 'buildPhotoPath'), sandbox);
  // Inject a no-op _maybeWarnCellularUpload and _showDataUsage referenced
  // by uploadPhoto.
  vm.runInContext('function _maybeWarnCellularUpload(){} function _showDataUsage(){}', sandbox);
  vm.runInContext(extractFn(cameraSrc, 'uploadPhoto'), sandbox);
  vm.runInContext(extractFn(cameraSrc, 'patchPhotoUrl'), sandbox);
  // Finally inject _syncOnePhotoRecord itself.
  vm.runInContext(extractFn(offlineSrc, '_syncOnePhotoRecord'), sandbox);

  // Return everything tests need to assert against.
  return {
    sandbox: sandbox,
    uploadCalls: uploadCalls,
    patchCalls: patchCalls,
    publicUrlCalls: publicUrlCalls,
    rows: rows,
    pendingVisits: pendingVisits,
    pendingStores: pendingStores
  };
}

// Build a typical pending-visit record with a photo as base64 data URL.
function visitRecord(overrides) {
  var rec = {
    id: 1, // Dexie ++id
    offline_id: 'v_1745597432123_abc',
    created_at: '2026-04-25T01:00:00Z',
    store_id: 'store-xyz',
    tsr_id: 'tsr-uuid-123',
    visited_at: '2026-04-25T01:00:00Z',
    outcome: 'with_order',
    notes: 'Bisitang regular',
    photo_url: null,
    // 1×1 JPEG-ish base64 data URL — _base64ToBlob just needs it to parse
    photo_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  };
  if (overrides) Object.assign(rec, overrides);
  return rec;
}

// ─────────────────────────────────────────────────────────────────────────
test('happy path: INSERT row → upload to deterministic path → PATCH row', async () => {
  var s = makeSandbox({ tsr_id: 'tsr-mat-1' });
  var rec = visitRecord();
  await s.pendingVisits.put(rec);

  await s.sandbox._syncOnePhotoRecord(rec, {
    table: 'visits',
    store: s.pendingVisits,
    createFn: s.sandbox.createVisit,
    label: 'Visit'
  });

  // One insert happened (createVisit was called once → one visits row exists).
  var visitKeys = Array.from(s.rows.keys()).filter(function (k) { return k.startsWith('visits:'); });
  assert.equal(visitKeys.length, 1, 'exactly one visit inserted');
  var inserted = s.rows.get(visitKeys[0]);
  assert.ok(inserted.id, 'inserted row has an id');
  // photo_url on INSERT must be null (the whole point — see Audit D O5 fix).
  // After the subsequent patch it's set to the public URL.
  assert.match(inserted.photo_url, /storage\/patrol-photos\//);

  // Exactly one upload happened.
  assert.equal(s.uploadCalls.length, 1);
  // Path is deterministic: {tsr_id}/{YYYY-MM-DD}/{row_id}.jpg
  var today = new Date().toISOString().slice(0, 10);
  assert.equal(s.uploadCalls[0].path, 'tsr-mat-1/' + today + '/' + inserted.id + '.jpg');
  // upsert:true is required so retries overwrite (no orphans).
  assert.equal(s.uploadCalls[0].options.upsert, true);

  // Exactly one PATCH (from uploadPhoto). The queue record is deleted.
  assert.equal(s.patchCalls.length, 1);
  assert.equal(s.patchCalls[0].table, 'visits');
  assert.equal(s.patchCalls[0].val, inserted.id);
  assert.match(s.patchCalls[0].patch.photo_url, /storage\/patrol-photos\//);

  var remaining = await s.pendingVisits.toArray();
  assert.equal(remaining.length, 0, 'queue record drained after full success');
});

// ─────────────────────────────────────────────────────────────────────────
test('rescue: INSERT succeeds, UPLOAD fails → row exists with photo_url=NULL, queue remembers row_id', async () => {
  var s = makeSandbox({ tsr_id: 'tsr-mat-1', uploadFails: true });
  var rec = visitRecord();
  await s.pendingVisits.put(rec);

  await assert.rejects(
    () => s.sandbox._syncOnePhotoRecord(rec, {
      table: 'visits',
      store: s.pendingVisits,
      createFn: s.sandbox.createVisit,
      label: 'Visit'
    }),
    /Upload failed/
  );

  // Row was INSERTed — that's the rescue invariant.
  var visitKeys = Array.from(s.rows.keys()).filter(function (k) { return k.startsWith('visits:'); });
  assert.equal(visitKeys.length, 1, 'visit row exists post-upload-failure (rescuable)');
  var inserted = s.rows.get(visitKeys[0]);
  // photo_url remains NULL because the upload (and therefore the patch) never landed.
  assert.equal(inserted.photo_url, null, 'photo_url stays NULL when upload fails');

  // Zero PATCH calls — uploadPhoto throws before reaching its patch step.
  assert.equal(s.patchCalls.length, 0);

  // The queue record persists with _inserted_row_id set, so next retry
  // skips INSERT and resumes from UPLOAD.
  var queued = await s.pendingVisits.toArray();
  assert.equal(queued.length, 1);
  assert.equal(queued[0]._inserted_row_id, inserted.id);
  assert.equal(queued[0]._uploaded_photo_url || null, null);
});

// ─────────────────────────────────────────────────────────────────────────
test('retry after upload-succeeded-but-PATCH-failed: re-PATCH only, no re-upload', async () => {
  // First pass: upload succeeds, the row-update (inside uploadPhoto) fails.
  var s = makeSandbox({ tsr_id: 'tsr-mat-1', patchFails: true });
  var rec = visitRecord();
  await s.pendingVisits.put(rec);

  await assert.rejects(
    () => s.sandbox._syncOnePhotoRecord(rec, {
      table: 'visits',
      store: s.pendingVisits,
      createFn: s.sandbox.createVisit,
      label: 'Visit'
    }),
    /Photo uploaded but row patch failed/
  );

  // After the first pass: one upload, one (failed) patch, queue still has the
  // record with _uploaded_photo_url remembered.
  assert.equal(s.uploadCalls.length, 1);
  assert.equal(s.patchCalls.length, 1);
  var queued = await s.pendingVisits.toArray();
  assert.equal(queued.length, 1);
  assert.ok(queued[0]._inserted_row_id, 'row id remembered');
  assert.ok(queued[0]._uploaded_photo_url, 'uploaded URL remembered for re-PATCH retry');

  // Flip the patch-fail flag off to simulate the second sync pass succeeding.
  // We need to do this through the same sandbox, so rebuild a fresh sandbox
  // with patch enabled and replay the (now-augmented) queue record. The new
  // sandbox starts with the same supabase mock that ACCEPTS the patch.
  var s2 = makeSandbox({ tsr_id: 'tsr-mat-1' });
  var carried = queued[0];
  await s2.pendingVisits.put(carried);

  await s2.sandbox._syncOnePhotoRecord(carried, {
    table: 'visits',
    store: s2.pendingVisits,
    createFn: s2.sandbox.createVisit,
    label: 'Visit'
  });

  // Critical: zero new uploads on the retry pass.
  assert.equal(s2.uploadCalls.length, 0, 'NO re-upload on a re-PATCH retry');
  // Exactly one patch on the retry pass.
  assert.equal(s2.patchCalls.length, 1);
  assert.equal(s2.patchCalls[0].patch.photo_url, carried._uploaded_photo_url);
  // Queue drained.
  assert.equal((await s2.pendingVisits.toArray()).length, 0);
});

// ─────────────────────────────────────────────────────────────────────────
test('same row uploaded twice → same path (overwrite, not orphan)', async () => {
  // This is the H-03 regression check. With the old Date.now()-based path,
  // two attempts would produce two distinct Storage objects. With the
  // deterministic {tsr_id}/{day}/{row_id}.jpg path + upsert:true, both
  // attempts hit the SAME path.
  var s = makeSandbox({ tsr_id: 'tsr-mat-1' });
  var rec1 = visitRecord({ id: 1 });
  await s.pendingVisits.put(rec1);
  await s.sandbox._syncOnePhotoRecord(rec1, {
    table: 'visits',
    store: s.pendingVisits,
    createFn: s.sandbox.createVisit,
    label: 'Visit'
  });

  // Capture the row_id assigned to the first record + its upload path.
  var firstUploadPath = s.uploadCalls[0].path;

  // Now simulate a retry: re-queue the SAME record (Dexie put) carrying
  // _inserted_row_id from the first pass and call sync again. The flow
  // should skip INSERT (no new row), re-upload to the SAME path (upsert),
  // re-PATCH.
  var carried = visitRecord({
    id: 2, // new Dexie ++id, but same logical record
    _inserted_row_id: firstUploadPath.match(/\/([^/]+)\.jpg$/)[1],
    _uploaded_photo_url: null // simulate retry where the URL wasn't remembered
  });
  await s.pendingVisits.put(carried);
  await s.sandbox._syncOnePhotoRecord(carried, {
    table: 'visits',
    store: s.pendingVisits,
    createFn: s.sandbox.createVisit,
    label: 'Visit'
  });

  // Two upload calls in total, BOTH at the same deterministic path.
  assert.equal(s.uploadCalls.length, 2);
  assert.equal(s.uploadCalls[0].path, s.uploadCalls[1].path,
    'retry must upload to the SAME path — no orphan blob');
  // Both with upsert:true (the only safe overwrite mode).
  assert.equal(s.uploadCalls[0].options.upsert, true);
  assert.equal(s.uploadCalls[1].options.upsert, true);
});

// ─────────────────────────────────────────────────────────────────────────
test('deterministic path format = {tsr_id}/{YYYY-MM-DD}/{row_id}.jpg', async () => {
  // buildPhotoPath is the single source of truth for the deterministic path
  // shape. Lock it down so a future refactor cannot reintroduce orphan-prone
  // Date.now()-based paths.
  var s = makeSandbox();
  var buildPhotoPath = s.sandbox.buildPhotoPath;

  assert.equal(
    buildPhotoPath('tsr-abc', 'row-123', '2026-04-25'),
    'tsr-abc/2026-04-25/row-123.jpg'
  );

  // Today's date is the default.
  var today = new Date().toISOString().slice(0, 10);
  assert.equal(
    buildPhotoPath('tsr-abc', 'row-123'),
    'tsr-abc/' + today + '/row-123.jpg'
  );

  // Missing tsr_id / row_id fall back to 'unknown' rather than producing
  // a malformed path like '//foo.jpg' that would break list() prefixing.
  assert.equal(buildPhotoPath('', '', '2026-04-25'), 'unknown/2026-04-25/unknown.jpg');

  // Verify the live path used during a real sync matches this format.
  var s2 = makeSandbox({ tsr_id: 'tsr-mat-real' });
  var rec = visitRecord();
  await s2.pendingVisits.put(rec);
  await s2.sandbox._syncOnePhotoRecord(rec, {
    table: 'visits',
    store: s2.pendingVisits,
    createFn: s2.sandbox.createVisit,
    label: 'Visit'
  });
  var actualPath = s2.uploadCalls[0].path;
  assert.match(
    actualPath,
    /^tsr-mat-real\/\d{4}-\d{2}-\d{2}\/visit-\d+\.jpg$/,
    'live upload path matches deterministic format'
  );
});

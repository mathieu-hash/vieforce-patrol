// Offline Module — Dexie.js IndexedDB queue for offline-first

var offlineDb = new Dexie('PatrolOffline');

function _ensureOfflineDb() {
  if (!offlineDb || !offlineDb.pendingVisits) {
    throw new Error('Offline queue not ready. I-retry.');
  }
  return offlineDb;
}

offlineDb.version(1).stores({
  pendingVisits: '++id, offline_id, created_at',
  pendingStores: '++id, offline_id, created_at',
  cachedStores: 'id, updated_at'
});

// v2: farms queue (Sprint A.1 — H-07)
offlineDb.version(2).stores({
  pendingVisits: '++id, offline_id, created_at',
  pendingStores: '++id, offline_id, created_at',
  pendingFarms:  '++id, offline_id, created_at',
  cachedStores:  'id, updated_at'
});

async function queueVisit(visitData) {
  visitData.offline_id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  visitData.created_at = new Date().toISOString();
  await _ensureOfflineDb().pendingVisits.add(visitData);
  // Update sync UI immediately after queue write
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
}

async function queueStore(storeData) {
  storeData.offline_id = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  storeData.created_at = new Date().toISOString();
  await _ensureOfflineDb().pendingStores.add(storeData);
  // Update sync UI immediately after queue write
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
}

async function queueFarm(farmData) {
  farmData.offline_id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  farmData.created_at = new Date().toISOString();
  await _ensureOfflineDb().pendingFarms.add(farmData);
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
}

var MAX_SYNC_RETRIES = 3;

// Strip queue bookkeeping fields before sending to server.
// `offline_id` MUST be in this list — it's added by queueStore/queueFarm/
// queueVisit (lines 28, 36, 19 above) for IndexedDB dedup, but the
// stores/farms/visits tables have no offline_id column, so leaving it on
// the payload triggers PostgREST PGRST204 ("Could not find the
// 'offline_id' column"), the offline queue retries 3× and silently ejects.
// Bug active since the queue was first wired; surfaced 2026-04-25 once
// the upstream stores_store_type_check constraint stopped masking it.
function _queuePayload(record, extraSkip) {
  var skip = {
    id: 1, offline_id: 1, created_at: 1, retry_count: 1,
    last_error: 1, last_attempt_at: 1, gps_failed: 1,
    // Photo-flow bookkeeping (Audit D O5 / H-03) — added by the
    // insert→upload→patch handler to track partial progress across retries.
    // None of these are real columns; leaving them on the payload would
    // re-trigger PGRST204 → silent eject (the exact 2026-04-25 bug class).
    _inserted_row_id: 1,
    _uploaded_photo_url: 1
  };
  if (extraSkip) for (var k in extraSkip) skip[k] = 1;
  var out = {};
  for (var key in record) { if (!skip[key]) out[key] = record[key]; }
  return out;
}

async function _markRetryOrEject(table, record, err, label) {
  var retries = (record.retry_count || 0) + 1;
  var msg = (err && err.message) || String(err);
  console.error('[sync] ' + label + ' fail (attempt ' + retries + '/' + MAX_SYNC_RETRIES + '):', msg, record);
  if (retries >= MAX_SYNC_RETRIES) {
    console.warn('[sync] ' + label + ' permanent fail — ejecting record', record.id, record);
    await table.delete(record.id);
    return 'ejected';
  }
  record.retry_count = retries;
  record.last_error = msg.slice(0, 500);
  record.last_attempt_at = new Date().toISOString();
  await table.put(record);
  return 'retry';
}

// 2026-04-25: serialise concurrent calls. Before this, _saveStoreFromChatbot
// at app.html:1936 fires syncPending() directly while queueStore (above)
// fires another via enhancedSyncStatus → syncPending. Both reach
// pendingStores.toArray() before either deletes, both call createStore on
// the same row, INSERT lands twice. Module-level _syncRunning holds the
// in-flight promise; concurrent callers receive the same promise and
// share its outcome. Slot is cleared in finally, so the next call (after
// the current one resolves) starts a fresh sync — no stale lock.
var _syncRunning = null;
var _lastSyncSummary = { ejected: 0, errors: 0 };

function _applySyncSummary(results) {
  _lastSyncSummary = {
    ejected: results.ejected || 0,
    errors: (results.errors && results.errors.length) || 0
  };
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
}

async function syncPending() {
  if (_syncRunning) return _syncRunning;
  _syncRunning = (async function () {
    try { return await _syncPendingImpl(); }
    finally { _syncRunning = null; }
  })();
  return _syncRunning;
}

// _syncOnePhotoRecord — drains ONE pending visit/store record through the
// insert-then-upload-then-patch flow. Throws on any step failure so the
// caller's retry/eject/duplicate-detection logic remains the single place
// that classifies the error. (Audit D O5; H-03)
//
// `record` is the IDB row; cfg = { table, store, createFn, label }.
//   - table:    'stores' | 'visits' (passed to uploadPhoto for the PATCH step)
//   - store:    the Dexie table to .put()/.delete()
//   - createFn: createStore / createVisit (returns row including .id)
//   - label:    'Store' | 'Visit' for diagnostics
async function _syncOnePhotoRecord(record, cfg) {
  var photoB64 = record.photo_base64 || null;
  // The base payload sent to createStore/createVisit. _queuePayload strips
  // both `photo_base64` (offline-only) AND the new _inserted_row_id /
  // _uploaded_photo_url bookkeeping fields (see the skip-set above) so the
  // INSERT body is identical to what the old code sent — preserves all
  // PGRST204 / constraint-rejection invariants. photo_url stays in the
  // payload (null on first INSERT, populated on a re-PATCH pass).
  var payload = _queuePayload(record, { photo_base64: 1 });

  // Step 1 — INSERT (skip if a prior pass already inserted)
  var row_id = record._inserted_row_id || null;
  if (!row_id) {
    // First INSERT pass: photo_url must be NULL. If a previous (pre-fix) sync
    // managed to set it from upload→insert, clear it — the photo's already
    // either uploaded with a non-deterministic path (orphan candidate; the
    // orphan-cleanup sweep handles it) or never uploaded at all.
    payload.photo_url = null;
    var inserted = await cfg.createFn(payload);
    if (!inserted || !inserted.id) {
      // Defensive — createStore/createVisit always return the row with id,
      // but if PostgREST/RLS ever started stripping the SELECT, surface it.
      throw new Error(cfg.label + ': insert returned no id');
    }
    row_id = inserted.id;
    // Persist progress so the next retry skips the insert step. Failure
    // between here and the upload step still leaves the row in the DB
    // (rescue-able, photo_url=NULL) and the queue record knows about it.
    record._inserted_row_id = row_id;
    await cfg.store.put(record);
  }

  // Step 2 — UPLOAD photo to deterministic path (skip if prior pass uploaded)
  // Skip silently when there's no photo to upload (legacy / no-photo visits).
  var photo_url = record._uploaded_photo_url || null;
  if (photoB64 && !photo_url && typeof uploadPhoto === 'function') {
    var blob = _base64ToBlob(photoB64);
    var session = (typeof getSession === 'function') ? getSession() : null;
    var tsr_id = (session && session.id) || record.tsr_id || record.created_by || 'unknown';
    // uploadPhoto({row_id, blob, tsr_id, table}) does:
    //   a. Upload to {tsr_id}/{YYYY-MM-DD}/{row_id}.jpg (upsert:true → no orphans)
    //   b. PATCH the row's photo_url
    //   c. Return the URL
    // If (b) fails AFTER (a), uploadPhoto throws "Photo uploaded but row patch
    // failed" — we still want to record _uploaded_photo_url so next retry
    // re-PATCHes without re-uploading. Hence the two-stage try/catch below.
    try {
      photo_url = await uploadPhoto({
        row_id: row_id,
        blob: blob,
        tsr_id: tsr_id,
        table: cfg.table
      });
      record._uploaded_photo_url = photo_url;
      await cfg.store.put(record);
    } catch (upErr) {
      // Distinguish "upload itself failed" vs "patch failed after upload".
      // The latter case requires us to remember the URL we already have.
      if (upErr && /Photo uploaded but row patch failed/i.test(upErr.message)) {
        // Reconstruct the URL from the deterministic path so the next pass
        // can re-PATCH without re-uploading.
        var pubRes = (typeof supabaseClient !== 'undefined' && supabaseClient.storage)
          ? supabaseClient.storage.from('patrol-photos').getPublicUrl(
              (typeof buildPhotoPath === 'function')
                ? buildPhotoPath(tsr_id, row_id)
                : (tsr_id + '/' + new Date().toISOString().slice(0,10) + '/' + row_id + '.jpg')
            )
          : null;
        var url = pubRes && pubRes.data && pubRes.data.publicUrl;
        if (url) {
          record._uploaded_photo_url = url;
          await cfg.store.put(record);
        }
      }
      throw upErr;
    }
  } else if (photoB64 && photo_url) {
    // Step 3 (re-patch only) — upload succeeded previously but patch failed.
    // Do NOT re-upload; just patch.
    if (typeof patchPhotoUrl === 'function') {
      await patchPhotoUrl(cfg.table, row_id, photo_url);
    }
  }

  // All steps complete — remove from queue.
  await cfg.store.delete(record.id);
}

async function _syncPendingImpl() {
  var results = { visits: 0, stores: 0, farms: 0, errors: [], ejected: 0 };

  // Sync pending farms
  var pendingFarms = await offlineDb.pendingFarms.toArray();
  for (var fi = 0; fi < pendingFarms.length; fi++) {
    var f = pendingFarms[fi];
    try {
      await createFarm(_queuePayload(f));
      await offlineDb.pendingFarms.delete(f.id);
      results.farms++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      if (typeof patrolIsLikelyDuplicateInsertError === 'function' && patrolIsLikelyDuplicateInsertError(e)) {
        console.warn('[sync] Farm duplicate treated as success (idempotent)', f.offline_id, e.message);
        await offlineDb.pendingFarms.delete(f.id);
        results.farms++;
        if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
        continue;
      }
      results.errors.push('Farm: ' + e.message);
      var fOutcome = await _markRetryOrEject(offlineDb.pendingFarms, f, e, 'Farm');
      if (fOutcome === 'ejected') results.ejected++;
    }
  }

  // ── Photo flow: INSERT → UPLOAD → PATCH (Audit D O5; H-03 from April 2026)
  //
  // Old flow was upload→insert: a failed INSERT orphaned the blob in Storage,
  // and the next retry uploaded to a NEW Date.now()-based path, accumulating
  // duplicates. New flow:
  //
  //   Step 1: INSERT row with photo_url = NULL. Persist returned row_id on
  //           the queue record as `_inserted_row_id`.
  //   Step 2: Upload blob to deterministic path {tsr_id}/{YYYY-MM-DD}/{row_id}.jpg
  //           with upsert:true (uploadPhoto in camera.js).
  //   Step 3: PATCH row with photo_url. uploadPhoto handles the patch itself
  //           since it knows table + row_id; on success it returns the URL.
  //
  // Failure at any step is rescue-able:
  //   - Step 1 fails → record stays in queue with no `_inserted_row_id` →
  //     next retry re-attempts insert. (Duplicate-detection helper still
  //     dequeues if the server actually got it.)
  //   - Step 2 fails → `_inserted_row_id` is set, `_uploaded_photo_url` is
  //     NOT → next retry skips insert, retries upload (same deterministic
  //     path, so no orphan), then patches.
  //   - Step 3 fails → both flags set, `_uploaded_photo_url` has the URL →
  //     next retry skips insert AND upload, calls patchPhotoUrl only.

  // Sync pending stores
  var pendingStores = await offlineDb.pendingStores.toArray();
  for (var i = 0; i < pendingStores.length; i++) {
    var s = pendingStores[i];
    try {
      await _syncOnePhotoRecord(s, {
        table: 'stores',
        store: offlineDb.pendingStores,
        createFn: createStore,
        label: 'Store'
      });
      results.stores++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      if (typeof patrolIsLikelyDuplicateInsertError === 'function' && patrolIsLikelyDuplicateInsertError(e)) {
        console.warn('[sync] Store duplicate treated as success (idempotent)', s.offline_id, e.message);
        await offlineDb.pendingStores.delete(s.id);
        results.stores++;
        if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
        continue;
      }
      results.errors.push('Store: ' + e.message);
      var outcome = await _markRetryOrEject(offlineDb.pendingStores, s, e, 'Store');
      if (outcome === 'ejected') results.ejected++;
      // Keep going — a schema-drifted record shouldn't block the rest of the queue
    }
  }

  // Sync pending visits
  var pendingVisits = await offlineDb.pendingVisits.toArray();
  for (var j = 0; j < pendingVisits.length; j++) {
    var v = pendingVisits[j];
    try {
      await _syncOnePhotoRecord(v, {
        table: 'visits',
        store: offlineDb.pendingVisits,
        createFn: createVisit,
        label: 'Visit'
      });
      results.visits++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      if (typeof patrolIsLikelyDuplicateInsertError === 'function' && patrolIsLikelyDuplicateInsertError(e)) {
        console.warn('[sync] Visit duplicate treated as success (idempotent)', v.offline_id, e.message);
        await offlineDb.pendingVisits.delete(v.id);
        results.visits++;
        if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
        continue;
      }
      results.errors.push('Visit: ' + e.message);
      var vOutcome = await _markRetryOrEject(offlineDb.pendingVisits, v, e, 'Visit');
      if (vOutcome === 'ejected') results.ejected++;
    }
  }

  _applySyncSummary(results);
  return results;
}

// Diagnostic helpers — call from DevTools console
window.patrolInspectQueue = async function () {
  var v = await offlineDb.pendingVisits.toArray();
  var s = await offlineDb.pendingStores.toArray();
  var f = await offlineDb.pendingFarms.toArray();
  console.log('[queue] pending visits:', v);
  console.log('[queue] pending stores:', s);
  console.log('[queue] pending farms:', f);
  return { visits: v, stores: s, farms: f };
};
window.patrolClearQueue = async function () {
  await offlineDb.pendingVisits.clear();
  await offlineDb.pendingStores.clear();
  await offlineDb.pendingFarms.clear();
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  console.log('[queue] cleared');
};

async function getSyncStatus() {
  var pv = await offlineDb.pendingVisits.count();
  var ps = await offlineDb.pendingStores.count();
  var pf = await offlineDb.pendingFarms.count();
  return {
    pending: pv + ps + pf,
    synced: pv === 0 && ps === 0 && pf === 0,
    ejected: _lastSyncSummary.ejected || 0,
    syncErrors: _lastSyncSummary.errors || 0
  };
}

function cacheStores(stores) {
  return offlineDb.cachedStores.bulkPut(stores);
}

function getCachedStores() {
  return offlineDb.cachedStores.toArray();
}

// ─────────────────────────────────────────────────────────────────────────
// Orphan photo cleanup (Audit D O5 / H-03 — historical orphans)
// ─────────────────────────────────────────────────────────────────────────
//
// Before the insert-then-upload fix, every failed sync left photo blobs in
// patrol-photos/ with no matching DB row (random Date.now()_store.jpg /
// _visit.jpg paths). This sweep enumerates the current user's Storage
// subtree and deletes blobs whose deterministic-path basename does NOT
// match any live store/visit id.
//
// Browser-side enumeration is limited by Storage RLS. If list() returns
// permission errors or empty results on a prefix we can prove had blobs,
// we flag for a server-side cleanup job (see returned `needsServerSweep`).
//
// Throttle: localStorage timestamp; runs at most once per 24h per device.
var _ORPHAN_CLEANUP_KEY = 'patrol_orphan_cleanup_last_run';
var _ORPHAN_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

async function _shouldRunOrphanCleanup() {
  try {
    var last = parseInt(localStorage.getItem(_ORPHAN_CLEANUP_KEY) || '0', 10);
    if (!isFinite(last) || last <= 0) return true;
    return (Date.now() - last) >= _ORPHAN_CLEANUP_INTERVAL_MS;
  } catch (e) { return false; /* localStorage blocked → skip silently */ }
}

async function cleanupOrphanPhotos() {
  if (typeof supabaseClient === 'undefined' || !supabaseClient.storage) {
    return { ran: false, reason: 'no supabase client' };
  }
  if (!(await _shouldRunOrphanCleanup())) {
    return { ran: false, reason: 'throttled (last run <24h ago)' };
  }

  var session = (typeof getSession === 'function') ? getSession() : null;
  if (!session || !session.id) {
    return { ran: false, reason: 'no session' };
  }
  var tsr_id = session.id;

  var summary = { ran: true, scanned: 0, orphansDeleted: 0, errors: 0, needsServerSweep: false };

  try {
    // Enumerate the TSR's date-prefixed subfolders, then files within each.
    // Path layout (post-fix): {tsr_id}/{YYYY-MM-DD}/{row_id}.jpg
    var bucket = supabaseClient.storage.from('patrol-photos');
    var dayDirsRes = await bucket.list(tsr_id, { limit: 1000 });
    if (dayDirsRes.error) {
      // Permission error or RLS block — flag for server sweep, don't retry.
      console.warn('[orphan-cleanup] list() failed at root — flagging for server sweep:', dayDirsRes.error.message);
      summary.needsServerSweep = true;
      summary.errors++;
      // Still record run timestamp so we don't hammer storage every reload.
      try { localStorage.setItem(_ORPHAN_CLEANUP_KEY, String(Date.now())); } catch (e) {}
      return summary;
    }
    var dayDirs = (dayDirsRes.data || []).filter(function (e) {
      // Storage list returns both files and "folders"; folder entries have id=null
      return e && (e.id === null || /^\d{4}-\d{2}-\d{2}$/.test(e.name));
    });

    // Build the set of live row_ids the user could plausibly own.
    // To avoid pulling every row, we restrict the live-id lookup to the
    // YYYY-MM-DD prefixes we found in Storage — usually a small set.
    var liveIds = new Set();
    try {
      // Stores + visits the user created. Each row's id is what the
      // deterministic path's basename should be.
      var storesRes = await supabaseClient.from('stores').select('id').eq('created_by', tsr_id);
      var visitsRes = await supabaseClient.from('visits').select('id').eq('tsr_id', tsr_id);
      (storesRes.data || []).forEach(function (r) { liveIds.add(String(r.id)); });
      (visitsRes.data || []).forEach(function (r) { liveIds.add(String(r.id)); });
    } catch (e) {
      // If the DB lookup itself fails we cannot safely delete anything —
      // a false-positive would destroy a live photo. Bail out.
      summary.errors++;
      summary.needsServerSweep = true;
      try { localStorage.setItem(_ORPHAN_CLEANUP_KEY, String(Date.now())); } catch (e2) {}
      return summary;
    }

    var pathsToDelete = [];
    for (var d = 0; d < dayDirs.length; d++) {
      var dayPath = tsr_id + '/' + dayDirs[d].name;
      var filesRes = await bucket.list(dayPath, { limit: 1000 });
      if (filesRes.error) {
        summary.errors++;
        summary.needsServerSweep = true;
        continue;
      }
      var files = filesRes.data || [];
      for (var f = 0; f < files.length; f++) {
        summary.scanned++;
        var name = files[f].name; // e.g. "abc-uuid.jpg" OR legacy "1745597432123_visit.jpg"
        var basename = name.replace(/\.jpg$/i, '');
        // Anything not matching a live id is orphan candidate. Legacy
        // Date.now()_store.jpg / _visit.jpg paths NEVER match a live id and
        // are exactly what we want to delete.
        if (!liveIds.has(basename)) {
          pathsToDelete.push(dayPath + '/' + name);
        }
      }
    }

    if (pathsToDelete.length > 0) {
      // Storage.remove accepts an array of paths.
      var rmRes = await bucket.remove(pathsToDelete);
      if (rmRes.error) {
        console.warn('[orphan-cleanup] remove() partial failure:', rmRes.error.message);
        summary.errors++;
        summary.needsServerSweep = true;
      } else {
        summary.orphansDeleted = pathsToDelete.length;
        console.info('[orphan-cleanup] deleted ' + pathsToDelete.length + ' orphan blob(s)');
      }
    }
  } catch (e) {
    console.warn('[orphan-cleanup] unexpected error — flagging for server sweep:', e && e.message);
    summary.errors++;
    summary.needsServerSweep = true;
  }

  try { localStorage.setItem(_ORPHAN_CLEANUP_KEY, String(Date.now())); } catch (e) {}
  return summary;
}

// Schedule the sweep after page load (deferred so it never blocks first
// paint / first sync). Skips silently in non-browser test contexts.
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  setTimeout(function () {
    try {
      cleanupOrphanPhotos().then(function (s) {
        if (s && s.ran && s.needsServerSweep) {
          console.warn('[orphan-cleanup] browser sweep incomplete — server-side cleanup recommended', s);
        }
      }).catch(function (e) { /* never let cleanup break the app */ });
    } catch (e) {}
  }, 30000); // 30s after load — well after the initial sync attempt.
}

// Convert base64 data URL back to Blob for upload during sync
function _base64ToBlob(dataUrl) {
  var parts = dataUrl.split(',');
  var mime = parts[0].match(/:(.*?);/)[1];
  var raw = atob(parts[1]);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

if (typeof window !== 'undefined') {
  window.offlineDb = offlineDb;
}

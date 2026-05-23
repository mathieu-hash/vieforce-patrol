// Offline Module — Dexie.js IndexedDB queue for offline-first
//
// Wave 2 / Audit D O1 (2026-05-21):
//   The previous policy ejected records after 3 failed retries — flat,
//   regardless of error class. Three 2G blips on a Mindanao TSR's phone
//   silently lost their visit and the sync badge then rendered green
//   "Naka-sync na ✓✓" because pending count was 0.
//
//   New policy:
//     - classifyError(err) → 'transient' | 'permanent'
//     - transient → retry forever with capped exponential backoff
//                   (5s, 15s, 30s, 1m, 5m, 15m, 30m, 1h, 2h, 6h, 12h, 24h)
//     - permanent → quarantine (still in IDB, flagged) on FIRST hit;
//                   never retried automatically; surfaced via getSyncState()
//     - records are NEVER deleted by the retry loop
//
//   Public exports (window-scoped, vanilla-JS pattern):
//     - classifyError(err) → string
//     - getQueueStats() → { pending, syncing, quarantined, oldestPendingAge, lastError }
//     - getSyncState() → { onLine, pending, syncing, quarantined, lastError }
//     - requeueQuarantined(recordId) → admin/manual unstick
//
//   Contract for W2-SyncTruthBadge: read getSyncState() directly; do not
//   parse the legacy getSyncStatus() return shape for new code.

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

// v3: route EVERY write through the queue (Wave 2 — Audit D O3+O4).
// Adds tables for store updates, DSM assignments, last_visit_at ticks,
// and profile edits — all paths that previously hit Supabase directly
// and would silently lose data on intermittent connections.
offlineDb.version(3).stores({
  pendingVisits:        '++id, offline_id, created_at',
  pendingStores:        '++id, offline_id, created_at',
  pendingFarms:         '++id, offline_id, created_at',
  pendingStoreUpdates:  '++id, offline_id, created_at',
  pendingAssignments:   '++id, offline_id, created_at',
  pendingVisitTouches:  '++id, offline_id, created_at',
  pendingProfileEdits:  '++id, offline_id, created_at',
  cachedStores:         'id, updated_at'
});

// v4: 1h cache for DSM home aggregates (Wave 3 — Audit A #3).
// Key = DSM user id (string). Stores the full team-metrics payload so
// js/home-dsm.js can render warm cached data instantly and refresh in
// the background, instead of falling back to fabricated mock data.
offlineDb.version(4).stores({
  pendingVisits:        '++id, offline_id, created_at',
  pendingStores:        '++id, offline_id, created_at',
  pendingFarms:         '++id, offline_id, created_at',
  pendingStoreUpdates:  '++id, offline_id, created_at',
  pendingAssignments:   '++id, offline_id, created_at',
  pendingVisitTouches:  '++id, offline_id, created_at',
  pendingProfileEdits:  '++id, offline_id, created_at',
  cachedStores:         'id, updated_at',
  cachedDsmMetrics:     'id, updated_at'
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

// ─── Wave 2: queue every write (Audit D O3+O4) ───────────────────────────
//
// The helpers below mirror queueVisit/queueStore/queueFarm: write IDB
// first, then (when online) attempt one immediate sync. On failure the
// row stays in IDB and the new W2-RetryClassify _handleSyncFailure
// machinery handles it on the next pass — never silently ejecting.
// Callers update local UI optimistically; the queue makes the write
// durable regardless of connectivity.

async function queueStoreUpdate(payload) {
  // payload: { store_id, patch }
  payload.offline_id = 'su_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  payload.created_at = new Date().toISOString();
  await _ensureOfflineDb().pendingStoreUpdates.add(payload);
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try { await syncPending(); } catch (e) { /* leave in IDB for retry */ }
  }
}

async function queueAssignment(payload) {
  // payload: { kind: 'store'|'farm', tsr_id, store_id }
  // tsr_id === null is an unassign.
  payload.offline_id = 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  payload.created_at = new Date().toISOString();
  await _ensureOfflineDb().pendingAssignments.add(payload);
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try { await syncPending(); } catch (e) { /* leave in IDB for retry */ }
  }
}

async function queueVisitTouch(payload) {
  // payload: { store_id, visited_at }
  payload.offline_id = 'vt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  payload.created_at = new Date().toISOString();
  await _ensureOfflineDb().pendingVisitTouches.add(payload);
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try { await syncPending(); } catch (e) { /* leave in IDB for retry */ }
  }
}

async function queueProfileEdit(payload) {
  // payload: { user_id, patch }
  payload.offline_id = 'pe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  payload.created_at = new Date().toISOString();
  await _ensureOfflineDb().pendingProfileEdits.add(payload);
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try { await syncPending(); } catch (e) { /* leave in IDB for retry */ }
  }
}

// Soft "slow-sync" hint after this many active attempts on a single record.
// We never eject; this is purely a UI signal for the badge.
var SYNC_SLOW_HINT_ATTEMPTS = 12;

// Backoff schedule (ms). Caps at 24h, retries forever after.
// 5s, 15s, 30s, 1m, 5m, 15m, 30m, 1h, 2h, 6h, 12h, 24h
var _BACKOFF_SCHEDULE_MS = [
  5 * 1000,
  15 * 1000,
  30 * 1000,
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000
];

function _nextBackoffMs(attemptCount) {
  // attemptCount is the NEW count (i.e. the failure we just observed is
  // the Nth attempt; the next retry happens after backoff[N-1] ms).
  // Clamp to schedule end (24h) for any attempt past the schedule length.
  var idx = Math.max(0, Math.min(attemptCount - 1, _BACKOFF_SCHEDULE_MS.length - 1));
  return _BACKOFF_SCHEDULE_MS[idx];
}

// Classify a sync error so we know whether to keep retrying or quarantine.
//
//   transient — retry forever:
//     - Network errors (fetch TypeError, AbortError, offline mid-attempt)
//     - 5xx server errors (500/502/503/504)
//     - 429 rate limit
//     - 408 request timeout
//     - PostgREST timeout codes
//     - PGRST116 (row not found — may be a replication lag, retry once)
//
//   permanent — quarantine on first hit:
//     - 4xx client errors except 408/429 (400/401/403/404/409/422)
//     - PostgREST schema errors (PGRST204, PGRST301, etc.)
//     - Postgres constraint failures (23502 NOT NULL, 23514 CHECK)
//     - Unknown error shape → treated as transient (safer default; never lose data)
function classifyError(err) {
  if (!err) return 'transient';

  // navigator.onLine is a hint, not truth — but if the platform tells us
  // we're offline mid-attempt, treat the failure as transient unconditionally.
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    return 'transient';
  }

  // Fetch-shaped network errors
  var name = err.name || '';
  if (name === 'AbortError' || name === 'TimeoutError') return 'transient';
  if (name === 'TypeError') {
    // Browser fetch network failure surfaces as TypeError("Failed to fetch")
    var msg = String(err.message || '');
    if (/fetch|network|load failed|networkerror/i.test(msg)) return 'transient';
  }

  // HTTP status (Supabase JS client exposes .status; raw fetch responses
  // sometimes have .statusCode; PostgREST errors carry .code)
  var status = err.status || err.statusCode || (err.response && err.response.status);
  if (status) {
    if (status >= 500 && status < 600) return 'transient';
    if (status === 408 || status === 429) return 'transient';
    if (status >= 400 && status < 500) return 'permanent';
  }

  // PostgREST / Postgres error codes
  var code = err.code || (err.details && err.details.code) || '';
  if (code) {
    var sCode = String(code).toUpperCase();
    // PGRST204 = schema (column not found) → permanent
    // PGRST301 = schema mismatch
    if (sCode === 'PGRST204' || sCode === 'PGRST301') return 'permanent';
    // PGRST116 = row not found — usually a permanent UPDATE-target error,
    // but for INSERT-only sync flow this means upstream changed under us.
    // Treat as transient (retry once with backoff); if it persists past
    // the schedule it'll just keep waiting — harmless.
    if (sCode === 'PGRST116') return 'transient';
    // Postgres SQLSTATE constraint failures — permanent
    if (sCode === '23502' || sCode === '23514' || sCode === '23505' || sCode === '23503') {
      return 'permanent';
    }
    // PostgREST timeout / connection codes
    if (sCode === 'PGRST002' || sCode === 'PGRST000') return 'transient';
  }

  // Message-shaped fallback for Supabase JS errors that lack status/code
  var fallbackMsg = String((err && err.message) || '').toLowerCase();
  if (/timeout|timed out|econnreset|enotfound|socket hang up/.test(fallbackMsg)) {
    return 'transient';
  }
  if (/duplicate key|violates|not-null|check constraint|column .* does not exist/.test(fallbackMsg)) {
    return 'permanent';
  }

  // Default: transient. Better to retry-forever than silently lose user data.
  return 'transient';
}

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
    id: 1, offline_id: 1, created_at: 1, gps_failed: 1,
    // Wave 2 retry bookkeeping (W2-RetryClassify) — strip from server payload
    retry_count: 1, attempt_count: 1, last_error: 1, last_error_class: 1,
    last_attempt_at: 1, next_attempt_after: 1, quarantined_at: 1,
    // Photo-flow bookkeeping (W2-PhotoFlow / Audit D O5 / H-03) — tracks
    // partial progress across retries; not real columns, must be stripped.
    _inserted_row_id: 1,
    _uploaded_photo_url: 1
  };
  if (extraSkip) for (var k in extraSkip) skip[k] = 1;
  var out = {};
  for (var key in record) { if (!skip[key]) out[key] = record[key]; }
  return out;
}

// Wave 2 (Audit D O1): replaces _handleSyncFailure. NEVER deletes the
// record. Updates bookkeeping in place; quarantine flag for permanent
// errors; backoff timer for transient errors.
async function _handleSyncFailure(table, record, err, label) {
  var classification = classifyError(err);
  var msg = String((err && err.message) || err || '').slice(0, 500);
  var nowIso = new Date().toISOString();

  record.attempt_count = (record.attempt_count || 0) + 1;
  record.last_attempt_at = nowIso;
  record.last_error = msg;
  record.last_error_class = classification;

  if (classification === 'permanent') {
    record.quarantined_at = nowIso;
    record.next_attempt_after = null;
    console.warn('[offline] retry', {
      offline_id: record.offline_id,
      attempt_count: record.attempt_count,
      next_attempt_after_ms: null,
      error_class: 'permanent',
      error: msg.slice(0, 120)
    });
  } else {
    record.quarantined_at = null;
    var delayMs = _nextBackoffMs(record.attempt_count);
    record.next_attempt_after = new Date(Date.now() + delayMs).toISOString();
    console.warn('[offline] retry', {
      offline_id: record.offline_id,
      attempt_count: record.attempt_count,
      next_attempt_after_ms: delayMs,
      error_class: 'transient',
      error: msg.slice(0, 120)
    });
  }

  await table.put(record);
  return classification;
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
var _lastSyncSummary = { errors: 0, lastError: null };

function _applySyncSummary(results) {
  _lastSyncSummary = {
    errors: (results.errors && results.errors.length) || 0,
    lastError: results.lastError || null
  };
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  if (typeof patrolUpdatePilotCard === 'function') patrolUpdatePilotCard();
}

// A record is "active" (in the pending list, eligible for sync) when:
//   - it is NOT quarantined (no quarantined_at)
//   - its next_attempt_after is in the past (or null)
function _isActive(record, now) {
  if (record.quarantined_at) return false;
  if (record.next_attempt_after) {
    var ts = Date.parse(record.next_attempt_after);
    if (isFinite(ts) && ts > now) return false;
  }
  return true;
}

function _isQuarantined(record) {
  return !!record.quarantined_at;
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
  var results = {
    visits: 0, stores: 0, farms: 0,
    storeUpdates: 0, assignments: 0, visitTouches: 0, profileEdits: 0,
    errors: [], ejected: 0, lastError: null
  };
  var now = Date.now();

  function recordError(label, err, classification) {
    var msg = String((err && err.message) || err || '');
    results.errors.push(label + ': ' + msg);
    results.lastError = {
      message: msg.slice(0, 240),
      classification: classification,
      at: new Date().toISOString()
    };
  }

  // Sync pending farms (skip quarantined + backoff-waiting)
  var allFarms = await offlineDb.pendingFarms.toArray();
  var pendingFarms = allFarms.filter(function (r) { return _isActive(r, now); });
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
      var fClass = await _handleSyncFailure(offlineDb.pendingFarms, f, e, 'Farm');
      recordError('Farm', e, fClass);
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

  // Sync pending stores (skip quarantined + backoff-waiting)
  var allStores = await offlineDb.pendingStores.toArray();
  var pendingStores = allStores.filter(function (r) { return _isActive(r, now); });
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
      var sClass = await _handleSyncFailure(offlineDb.pendingStores, s, e, 'Store');
      recordError('Store', e, sClass);
      // Keep going — a schema-drifted record shouldn't block the rest of the queue
    }
  }

  // Sync pending visits (skip quarantined + backoff-waiting)
  var allVisits = await offlineDb.pendingVisits.toArray();
  var pendingVisits = allVisits.filter(function (r) { return _isActive(r, now); });
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
      var vClass = await _handleSyncFailure(offlineDb.pendingVisits, v, e, 'Visit');
      recordError('Visit', e, vClass);
    }
  }

  // ─── Wave 2 drains (Audit D O3+O4) ─────────────────────────────────────
  // Each row drives the same Supabase UPDATE that the call site used to
  // perform synchronously. Failures route through the existing retry/eject
  // machinery (W2-RetryClassify will refine the classification later).

  // Store updates (prospect→active conversion, plus any field edit).
  var pendingStoreUpdates = await offlineDb.pendingStoreUpdates.toArray();
  for (var sui = 0; sui < pendingStoreUpdates.length; sui++) {
    var su = pendingStoreUpdates[sui];
    try {
      if (typeof updateStore !== 'function') throw new Error('updateStore unavailable');
      await updateStore(su.store_id, su.patch || {});
      await offlineDb.pendingStoreUpdates.delete(su.id);
      results.storeUpdates++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      results.errors.push('StoreUpdate: ' + e.message);
      var suOutcome = await _handleSyncFailure(offlineDb.pendingStoreUpdates, su, e, 'StoreUpdate');
      if (suOutcome === 'permanent') results.ejected++; // quarantined; legacy field name kept
    }
  }

  // last_visit_at touches — emitted by visit-wizard once a visit syncs.
  // Idempotent on server (overwriting the same timestamp is harmless).
  var pendingVisitTouches = await offlineDb.pendingVisitTouches.toArray();
  for (var vti = 0; vti < pendingVisitTouches.length; vti++) {
    var vt = pendingVisitTouches[vti];
    try {
      if (typeof updateStore !== 'function') throw new Error('updateStore unavailable');
      await updateStore(vt.store_id, { last_visit_at: vt.visited_at });
      await offlineDb.pendingVisitTouches.delete(vt.id);
      results.visitTouches++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      results.errors.push('VisitTouch: ' + e.message);
      var vtOutcome = await _handleSyncFailure(offlineDb.pendingVisitTouches, vt, e, 'VisitTouch');
      if (vtOutcome === 'permanent') results.ejected++; // quarantined; legacy field name kept
    }
  }

  // DSM assignments — atomic per row so a bulk that partially syncs
  // preserves the work that DID land.
  var pendingAssignments = await offlineDb.pendingAssignments.toArray();
  for (var ai = 0; ai < pendingAssignments.length; ai++) {
    var a = pendingAssignments[ai];
    try {
      var ids = [a.store_id];
      // Call the raw Supabase helpers, NOT the queueing public ones —
      // otherwise we'd recurse back into the queue forever.
      if (a.kind === 'farm') {
        if (a.tsr_id == null) {
          if (typeof _rawUnassignFarms !== 'function') throw new Error('_rawUnassignFarms unavailable');
          await _rawUnassignFarms(ids);
        } else {
          if (typeof _rawAssignFarms !== 'function') throw new Error('_rawAssignFarms unavailable');
          await _rawAssignFarms(ids, a.tsr_id);
        }
      } else {
        if (a.tsr_id == null) {
          if (typeof _rawUnassignStores !== 'function') throw new Error('_rawUnassignStores unavailable');
          await _rawUnassignStores(ids);
        } else {
          if (typeof _rawAssignStores !== 'function') throw new Error('_rawAssignStores unavailable');
          await _rawAssignStores(ids, a.tsr_id);
        }
      }
      await offlineDb.pendingAssignments.delete(a.id);
      results.assignments++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      results.errors.push('Assignment: ' + e.message);
      var aOutcome = await _handleSyncFailure(offlineDb.pendingAssignments, a, e, 'Assignment');
      if (aOutcome === 'permanent') results.ejected++; // quarantined; legacy field name kept
    }
  }

  // Profile edits (users.update). Admin edits are normally sync (see
  // js/admin.js) — this drain handles the offline-fallback rows only.
  var pendingProfileEdits = await offlineDb.pendingProfileEdits.toArray();
  for (var pei = 0; pei < pendingProfileEdits.length; pei++) {
    var pe = pendingProfileEdits[pei];
    try {
      if (typeof updateUser !== 'function') throw new Error('updateUser unavailable');
      await updateUser(pe.user_id, pe.patch || {});
      await offlineDb.pendingProfileEdits.delete(pe.id);
      results.profileEdits++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      results.errors.push('ProfileEdit: ' + e.message);
      var peOutcome = await _handleSyncFailure(offlineDb.pendingProfileEdits, pe, e, 'ProfileEdit');
      if (peOutcome === 'permanent') results.ejected++; // quarantined; legacy field name kept
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
  var su = await offlineDb.pendingStoreUpdates.toArray();
  var a = await offlineDb.pendingAssignments.toArray();
  var vt = await offlineDb.pendingVisitTouches.toArray();
  var pe = await offlineDb.pendingProfileEdits.toArray();
  console.log('[queue] pending visits:', v);
  console.log('[queue] pending stores:', s);
  console.log('[queue] pending farms:', f);
  console.log('[queue] pending store updates:', su);
  console.log('[queue] pending assignments:', a);
  console.log('[queue] pending visit touches:', vt);
  console.log('[queue] pending profile edits:', pe);
  return {
    visits: v, stores: s, farms: f,
    storeUpdates: su, assignments: a, visitTouches: vt, profileEdits: pe
  };
};
window.patrolClearQueue = async function () {
  await offlineDb.pendingVisits.clear();
  await offlineDb.pendingStores.clear();
  await offlineDb.pendingFarms.clear();
  await offlineDb.pendingStoreUpdates.clear();
  await offlineDb.pendingAssignments.clear();
  await offlineDb.pendingVisitTouches.clear();
  await offlineDb.pendingProfileEdits.clear();
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  console.log('[queue] cleared');
};

// Legacy shape — kept for backwards compat with home-tsr.js / stores.js /
// visits.js consumers until W2-SyncTruthBadge migrates them to
// getSyncState(). `pending` now excludes quarantined records (single
// source of truth fix — Audit D O2: "Naka-sync na ✓✓" after eject is
// no longer possible because we never eject).
async function getSyncStatus() {
  // Walk all 7 pending tables for accurate count. _computeQueueStats only
  // covers the photo-bearing tables (visits/stores/farms) for quarantine
  // tracking — add the 4 new Wave 2 tables to the simple count.
  var stats = await _computeQueueStats();
  var psu = await offlineDb.pendingStoreUpdates.count();
  var pa = await offlineDb.pendingAssignments.count();
  var pvt = await offlineDb.pendingVisitTouches.count();
  var ppe = await offlineDb.pendingProfileEdits.count();
  var total = stats.pending + psu + pa + pvt + ppe;
  return {
    pending: total,
    synced: total === 0,
    ejected: 0, // we never eject any more; preserved for legacy consumers
    quarantined: stats.quarantined,
    syncErrors: _lastSyncSummary.errors || 0
  };
}

// Internal: walk all three queues, separating active-pending from
// quarantined and computing the age of the oldest active-pending record.
async function _computeQueueStats() {
  var stats = { pending: 0, quarantined: 0, oldestPendingAge: null };
  var now = Date.now();

  var tables = ['pendingVisits', 'pendingStores', 'pendingFarms'];
  for (var ti = 0; ti < tables.length; ti++) {
    var rows = await offlineDb[tables[ti]].toArray();
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      if (_isQuarantined(r)) {
        stats.quarantined++;
      } else {
        // Active or backoff-waiting both count as "pending" from the
        // user's perspective — the record is in IDB, not yet on server.
        stats.pending++;
        if (r.created_at) {
          var t = Date.parse(r.created_at);
          if (isFinite(t)) {
            var age = now - t;
            if (stats.oldestPendingAge === null || age > stats.oldestPendingAge) {
              stats.oldestPendingAge = age;
            }
          }
        }
      }
    }
  }
  return stats;
}

// PUBLIC API — Wave 2 contract for the badge agent and any caller that
// needs queue health visibility.
async function getQueueStats() {
  var stats = await _computeQueueStats();
  return {
    pending: stats.pending,
    syncing: !!_syncRunning,
    quarantined: stats.quarantined,
    oldestPendingAge: stats.oldestPendingAge,
    lastError: (_lastSyncSummary.lastError && _lastSyncSummary.lastError.message) || null
  };
}

// PUBLIC API — Single source of truth for the sync badge. Contract:
//   {
//     onLine: boolean,
//     pending: number,
//     syncing: boolean,
//     quarantined: number,
//     lastError: { message, classification, at } | null
//   }
async function getSyncState() {
  var stats = await _computeQueueStats();
  return {
    onLine: typeof navigator !== 'undefined' ? !!navigator.onLine : true,
    pending: stats.pending,
    syncing: !!_syncRunning,
    quarantined: stats.quarantined,
    lastError: _lastSyncSummary.lastError || null
  };
}

// PUBLIC API — admin/manual unstick. Clears the quarantine flag and
// reset bookkeeping so the next syncPending() picks the record up.
async function requeueQuarantined(recordId) {
  var tables = ['pendingVisits', 'pendingStores', 'pendingFarms'];
  for (var ti = 0; ti < tables.length; ti++) {
    var t = offlineDb[tables[ti]];
    var rec = await t.get(recordId);
    if (rec) {
      rec.quarantined_at = null;
      rec.next_attempt_after = null;
      rec.last_error = null;
      rec.last_error_class = null;
      // Keep attempt_count for telemetry — operator may want to see history.
      await t.put(rec);
      return { table: tables[ti], record: rec };
    }
  }
  return null;
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
  window.classifyError = classifyError;
  window.getQueueStats = getQueueStats;
  window.getSyncState = getSyncState;
  window.requeueQuarantined = requeueQuarantined;
}

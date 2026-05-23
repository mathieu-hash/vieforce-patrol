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
    id: 1, offline_id: 1, created_at: 1,
    // Wave 2 retry bookkeeping — strip from server payload
    retry_count: 1, attempt_count: 1, last_error: 1, last_error_class: 1,
    last_attempt_at: 1, next_attempt_after: 1, quarantined_at: 1,
    gps_failed: 1
  };
  if (extraSkip) for (var k in extraSkip) skip[k] = 1;
  var out = {};
  for (var key in record) { if (!skip[key]) out[key] = record[key]; }
  return out;
}

// Wave 2 (Audit D O1): replaces _markRetryOrEject. NEVER deletes the
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

async function _syncPendingImpl() {
  var results = { visits: 0, stores: 0, farms: 0, errors: [], ejected: 0, lastError: null };
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

  // Sync pending stores (skip quarantined + backoff-waiting)
  var allStores = await offlineDb.pendingStores.toArray();
  var pendingStores = allStores.filter(function (r) { return _isActive(r, now); });
  for (var i = 0; i < pendingStores.length; i++) {
    var s = pendingStores[i];
    var sPayload = _queuePayload(s, { photo_base64: 1 });
    var storePhotoB64 = s.photo_base64 || null;
    try {
      if (storePhotoB64 && !sPayload.photo_url && typeof uploadPhoto === 'function') {
        try {
          var storeBlob = _base64ToBlob(storePhotoB64);
          var storeSession = getSession ? getSession() : null;
          var storePath = (storeSession ? storeSession.id : 'unknown') + '/' +
            new Date().toISOString().slice(0, 10) + '/' + Date.now() + '_store.jpg';
          sPayload.photo_url = await uploadPhoto(storeBlob, storePath);
        } catch (spe) { /* submit store without photo */ }
      }
      await createStore(sPayload);
      await offlineDb.pendingStores.delete(s.id);
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
    var vPayload = _queuePayload(v, { photo_base64: 1 });
    var photoB64 = v.photo_base64 || null;
    try {
      if (photoB64 && !vPayload.photo_url && typeof uploadPhoto === 'function') {
        try {
          var blob = _base64ToBlob(photoB64);
          var session = getSession ? getSession() : null;
          var path = (session ? session.id : 'unknown') + '/' +
            new Date().toISOString().slice(0, 10) + '/' + Date.now() + '_visit.jpg';
          vPayload.photo_url = await uploadPhoto(blob, path);
        } catch (pe) {
          // Photo upload failed during sync — submit visit without photo
        }
      }
      await createVisit(vPayload);
      await offlineDb.pendingVisits.delete(v.id);
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

// Legacy shape — kept for backwards compat with home-tsr.js / stores.js /
// visits.js consumers until W2-SyncTruthBadge migrates them to
// getSyncState(). `pending` now excludes quarantined records (single
// source of truth fix — Audit D O2: "Naka-sync na ✓✓" after eject is
// no longer possible because we never eject).
async function getSyncStatus() {
  var stats = await _computeQueueStats();
  return {
    pending: stats.pending,
    synced: stats.pending === 0,
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

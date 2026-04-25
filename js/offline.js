// Offline Module — Dexie.js IndexedDB queue for offline-first

var offlineDb = new Dexie('PatrolOffline');

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
  await offlineDb.pendingVisits.add(visitData);
  // Update sync UI immediately after queue write
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
}

async function queueStore(storeData) {
  storeData.offline_id = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  storeData.created_at = new Date().toISOString();
  await offlineDb.pendingStores.add(storeData);
  // Update sync UI immediately after queue write
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
}

async function queueFarm(farmData) {
  farmData.offline_id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  farmData.created_at = new Date().toISOString();
  await offlineDb.pendingFarms.add(farmData);
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
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
  var skip = { id: 1, offline_id: 1, created_at: 1, retry_count: 1, last_error: 1, last_attempt_at: 1 };
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

async function syncPending() {
  if (_syncRunning) return _syncRunning;
  _syncRunning = (async function () {
    try { return await _syncPendingImpl(); }
    finally { _syncRunning = null; }
  })();
  return _syncRunning;
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
      results.errors.push('Farm: ' + e.message);
      var fOutcome = await _markRetryOrEject(offlineDb.pendingFarms, f, e, 'Farm');
      if (fOutcome === 'ejected') results.ejected++;
    }
  }

  // Sync pending stores
  var pendingStores = await offlineDb.pendingStores.toArray();
  for (var i = 0; i < pendingStores.length; i++) {
    var s = pendingStores[i];
    try {
      await createStore(_queuePayload(s));
      await offlineDb.pendingStores.delete(s.id);
      results.stores++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
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
      results.errors.push('Visit: ' + e.message);
      var vOutcome = await _markRetryOrEject(offlineDb.pendingVisits, v, e, 'Visit');
      if (vOutcome === 'ejected') results.ejected++;
    }
  }

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
    synced: pv === 0 && ps === 0 && pf === 0
  };
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

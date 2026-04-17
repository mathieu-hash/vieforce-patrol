// Offline Module — Dexie.js IndexedDB queue for offline-first

var offlineDb = new Dexie('PatrolOffline');

offlineDb.version(1).stores({
  pendingVisits: '++id, offline_id, created_at',
  pendingStores: '++id, offline_id, created_at',
  cachedStores: 'id, updated_at'
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

var MAX_SYNC_RETRIES = 3;

// Strip queue bookkeeping fields before sending to server
function _queuePayload(record, extraSkip) {
  var skip = { id: 1, created_at: 1, retry_count: 1, last_error: 1, last_attempt_at: 1 };
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

async function syncPending() {
  var results = { visits: 0, stores: 0, errors: [], ejected: 0 };

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
  console.log('[queue] pending visits:', v);
  console.log('[queue] pending stores:', s);
  return { visits: v, stores: s };
};
window.patrolClearQueue = async function () {
  await offlineDb.pendingVisits.clear();
  await offlineDb.pendingStores.clear();
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
  console.log('[queue] cleared');
};

async function getSyncStatus() {
  var pv = await offlineDb.pendingVisits.count();
  var ps = await offlineDb.pendingStores.count();
  return {
    pending: pv + ps,
    synced: pv === 0 && ps === 0
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

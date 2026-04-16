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

async function syncPending() {
  var results = { visits: 0, stores: 0, errors: [] };

  // Sync pending stores
  var pendingStores = await offlineDb.pendingStores.toArray();
  for (var i = 0; i < pendingStores.length; i++) {
    var s = pendingStores[i];
    var localId = s.id;
    // Clone to avoid mutating IndexedDB record (keep offline_id for dedup)
    var payload = {};
    for (var k in s) {
      if (k !== 'id' && k !== 'created_at') {
        payload[k] = s[k];
      }
    }
    try {
      await createStore(payload);
      await offlineDb.pendingStores.delete(localId);
      results.stores++;
      // Update UI after each successful sync
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      results.errors.push('Store: ' + e.message);
      break; // Stop on first failure, retry next time
    }
  }

  // Sync pending visits
  var pendingVisits = await offlineDb.pendingVisits.toArray();
  for (var j = 0; j < pendingVisits.length; j++) {
    var v = pendingVisits[j];
    var vId = v.id;
    var vPayload = {};
    var photoB64 = null;
    for (var vk in v) {
      if (vk === 'id' || vk === 'created_at') continue;
      if (vk === 'photo_base64') { photoB64 = v[vk]; continue; }
      vPayload[vk] = v[vk];
    }
    try {
      // Upload offline photo if present and no URL yet
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
      await offlineDb.pendingVisits.delete(vId);
      results.visits++;
      if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
    } catch (e) {
      results.errors.push('Visit: ' + e.message);
      break; // Stop on first failure, retry next time
    }
  }

  return results;
}

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

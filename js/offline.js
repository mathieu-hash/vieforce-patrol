// Offline Module — Dexie.js IndexedDB queue for offline-first

var offlineDb = new Dexie('PatrolOffline');

offlineDb.version(1).stores({
  pendingVisits: '++id, offline_id, created_at',
  pendingStores: '++id, offline_id, created_at',
  cachedStores: 'id, updated_at'
});

function queueVisit(visitData) {
  visitData.offline_id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  visitData.created_at = new Date().toISOString();
  return offlineDb.pendingVisits.add(visitData);
}

function queueStore(storeData) {
  storeData.offline_id = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  storeData.created_at = new Date().toISOString();
  return offlineDb.pendingStores.add(storeData);
}

async function syncPending() {
  var results = { visits: 0, stores: 0, errors: [] };

  // Sync pending stores
  var pendingStores = await offlineDb.pendingStores.toArray();
  for (var i = 0; i < pendingStores.length; i++) {
    var s = pendingStores[i];
    var localId = s.id;
    delete s.id;
    delete s.offline_id;
    delete s.created_at;
    try {
      await createStore(s);
      await offlineDb.pendingStores.delete(localId);
      results.stores++;
    } catch (e) {
      results.errors.push('Store: ' + e.message);
    }
  }

  // Sync pending visits
  var pendingVisits = await offlineDb.pendingVisits.toArray();
  for (var j = 0; j < pendingVisits.length; j++) {
    var v = pendingVisits[j];
    var vId = v.id;
    delete v.id;
    delete v.offline_id;
    delete v.created_at;
    try {
      await createVisit(v);
      await offlineDb.pendingVisits.delete(vId);
      results.visits++;
    } catch (e) {
      results.errors.push('Visit: ' + e.message);
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

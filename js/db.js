// Database Module — all Supabase CRUD queries

// ── SAP Proxy fetch helper ─────────────────────────────────────────────
// AGENT 3: Review this helper. Added by Agent 1 during Day 1
// Patrol-as-hub backend sprint.
// Usage: await sapFetch('/api/sap/sales?period=MTD')
// Handles Supabase session token auth + error handling.
//
// NOTE FROM AGENT 1: Mat's brief snippet used localStorage key 'vf_session',
// but Patrol's actual key is 'patrol_session' (see js/auth.js:10 SESSION_KEY).
// Using the real key here so the helper actually works on first try. Also
// preferring getSession() if available (it does TTL validation) over a raw
// localStorage parse, with a fallback for robustness.
async function sapFetch(endpoint) {
  try {
    var session = (typeof getSession === 'function')
      ? getSession()
      : JSON.parse(localStorage.getItem('patrol_session') || 'null');
    if (!session || !session.id) throw new Error('No session');

    // W1-AuthCore: send Supabase Auth Bearer JWT (api/_lib/auth.js validates it).
    var bearer = (typeof window.getAuthBearer === 'function') ? await window.getAuthBearer() : null;
    if (!bearer) throw new Error('No auth token');

    var res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + bearer
      },
      credentials: 'include'
    });

    if (!res.ok) {
      console.error('[SAP] ' + res.status + ' ' + endpoint);
      return { error: 'FETCH_FAILED', status: res.status };
    }
    return await res.json();
  } catch (err) {
    console.error('[SAP] fetch error:', err.message);
    return { error: 'FETCH_EXCEPTION', message: err.message };
  }
}

window.sapFetch = sapFetch;

/**
 * True when PostgREST/Postgres rejected an INSERT as a duplicate (retry after partial success).
 * Used by offline sync to dequeue without ejecting user data.
 */
function patrolIsLikelyDuplicateInsertError(err) {
  var msg = String((err && err.message) ? err.message : err).toLowerCase();
  return (
    msg.indexOf('duplicate') !== -1 ||
    msg.indexOf('unique') !== -1 ||
    msg.indexOf('23505') !== -1
  );
}

window.patrolIsLikelyDuplicateInsertError = patrolIsLikelyDuplicateInsertError;

// ── Stores ──

async function getStores(filters) {
  var f = filters || {};
  var session = getSession();
  var query = supabaseClient.from('stores').select('*');

  // TSR auto-filter: see stores they created OR were assigned to them
  if (session && session.role === 'tsr') {
    query = query.or('created_by.eq.' + session.id + ',assigned_tsr.eq.' + session.id);
  }

  if (f.territory) query = query.eq('territory', f.territory);
  if (f.region) query = query.eq('region', f.region);
  if (f.health_status) query = query.eq('health_status', f.health_status);
  if (f.store_status) query = query.eq('store_status', f.store_status);
  if (f.search) {
    var safeSearch = f.search.replace(/[%_\\]/g, function (c) { return '\\' + c; });
    query = query.ilike('name', '%' + safeSearch + '%');
  }

  query = query.order('name', { ascending: true });

  var { data, error } = await query;
  if (error) {
    if (typeof navigator !== 'undefined' && !navigator.onLine && typeof getCachedStores === 'function') {
      var cached = await getCachedStores();
      if (cached && cached.length) return cached;
    }
    throw new Error('getStores: ' + error.message);
  }
  var rows = data || [];
  if (rows.length && typeof cacheStores === 'function') {
    try {
      var now = new Date().toISOString();
      await cacheStores(rows.map(function (s) {
        var c = {};
        var key;
        for (key in s) { if (Object.prototype.hasOwnProperty.call(s, key)) c[key] = s[key]; }
        c.updated_at = now;
        return c;
      }));
    } catch (cacheErr) { /* non-fatal */ }
  }
  return rows;
}

// Mirrors the chatbot's quick-reply values (app.html:1623) plus 'other'.
// Kept in sync with the stores_store_type_check constraint on the DB
// (see migrations/stores-store-type-widen-check.sql). Defence-in-depth:
// if a future flow emits a value not in this set, normalize to 'other'
// so the INSERT can't be rejected by the constraint and silently ejected
// by offline.js after 3 retries.
var STORE_TYPE_ALLOWED = ['feeds_dealer', 'farm', 'pet_shop', 'other'];

async function createStore(storeData) {
  var session = getSession();
  storeData.created_by = session ? session.id : null;

  // Normalize store_type to a constraint-safe value. NULL passes through.
  if (storeData.store_type != null && STORE_TYPE_ALLOWED.indexOf(storeData.store_type) === -1) {
    console.warn('[createStore] non-allowed store_type "' + storeData.store_type + '" — normalising to "other"');
    storeData.store_type = 'other';
  }

  var { data, error } = await supabaseClient
    .from('stores')
    .insert(storeData)
    .select()
    .single();

  if (error) throw new Error('createStore: ' + error.message);
  return data;
}

async function updateStore(id, data) {
  var { data: updated, error } = await supabaseClient
    .from('stores')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error('updateStore: ' + error.message);
  return updated;
}

// ── Farms (Sprint A.1 — H-07) ──

async function createFarm(farmData) {
  var session = getSession();
  if (!session || !session.id) throw new Error('createFarm: no active session');

  // Ensure heads is integer (chatbot text input arrives as string)
  if (farmData.heads) farmData.heads = parseInt(farmData.heads, 10) || 0;

  // W1-AuthCore: Bearer JWT replaces x-session-id.
  var bearer = (typeof window.getAuthBearer === 'function') ? await window.getAuthBearer() : null;
  if (!bearer) throw new Error('createFarm: no auth token');

  var res = await fetch('/api/farms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + bearer
    },
    body: JSON.stringify(farmData)
  });

  var data = await res.json().catch(function () { return null; });
  if (!res.ok) {
    var detail = data && (data.message || data.error || (data.detail && data.detail.message));
    throw new Error('createFarm: ' + (detail || ('HTTP ' + res.status)));
  }
  return data;
}

async function getStoreById(id) {
  var { data: store, error } = await supabaseClient
    .from('stores')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error('getStoreById: ' + error.message);

  // Fetch related data
  var { data: products } = await supabaseClient
    .from('store_products')
    .select('*')
    .eq('store_id', id);

  var { data: competitors } = await supabaseClient
    .from('store_competitors')
    .select('*')
    .eq('store_id', id);

  store.products = products || [];
  store.competitors = competitors || [];
  return store;
}

// ── Store Products & Competitors ──

async function upsertStoreProducts(storeId, products) {
  // Delete existing
  await supabaseClient.from('store_products').delete().eq('store_id', storeId);

  if (!products || products.length === 0) return [];

  var rows = products.map(function (p) {
    p.store_id = storeId;
    return p;
  });

  var { data, error } = await supabaseClient
    .from('store_products')
    .insert(rows)
    .select();

  if (error) throw new Error('upsertStoreProducts: ' + error.message);
  return data || [];
}

async function upsertStoreCompetitors(storeId, competitors) {
  await supabaseClient.from('store_competitors').delete().eq('store_id', storeId);

  if (!competitors || competitors.length === 0) return [];

  var rows = competitors.map(function (c) {
    c.store_id = storeId;
    return c;
  });

  var { data, error } = await supabaseClient
    .from('store_competitors')
    .insert(rows)
    .select();

  if (error) throw new Error('upsertStoreCompetitors: ' + error.message);
  return data || [];
}

// ── Visits ──

async function createVisit(visitData) {
  var { data, error } = await supabaseClient
    .from('visits')
    .insert(visitData)
    .select()
    .single();

  if (error) throw new Error('createVisit: ' + error.message);
  return data;
}

async function getVisitsByStore(storeId) {
  var { data, error } = await supabaseClient
    .from('visits')
    .select('*')
    .eq('store_id', storeId)
    .order('visited_at', { ascending: false });

  if (error) throw new Error('getVisitsByStore: ' + error.message);
  return data || [];
}

async function getVisitsByTSR(tsrId, dateFrom) {
  var query = supabaseClient
    .from('visits')
    .select('*')
    .eq('tsr_id', tsrId)
    .order('visited_at', { ascending: false });

  if (dateFrom) query = query.gte('visited_at', dateFrom);

  var { data, error } = await query;
  if (error) throw new Error('getVisitsByTSR: ' + error.message);
  return data || [];
}

/** DSM/RSM/CEO: all visits logged by TSRs/champions under this manager (flat team list). */
async function getVisitsForManagerTeam(managerId) {
  var members = await getTeamMembersForStoresFilter(managerId);
  var ids = [];
  for (var i = 0; i < (members || []).length; i++) {
    if (members[i].id) ids.push(members[i].id);
  }
  if (!ids.length) return [];
  var res = await supabaseClient
    .from('visits')
    .select('*')
    .in('tsr_id', ids)
    .order('visited_at', { ascending: false });
  if (res.error) throw new Error('getVisitsForManagerTeam: ' + res.error.message);
  return res.data || [];
}

/**
 * DSM read-only Squad feed data: newest team visits enriched with TSR + store names.
 * Returns [] on any failure so caller can render a safe empty state.
 */
async function getRecentTeamActivity(managerId, limit) {
  var maxRows = parseInt(limit, 10);
  if (!maxRows || maxRows < 1) maxRows = 15;

  try {
    var members = await getTeamMembersForStoresFilter(managerId);
    var ids = [];
    for (var mi = 0; mi < (members || []).length; mi++) {
      if (members[mi] && members[mi].id) ids.push(members[mi].id);
    }
    if (!ids.length) return [];

    var visitRes = await supabaseClient
      .from('visits')
      .select('*')
      .in('tsr_id', ids)
      .order('visited_at', { ascending: false })
      .limit(maxRows);
    if (visitRes.error) throw new Error('getRecentTeamActivity visits: ' + visitRes.error.message);
    var visits = visitRes.data || [];
    if (!visits || !visits.length) return [];

    var stores = [];
    var users = [];
    try { stores = await getStores(); } catch (eStores) { stores = []; }
    try { users = await getUsers(); } catch (eUsers) { users = []; }

    var storeMap = {};
    for (var si = 0; si < (stores || []).length; si++) {
      if (stores[si] && stores[si].id) storeMap[stores[si].id] = stores[si].name || 'Store';
    }
    var userMap = {};
    for (var ui = 0; ui < (users || []).length; ui++) {
      if (users[ui] && users[ui].id) userMap[users[ui].id] = users[ui].name || 'TSR';
    }

    var out = [];
    for (var i = 0; i < visits.length; i++) {
      var v = visits[i] || {};
      out.push({
        id: v.id,
        tsr_id: v.tsr_id || '',
        tsr_name: userMap[v.tsr_id] || 'TSR',
        store_id: v.store_id || '',
        store_name: storeMap[v.store_id] || 'Store',
        visited_at: v.visited_at || null,
        order_taken: !!v.order_taken,
        order_amount: Number(v.order_amount || 0),
        notes: v.notes || '',
        photo_url: v.photo_url || ''
      });
    }
    return out;
  } catch (e) {
    console.warn('getRecentTeamActivity:', e && e.message ? e.message : e);
    return [];
  }
}
window.getRecentTeamActivity = getRecentTeamActivity;

// ── DSM Summary ──

async function getDSMSummary(district, dateFrom) {
  // Get stores in district
  var { data: stores, error: stErr } = await supabaseClient
    .from('stores')
    .select('id, name, health_status, territory')
    .eq('district', district);

  if (stErr) throw new Error('getDSMSummary stores: ' + stErr.message);

  // Get visits in date range
  var storeIds = (stores || []).map(function (s) { return s.id; });
  var visits = [];

  if (storeIds.length > 0) {
    var query = supabaseClient
      .from('visits')
      .select('*')
      .in('store_id', storeIds)
      .order('visited_at', { ascending: false });

    if (dateFrom) query = query.gte('visited_at', dateFrom);

    var { data: v, error: vErr } = await query;
    if (vErr) throw new Error('getDSMSummary visits: ' + vErr.message);
    visits = v || [];
  }

  return {
    totalStores: (stores || []).length,
    stores: stores || [],
    totalVisits: visits.length,
    visits: visits
  };
}

// ── Users (Admin) ──

async function getUsers() {
  var { data, error } = await supabaseClient
    .from('users')
    .select(
      'id,name,phone,role,region,district,territory,is_active,is_champion,created_at,updated_at,pin_hash'
    )
    .order('name', { ascending: true });

  if (error) throw new Error('getUsers: ' + error.message);
  return (data || []).map(function (u) {
    var row = Object.assign({}, u);
    row.has_pin = !!(row.pin_hash && String(row.pin_hash).length > 0);
    delete row.pin_hash;
    return row;
  });
}

/**
 * Same as getUsers but keeps `pin_hash` for admin.html only.
 * Patrol app screens must keep using getUsers() so PIN material never reaches the field app.
 */
async function getUsersForAdmin() {
  var { data, error } = await supabaseClient
    .from('users')
    .select(
      'id,name,phone,email,role,region,district,territory,is_active,is_champion,created_at,updated_at,pin_hash'
    )
    .order('name', { ascending: true });

  if (error) throw new Error('getUsersForAdmin: ' + error.message);
  return (data || []).map(function (u) {
    var row = Object.assign({}, u);
    row.has_pin = !!(row.pin_hash && String(row.pin_hash).length > 0);
    return row;
  });
}

async function createUser(userData) {
  var { data, error } = await supabaseClient
    .from('users')
    .insert(userData)
    .select()
    .single();

  if (error) throw new Error('createUser: ' + error.message);
  return data;
}

async function updateUser(id, data) {
  var { data: updated, error } = await supabaseClient
    .from('users')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error('updateUser: ' + error.message);
  return updated;
}

// ── Team hierarchy (Sprint A: manager -> direct reports) ──

async function getDirectReports(userId, role) {
  // Users whose manager_id = this person
  var result = await supabaseClient
    .from('users')
    .select('id, name, phone, role, region, district, territory')
    .eq('manager_id', userId)
    .eq('is_active', true);

  if (result.error) { console.warn('getDirectReports:', result.error.message); return []; }
  var members = result.data || [];
  if (members.length === 0) return [];

  var todayIso = new Date().toISOString().split('T')[0];

  var enriched = await Promise.all(members.map(async function (m) {
    var vRes = await supabaseClient
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('tsr_id', m.id)
      .gte('visited_at', todayIso);
    var sRes = await supabaseClient
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_tsr', m.id);
    m.visits_today = vRes.count || 0;
    m.assigned_stores = sRes.count || 0;
    return m;
  }));
  return enriched;
}

/**
 * TSR/champion rows for the Tindahan assignee chip strip (stores.js).
 * DSM: direct reports. RSM/CEO: TSRs under reporting DSMs, else flat direct reports.
 */
async function getTeamMembersForStoresFilter(managerId) {
  var session = typeof getSession === 'function' ? getSession() : null;
  var role = (session && session.role ? String(session.role) : '').toLowerCase();
  var collected = [];

  function addRep(r) {
    if (!r || !r.id) return;
    var rl = (r.role || '').toLowerCase();
    if (rl !== 'tsr' && rl !== 'champion') return;
    collected.push({ id: r.id, name: r.name || 'TSR' });
  }

  async function dedupe() {
    var seen = {};
    var out = [];
    for (var i = 0; i < collected.length; i++) {
      var x = collected[i];
      if (seen[x.id]) continue;
      seen[x.id] = true;
      out.push(x);
    }
    return out;
  }

  if (!managerId) return [];

  if (role === 'rsm' || role === 'ceo') {
    var layer1 = await getDirectReports(managerId);
    for (var i = 0; i < (layer1 || []).length; i++) {
      var node = layer1[i];
      var nr = (node.role || '').toLowerCase();
      if (nr === 'dsm') {
        var tsrs = await getDirectReports(node.id);
        for (var j = 0; j < (tsrs || []).length; j++) addRep(tsrs[j]);
      } else {
        addRep(node);
      }
    }
    if (collected.length === 0) {
      var flat = await getDirectReports(managerId);
      for (var k = 0; k < (flat || []).length; k++) addRep(flat[k]);
    }
    return dedupe();
  }

  var reps = await getDirectReports(managerId);
  for (var r = 0; r < (reps || []).length; r++) addRep(reps[r]);
  return dedupe();
}

async function getTeamKPIs(userId, role) {
  var todayIso = new Date().toISOString().split('T')[0];

  var reportsRes = await supabaseClient
    .from('users')
    .select('id')
    .eq('manager_id', userId)
    .eq('is_active', true);

  var reportIds = ((reportsRes.data) || []).map(function (r) { return r.id; });
  if (reportIds.length === 0) {
    return { visits_today: 0, active_tsrs: 0, stores_covered: 0, total_reports: 0 };
  }

  var countRes = await supabaseClient
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .in('tsr_id', reportIds)
    .gte('visited_at', todayIso);

  var visitsRes = await supabaseClient
    .from('visits')
    .select('store_id, tsr_id')
    .in('tsr_id', reportIds)
    .gte('visited_at', todayIso);

  var visits = visitsRes.data || [];
  var uniqueStores = {};
  var activeTsrs = {};
  for (var i = 0; i < visits.length; i++) {
    if (visits[i].store_id) uniqueStores[visits[i].store_id] = 1;
    if (visits[i].tsr_id) activeTsrs[visits[i].tsr_id] = 1;
  }

  return {
    visits_today: countRes.count || 0,
    active_tsrs: Object.keys(activeTsrs).length,
    stores_covered: Object.keys(uniqueStores).length,
    total_reports: reportIds.length
  };
}

// ── Store Assignment (DSM → TSR) ──

async function getTSRsByDistrict(district) {
  var query = supabaseClient
    .from('users')
    .select('*')
    .eq('role', 'tsr')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (district) query = query.eq('district', district);

  var { data, error } = await query;
  if (error) throw new Error('getTSRsByDistrict: ' + error.message);
  return data || [];
}

async function getUnassignedStores(district) {
  var query = supabaseClient
    .from('stores')
    .select('*')
    .is('assigned_tsr', null)
    .order('name', { ascending: true });

  if (district) query = query.eq('region', district);

  var { data, error } = await query;
  if (error) throw new Error('getUnassignedStores: ' + error.message);
  return data || [];
}

async function getStoresByTSR(tsrId) {
  var { data, error } = await supabaseClient
    .from('stores')
    .select('*')
    .eq('assigned_tsr', tsrId)
    .order('name', { ascending: true });

  if (error) throw new Error('getStoresByTSR: ' + error.message);
  return data || [];
}

/** Active TSRs in a sales region (RSM / CEO map legend + scoping helpers). */
async function getTSRsByRegion(region) {
  var query = supabaseClient
    .from('users')
    .select('id,name,territory,district,region')
    .eq('role', 'tsr')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (region) query = query.eq('region', region);

  var { data, error } = await query;
  if (error) throw new Error('getTSRsByRegion: ' + error.message);
  return data || [];
}

/**
 * Stores visible on the territory map — scoped for DSM/RSM/CEO; TSR unchanged.
 * Does not change global getStores() used by the store list (narrower map-only scope).
 */
async function getStoresForTerritoryMap() {
  var session = getSession();
  if (!session) return [];

  var role = (session.role || 'tsr').toLowerCase();

  if (role === 'tsr' || role === 'champion') {
    return getStores();
  }

  if (role === 'dsm' && session.district) {
    var team = await getTSRsByDistrict(session.district);
    var idList = team.map(function (u) {
      return u.id;
    });
    idList.push(session.id);

    var orClause =
      'assigned_tsr.in.(' + idList.join(',') + '),' + 'created_by.in.(' + idList.join(',') + ')';

    var res = await supabaseClient.from('stores').select('*').or(orClause).order('name', { ascending: true });

    if (res.error) throw new Error('getStoresForTerritoryMap: ' + res.error.message);

    var rows = res.data || [];
    var seen = {};
    var i;
    for (i = 0; i < rows.length; i++) seen[rows[i].id] = rows[i];

    var q2 = await supabaseClient.from('stores').select('*').eq('district', session.district).order('name', { ascending: true });
    if (!q2.error && q2.data) {
      for (var j = 0; j < q2.data.length; j++) {
        var s = q2.data[j];
        if (!seen[s.id]) seen[s.id] = s;
      }
    }

    var merged = [];
    for (var k in seen) merged.push(seen[k]);
    merged.sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });
    return merged;
  }

  if ((role === 'rsm' || role === 'ceo') && session.region) {
    return getStores({ region: session.region });
  }

  return getStores();
}

/**
 * Farms table rows for the map — same role rules as getStoresForTerritoryMap.
 */
async function getFarmsForTerritoryMap() {
  var session = getSession();
  if (!session) return [];

  var role = (session.role || 'tsr').toLowerCase();

  if (role === 'tsr' || role === 'champion') {
    var r0 = await supabaseClient
      .from('farms')
      .select('*')
      .or('created_by.eq.' + session.id + ',assigned_tsr.eq.' + session.id)
      .order('name', { ascending: true });
    if (r0.error) throw new Error('getFarmsForTerritoryMap: ' + r0.error.message);
    return r0.data || [];
  }

  if (role === 'dsm' && session.district) {
    var teamD = await getTSRsByDistrict(session.district);
    var idListD = teamD.map(function (u) {
      return u.id;
    });
    idListD.push(session.id);

    var orD =
      'assigned_tsr.in.(' + idListD.join(',') + '),' + 'created_by.in.(' + idListD.join(',') + ')';

    var r1 = await supabaseClient.from('farms').select('*').or(orD).order('name', { ascending: true });
    if (r1.error) throw new Error('getFarmsForTerritoryMap: ' + r1.error.message);

    var rowsD = r1.data || [];
    var seenD = {};
    var a;
    for (a = 0; a < rowsD.length; a++) seenD[rowsD[a].id] = rowsD[a];

    if (session.region) {
      var r2 = await supabaseClient
        .from('farms')
        .select('*')
        .eq('region', session.region)
        .order('name', { ascending: true });
      if (!r2.error && r2.data) {
        for (var b = 0; b < r2.data.length; b++) {
          var f = r2.data[b];
          if (!seenD[f.id]) seenD[f.id] = f;
        }
      }
    }

    var outD = [];
    for (var kd in seenD) outD.push(seenD[kd]);
    outD.sort(function (x, y) {
      return (x.name || '').localeCompare(y.name || '');
    });
    return outD;
  }

  if ((role === 'rsm' || role === 'ceo') && session.region) {
    var rr = await supabaseClient
      .from('farms')
      .select('*')
      .eq('region', session.region)
      .order('name', { ascending: true });
    if (rr.error) throw new Error('getFarmsForTerritoryMap: ' + rr.error.message);
    return rr.data || [];
  }

  var rAll = await supabaseClient.from('farms').select('*').order('name', { ascending: true });
  if (rAll.error) throw new Error('getFarmsForTerritoryMap: ' + rAll.error.message);
  return rAll.data || [];
}

async function assignStores(storeIds, tsrId) {
  if (!storeIds || storeIds.length === 0) return;

  var { error } = await supabaseClient
    .from('stores')
    .update({ assigned_tsr: tsrId, updated_at: new Date().toISOString() })
    .in('id', storeIds);

  if (error) throw new Error('assignStores: ' + error.message);
}

async function unassignStores(storeIds) {
  if (!storeIds || storeIds.length === 0) return;

  var { error } = await supabaseClient
    .from('stores')
    .update({ assigned_tsr: null, updated_at: new Date().toISOString() })
    .in('id', storeIds);

  if (error) throw new Error('unassignStores: ' + error.message);
}

async function getAssignmentCounts() {
  var { data, error } = await supabaseClient
    .from('stores')
    .select('assigned_tsr')
    .not('assigned_tsr', 'is', null)
    .limit(1000);

  if (error) throw new Error('getAssignmentCounts: ' + error.message);

  var counts = {};
  for (var i = 0; i < (data || []).length; i++) {
    var tid = data[i].assigned_tsr;
    if (tid) {
      counts[tid] = (counts[tid] || 0) + 1;
    }
  }
  return counts;
}

async function getUnassignedFarms(district) {
  var query = supabaseClient
    .from('farms')
    .select('*')
    .is('assigned_tsr', null)
    .order('name', { ascending: true });

  if (district) query = query.eq('region', district);

  var { data, error } = await query;
  if (error) throw new Error('getUnassignedFarms: ' + error.message);
  return data || [];
}

async function getFarmsByTSR(tsrId) {
  var { data, error } = await supabaseClient
    .from('farms')
    .select('*')
    .eq('assigned_tsr', tsrId)
    .order('name', { ascending: true });

  if (error) throw new Error('getFarmsByTSR: ' + error.message);
  return data || [];
}

async function assignFarms(farmIds, tsrId) {
  if (!farmIds || farmIds.length === 0) return;

  var { error } = await supabaseClient
    .from('farms')
    .update({ assigned_tsr: tsrId, updated_at: new Date().toISOString() })
    .in('id', farmIds);

  if (error) throw new Error('assignFarms: ' + error.message);
}

async function unassignFarms(farmIds) {
  if (!farmIds || farmIds.length === 0) return;

  var { error } = await supabaseClient
    .from('farms')
    .update({ assigned_tsr: null, updated_at: new Date().toISOString() })
    .in('id', farmIds);

  if (error) throw new Error('unassignFarms: ' + error.message);
}

async function getFarmAssignmentCounts() {
  var { data, error } = await supabaseClient
    .from('farms')
    .select('assigned_tsr')
    .not('assigned_tsr', 'is', null)
    .limit(1000);

  if (error) throw new Error('getFarmAssignmentCounts: ' + error.message);

  var counts = {};
  for (var i = 0; i < (data || []).length; i++) {
    var tid = data[i].assigned_tsr;
    if (tid) counts[tid] = (counts[tid] || 0) + 1;
  }
  return counts;
}

// ── Champion Team + Leaderboard ──

async function getChampionTeam(district) {
  // Get active TSRs in same district as the champion
  var query = supabaseClient
    .from('users')
    .select('id, name, territory, district')
    .eq('role', 'tsr')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (district) query = query.eq('district', district);

  var { data: tsrs, error: tErr } = await query;
  if (tErr) throw new Error('getChampionTeam: ' + tErr.message);
  tsrs = tsrs || [];

  if (tsrs.length === 0) return [];

  // Get assignment counts
  var assignCounts = await getAssignmentCounts();

  // Get visits from start of current week (Monday)
  var now = new Date();
  var dayOfWeek = now.getDay(); // 0=Sun
  var mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  var weekStart = monday.toISOString();

  var tsrIds = tsrs.map(function (t) { return t.id; });
  var { data: visits, error: vErr } = await supabaseClient
    .from('visits')
    .select('tsr_id')
    .in('tsr_id', tsrIds)
    .gte('visited_at', weekStart);

  if (vErr) throw new Error('getChampionTeam visits: ' + vErr.message);
  visits = visits || [];

  // Count visits per TSR
  var visitCounts = {};
  for (var i = 0; i < visits.length; i++) {
    var tid = visits[i].tsr_id;
    visitCounts[tid] = (visitCounts[tid] || 0) + 1;
  }

  // Build result
  var team = [];
  for (var t = 0; t < tsrs.length; t++) {
    var tsr = tsrs[t];
    var assigned = assignCounts[tsr.id] || 0;
    // Target: assigned stores count, minimum 1 to avoid /0
    var target = assigned > 0 ? assigned : 8;
    team.push({
      id: tsr.id,
      name: tsr.name,
      territory: tsr.territory || tsr.district || '--',
      visitsThisWeek: visitCounts[tsr.id] || 0,
      targetVisits: target,
      assignedStores: assigned
    });
  }

  return team;
}

async function getWeeklyLeaderboard(currentUserId) {
  // Get all active TSRs
  var { data: tsrs, error: tErr } = await supabaseClient
    .from('users')
    .select('id, name, territory, district')
    .eq('role', 'tsr')
    .eq('is_active', true);

  if (tErr) throw new Error('getWeeklyLeaderboard: ' + tErr.message);
  tsrs = tsrs || [];

  // Week start (Monday)
  var now = new Date();
  var dayOfWeek = now.getDay();
  var mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  var weekStart = monday.toISOString();

  // Get all visits this week
  var { data: visits, error: vErr } = await supabaseClient
    .from('visits')
    .select('tsr_id')
    .gte('visited_at', weekStart);

  if (vErr) throw new Error('getWeeklyLeaderboard visits: ' + vErr.message);
  visits = visits || [];

  // Count per TSR
  var visitCounts = {};
  for (var i = 0; i < visits.length; i++) {
    var tid = visits[i].tsr_id;
    visitCounts[tid] = (visitCounts[tid] || 0) + 1;
  }

  // Build ranked list
  var ranked = [];
  for (var t = 0; t < tsrs.length; t++) {
    ranked.push({
      id: tsrs[t].id,
      name: tsrs[t].name,
      territory: tsrs[t].territory || tsrs[t].district || '--',
      visits: visitCounts[tsrs[t].id] || 0
    });
  }

  ranked.sort(function (a, b) { return b.visits - a.visits; });

  // Find current user's rank
  var myRank = -1;
  var myEntry = null;
  for (var r = 0; r < ranked.length; r++) {
    if (ranked[r].id === currentUserId) {
      myRank = r + 1;
      myEntry = ranked[r];
      break;
    }
  }

  return {
    top3: ranked.slice(0, 3),
    myRank: myRank,
    myEntry: myEntry,
    totalTSRs: ranked.length
  };
}

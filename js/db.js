// Database Module — all Supabase CRUD queries

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
  if (error) throw new Error('getStores: ' + error.message);
  return data || [];
}

async function createStore(storeData) {
  var session = getSession();
  storeData.created_by = session ? session.id : null;

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
  farmData.created_by = session ? session.id : null;

  // Map chatbot's generic "type" -> DB's farm_type column
  if (farmData.type && !farmData.farm_type) {
    farmData.farm_type = farmData.type;
    delete farmData.type;
  }
  // Ensure heads is integer (chatbot text input arrives as string)
  if (farmData.heads) farmData.heads = parseInt(farmData.heads, 10) || 0;

  var { data, error } = await supabaseClient
    .from('farms')
    .insert(farmData)
    .select()
    .single();

  if (error) throw new Error('createFarm: ' + error.message);
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
    .select('id,name,phone,role,region,district,territory,is_active,is_champion,created_at,updated_at')
    .order('name', { ascending: true });

  if (error) throw new Error('getUsers: ' + error.message);
  return data || [];
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

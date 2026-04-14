// Database Module — all Supabase CRUD queries

// ── Stores ──

async function getStores(filters) {
  var f = filters || {};
  var session = getSession();
  var query = supabaseClient.from('stores').select('*');

  // TSR auto-filter: only see own stores
  if (session && session.role === 'tsr') {
    query = query.eq('assigned_tsr', session.id);
  }

  if (f.territory) query = query.eq('territory', f.territory);
  if (f.region) query = query.eq('region', f.region);
  if (f.health_status) query = query.eq('health_status', f.health_status);
  if (f.search) query = query.ilike('name', '%' + f.search + '%');

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
    .select('*')
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

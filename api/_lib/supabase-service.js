// Minimal Supabase REST helpers (service role) for admin APIs.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yolxcmeoovztuindrglk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function serviceHeaders(extra) {
  return Object.assign(
    {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json'
    },
    extra || {}
  );
}

function missingServiceKey() {
  return { ok: false, status: 503, body: { error: 'SUPABASE_SERVICE_ROLE_KEY missing' } };
}

async function sbGet(pathWithQuery) {
  if (!SERVICE_KEY) return missingServiceKey();
  const res = await fetch(SUPABASE_URL + pathWithQuery, {
    method: 'GET',
    headers: serviceHeaders({ Prefer: 'return=representation' })
  });
  let body = [];
  try {
    body = await res.json();
  } catch (_) {
    body = [];
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: { error: 'SUPABASE_READ_FAILED', message: (body && body.message) || res.statusText }
    };
  }
  return { ok: true, status: res.status, body: body };
}

async function sbPost(table, rows, prefer, onConflict) {
  if (!SERVICE_KEY) return missingServiceKey();
  const conflictQuery = onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : '';
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + conflictQuery, {
    method: 'POST',
    headers: serviceHeaders({
      Prefer: prefer || 'return=representation,resolution=merge-duplicates'
    }),
    body: JSON.stringify(rows)
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: { error: 'SUPABASE_WRITE_FAILED', message: (body && body.message) || res.statusText }
    };
  }
  return { ok: true, status: res.status, body: body };
}

async function sbPatch(table, filterQuery, patch) {
  if (!SERVICE_KEY) return missingServiceKey();
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + filterQuery, {
    method: 'PATCH',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body: { error: 'SUPABASE_WRITE_FAILED', message: (body && body.message) || res.statusText }
    };
  }
  return { ok: true, status: res.status, body: body };
}

async function sbDelete(table, filterQuery) {
  if (!SERVICE_KEY) return missingServiceKey();
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + filterQuery, {
    method: 'DELETE',
    headers: serviceHeaders()
  });
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      body = null;
    }
    return {
      ok: false,
      status: res.status,
      body: { error: 'SUPABASE_DELETE_FAILED', message: (body && body.message) || res.statusText }
    };
  }
  return { ok: true, status: res.status, body: null };
}

module.exports = { SUPABASE_URL, sbGet, sbPost, sbPatch, sbDelete };

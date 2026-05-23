// GET/POST /api/admin/org — Patrol Region / District / Territory master data
// Districts & regions sync from SAP (HQ + sap_accounts + user sap_district_code).
// Territories are Patrol-managed only.
//
// Wave 1 (W1-ApiGates): role-gated via requireRole(['admin','ceo','evp','marketing'])
// and every Supabase call wrapped in try/catch.

const { requireRole } = require('../_lib/api-auth');
const { applyPatrolCors } = require('../_lib/patrol-cors');
const { sbGet, sbPost, sbPatch, sbDelete } = require('../_lib/supabase-service');
const { upsertOrgFromSap, norm } = require('../_lib/org-sync');

const ADMIN_ROLES = ['admin', 'ceo', 'evp', 'marketing'];

function encodeEq(col, val) {
  return col + '=eq.' + encodeURIComponent(val);
}

async function loadOrgTree() {
  try {
    var regionsRes = await sbGet(
      '/rest/v1/patrol_org_regions?select=id,name,sap_region_code,source,is_active,sort_order&order=sort_order.asc,name.asc'
    );
    if (!regionsRes.ok) return regionsRes;

    var districtsRes = await sbGet(
      '/rest/v1/patrol_org_districts?select=id,region_id,name,sap_district_code,sap_district_label,source,is_active,sort_order&order=sort_order.asc,name.asc'
    );
    if (!districtsRes.ok) return districtsRes;

    var territoriesRes = await sbGet(
      '/rest/v1/patrol_org_territories?select=id,district_id,name,is_active,sort_order&order=sort_order.asc,name.asc'
    );
    if (!territoriesRes.ok) return territoriesRes;

    var usersRes = await sbGet('/rest/v1/users?select=id,region,district,territory,is_active&limit=5000');
    var users = usersRes.ok ? usersRes.body || [] : [];

    function countUsers(regionName, districtName, territoryName) {
      var n = 0;
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        if (u.is_active === false) continue;
        if (territoryName) {
          if (norm(u.territory) === norm(territoryName) && norm(u.district) === norm(districtName)) {
            n++;
          }
        } else if (districtName) {
          if (norm(u.district) === norm(districtName)) n++;
        } else if (regionName) {
          if (norm(u.region) === norm(regionName)) n++;
        }
      }
      return n;
    }

    var districts = districtsRes.body || [];
    var territories = territoriesRes.body || [];
    var territoriesByDistrict = {};
    for (var t = 0; t < territories.length; t++) {
      var terr = territories[t];
      if (!territoriesByDistrict[terr.district_id]) territoriesByDistrict[terr.district_id] = [];
      var territoryDistrict = null;
      for (var td = 0; td < districts.length; td++) {
        if (districts[td].id === terr.district_id) {
          territoryDistrict = districts[td];
          break;
        }
      }
      territoriesByDistrict[terr.district_id].push(
        Object.assign({}, terr, {
          user_count: countUsers(null, territoryDistrict ? territoryDistrict.name : null, terr.name)
        })
      );
    }

    var districtsByRegion = {};
    for (var d = 0; d < districts.length; d++) {
      var dist = districts[d];
      if (!districtsByRegion[dist.region_id]) districtsByRegion[dist.region_id] = [];
      districtsByRegion[dist.region_id].push(
        Object.assign({}, dist, {
          territories: territoriesByDistrict[dist.id] || [],
          user_count: countUsers(null, dist.name, null)
        })
      );
    }

    var regions = (regionsRes.body || []).map(function (r) {
      return Object.assign({}, r, {
        districts: districtsByRegion[r.id] || [],
        user_count: countUsers(r.name, null, null)
      });
    });

    return {
      ok: true,
      status: 200,
      body: { regions: regions, generated_at: new Date().toISOString() }
    };
  } catch (err) {
    console.error('[api/admin/org] loadOrgTree crashed:', (err && err.message) || err);
    return { ok: false, status: 502, body: { error: 'SUPABASE_UNREACHABLE', message: 'Could not load org tree' } };
  }
}

async function handlePost(req, session, body) {
  var action = String((body && body.action) || '').toLowerCase();
  var now = new Date().toISOString();

  try {
    if (action === 'sync_sap') {
      return await upsertOrgFromSap(session);
    }

    if (action === 'territory_create') {
      var districtId = body.district_id;
      var tName = norm(body.name);
      if (!districtId || !tName) {
        return { ok: false, status: 400, body: { error: 'district_id and name required' } };
      }
      return await sbPost(
        'patrol_org_territories',
        [{ district_id: districtId, name: tName, is_active: true, updated_at: now }],
        'return=representation'
      );
    }

    if (action === 'territory_update') {
      var id = body.id;
      if (!id) return { ok: false, status: 400, body: { error: 'id required' } };
      var patch = { updated_at: now };
      if (body.name != null) patch.name = norm(body.name);
      if (body.is_active != null) patch.is_active = !!body.is_active;
      return await sbPatch('patrol_org_territories', encodeEq('id', id), patch);
    }

    if (action === 'territory_delete') {
      var delId = body.id;
      if (!delId) return { ok: false, status: 400, body: { error: 'id required' } };
      return await sbDelete('patrol_org_territories', encodeEq('id', delId));
    }

    if (action === 'region_update') {
      var regionId = body.id;
      if (!regionId) return { ok: false, status: 400, body: { error: 'id required' } };
      var rPatch = { updated_at: now };
      if (body.is_active != null) rPatch.is_active = !!body.is_active;
      if (body.name != null) rPatch.name = norm(body.name);
      return await sbPatch('patrol_org_regions', encodeEq('id', regionId), rPatch);
    }

    if (action === 'district_update') {
      var distId = body.id;
      if (!distId) return { ok: false, status: 400, body: { error: 'id required' } };
      var dPatch = { updated_at: now };
      if (body.is_active != null) dPatch.is_active = !!body.is_active;
      if (body.name != null) dPatch.name = norm(body.name);
      return await sbPatch('patrol_org_districts', encodeEq('id', distId), dPatch);
    }

    return { ok: false, status: 400, body: { error: 'Unknown action' } };
  } catch (err) {
    console.error('[api/admin/org] handlePost crashed:', (err && err.message) || err);
    return { ok: false, status: 502, body: { error: 'SUPABASE_UNREACHABLE', message: 'Org mutation failed' } };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  applyPatrolCors(req, res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let session;
  try {
    session = await requireRole(req, ADMIN_ROLES);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  if (req.method === 'GET') {
    const out = await loadOrgTree();
    return res.status(out.status).json(out.body || out);
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (!body || typeof body !== 'object') {
      try {
        body = JSON.parse(req.body || '{}');
      } catch (_) {
        body = {};
      }
    }
    const out = await handlePost(req, session, body);
    if (!out.ok) return res.status(out.status).json(out.body || { error: 'Request failed' });
    return res.status(out.status || 200).json(out.body || { ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

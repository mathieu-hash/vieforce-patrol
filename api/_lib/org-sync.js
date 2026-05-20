// Build SAP-backed region/district rows for patrol_org_* upsert.

const { callHqProxy } = require('./hq-client');
const { sbGet } = require('./supabase-service');

function norm(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleCase(s) {
  var t = norm(s);
  if (!t) return '';
  return t
    .split(' ')
    .map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function addRegion(map, name, sapCode) {
  var key = norm(name).toLowerCase();
  if (!key) return;
  if (!map[key]) {
    map[key] = {
      name: norm(name),
      sap_region_code: sapCode ? String(sapCode) : null,
      source: 'sap'
    };
  }
}

function addDistrict(regionMap, districtMap, regionName, districtName, sapCode, sapLabel) {
  var rKey = norm(regionName).toLowerCase();
  var dName = norm(districtName) || norm(sapLabel);
  if (!dName) return;
  if (!rKey) {
    rKey = 'unassigned';
    addRegion(regionMap, 'Unassigned', null);
  }
  addRegion(regionMap, regionMap[rKey] ? regionMap[rKey].name : titleCase(regionName || 'Unassigned'), null);

  var dKey = rKey + '::' + dName.toLowerCase();
  if (!districtMap[dKey]) {
    districtMap[dKey] = {
      region_key: rKey,
      name: dName,
      sap_district_code: sapCode != null && sapCode !== '' ? Number(sapCode) : null,
      sap_district_label: sapLabel ? norm(sapLabel) : null,
      source: 'sap'
    };
  } else if (sapCode != null && districtMap[dKey].sap_district_code == null) {
    districtMap[dKey].sap_district_code = Number(sapCode);
    districtMap[dKey].sap_district_label = sapLabel ? norm(sapLabel) : districtMap[dKey].sap_district_label;
  }
}

async function fetchHqOrg(session) {
  var paths = ['/api/admin/org-master', '/api/admin/sales-districts', '/api/admin/districts'];
  for (var i = 0; i < paths.length; i++) {
    var { status, body } = await callHqProxy(paths[i], session, {});
    if (status >= 200 && status < 300 && body && typeof body === 'object') {
      return { ok: true, body: body };
    }
  }
  return { ok: false };
}

function ingestHqPayload(regionMap, districtMap, body) {
  var regions = body.regions || body.Regions || [];
  var districts = body.districts || body.Districts || body.sales_districts || [];
  if (Array.isArray(regions)) {
    for (var r = 0; r < regions.length; r++) {
      var reg = regions[r];
      addRegion(regionMap, reg.name || reg.region_name || reg.RegionName, reg.code || reg.region_code);
    }
  }
  if (Array.isArray(districts)) {
    for (var d = 0; d < districts.length; d++) {
      var dist = districts[d];
      addDistrict(
        regionMap,
        districtMap,
        dist.region || dist.region_name || dist.RegionName,
        dist.name || dist.district_name || dist.DistrictName || dist.label,
        dist.sap_district_code != null ? dist.sap_district_code : dist.code,
        dist.district_label || dist.sap_district_label
      );
    }
  }
}

async function fetchSupabaseSapHints() {
  var accounts = await sbGet(
    '/rest/v1/sap_accounts?select=region,district&region=not.is.null&limit=2000'
  );
  var users = await sbGet(
    '/rest/v1/users?select=region,district,sap_district_code,district_label&limit=2000'
  );
  return {
    accounts: accounts.ok ? accounts.body : [],
    users: users.ok ? users.body : []
  };
}

function ingestSupabaseHints(regionMap, districtMap, hints) {
  var accounts = hints.accounts || [];
  for (var a = 0; a < accounts.length; a++) {
    var row = accounts[a];
    addDistrict(regionMap, districtMap, row.region, row.district, null, row.district);
  }
  var users = hints.users || [];
  for (var u = 0; u < users.length; u++) {
    var usr = users[u];
    if (usr.sap_district_code != null || usr.district_label) {
      addDistrict(
        regionMap,
        districtMap,
        usr.region,
        usr.district || usr.district_label,
        usr.sap_district_code,
        usr.district_label
      );
    } else if (usr.region && usr.district) {
      addDistrict(regionMap, districtMap, usr.region, usr.district, null, usr.district);
    } else if (usr.region) {
      addRegion(regionMap, usr.region, null);
    }
  }
}

async function buildSapOrgPayload(session) {
  var regionMap = {};
  var districtMap = {};

  var hq = await fetchHqOrg(session);
  if (hq.ok) ingestHqPayload(regionMap, districtMap, hq.body);

  var hints = await fetchSupabaseSapHints();
  ingestSupabaseHints(regionMap, districtMap, hints);

  var regions = Object.keys(regionMap).map(function (k) {
    return regionMap[k];
  });
  var districts = Object.keys(districtMap).map(function (k) {
    return districtMap[k];
  });

  return {
    regions: regions,
    districts: districts,
    sources: {
      hq: hq.ok,
      sap_accounts: (hints.accounts || []).length,
      users_scanned: (hints.users || []).length
    }
  };
}

async function upsertOrgFromSap(session) {
  var payload = await buildSapOrgPayload(session);
  var regionRows = [];
  var now = new Date().toISOString();

  for (var i = 0; i < payload.regions.length; i++) {
    var r = payload.regions[i];
    regionRows.push({
      name: r.name,
      sap_region_code: r.sap_region_code,
      source: 'sap',
      is_active: true,
      updated_at: now
    });
  }

  var { sbPost, sbGet, sbPatch } = require('./supabase-service');

  var regionUpsert = await sbPost(
    'patrol_org_regions',
    regionRows,
    'return=representation,resolution=merge-duplicates',
    'name'
  );
  if (!regionUpsert.ok && regionUpsert.status !== 409) {
    return regionUpsert;
  }

  var existingRegions = await sbGet('/rest/v1/patrol_org_regions?select=id,name&limit=500');
  if (!existingRegions.ok) return existingRegions;

  var regionIdByKey = {};
  for (var ri = 0; ri < (existingRegions.body || []).length; ri++) {
    var er = existingRegions.body[ri];
    regionIdByKey[norm(er.name).toLowerCase()] = er.id;
  }

  var districtRows = [];
  for (var di = 0; di < payload.districts.length; di++) {
    var d = payload.districts[di];
    var rid = regionIdByKey[d.region_key];
    if (!rid) {
      var fallbackName = titleCase(d.region_key === 'unassigned' ? 'Unassigned' : d.region_key);
      if (!regionIdByKey[fallbackName.toLowerCase()]) {
        var ins = await sbPost(
          'patrol_org_regions',
          [{ name: fallbackName, source: 'sap', is_active: true, updated_at: now }],
          'return=representation'
        );
        if (ins.ok && ins.body && ins.body[0]) {
          regionIdByKey[fallbackName.toLowerCase()] = ins.body[0].id;
          rid = ins.body[0].id;
        }
      } else {
        rid = regionIdByKey[fallbackName.toLowerCase()];
      }
    }
    if (!rid) continue;
    districtRows.push({
      region_id: rid,
      name: d.name,
      sap_district_code: Number.isFinite(d.sap_district_code) ? d.sap_district_code : null,
      sap_district_label: d.sap_district_label,
      source: 'sap',
      is_active: true,
      updated_at: now
    });
  }

  if (districtRows.length) {
    var distUpsert = await sbPost(
      'patrol_org_districts',
      districtRows,
      'return=representation,resolution=merge-duplicates',
      'region_id,name'
    );
    if (!distUpsert.ok) return distUpsert;
  }

  return {
    ok: true,
    status: 200,
    body: {
      synced: true,
      regions: payload.regions.length,
      districts: payload.districts.length,
      sources: payload.sources
    }
  };
}

module.exports = { buildSapOrgPayload, upsertOrgFromSap, norm };

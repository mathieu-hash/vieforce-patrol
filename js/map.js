// Map Module — Mapbox GL JS (streets-v12, Google Maps quality)

// ── State ──
var _map = null;
var _markers = [];       // { marker, popup, store, el, visible }
var _farmMarkers = [];   // { marker, popup, store|farmRow, el, visible, isFarm, fromFarmsTable }
var _activeMapFilter = 'all';
var _geolocateCtrl = null;
var _mapFiltersWired = false;

// Distinct fills for DSM/RSM “one color per TSR” map mode (health → ring color).
var _TSR_MAP_PALETTE = [
  '#00A6CE', '#95C93D', '#F1B11D', '#AB47BC', '#5C6BC0', '#26A69A', '#EF5350',
  '#FF7043', '#42A5F5', '#66BB6A', '#EC407A', '#7E57C2', '#29B6F6', '#D4E157', '#FFCA28'
];

// ═══════════════════════════════════════════════════
// 1. initMap() — Initialize Mapbox GL on #map-container
// ═══════════════════════════════════════════════════

function initMap() {
  var container = document.getElementById('map-container');
  if (!container || _map) return _map;

  // OpenFreeMap + MapLibre GL — no token needed, free forever
  _map = new maplibregl.Map({
    container: 'map-container',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [121.0900, 14.6900],
    zoom: 12,
    attributionControl: false,
    maxBounds: [[116.0, 4.5], [127.0, 21.5]]
  });

  // Navigation controls (zoom +/-)
  _map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  // Geolocate — "locate me" with blue pulsing dot
  _geolocateCtrl = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
  });
  _map.addControl(_geolocateCtrl, 'top-right');

  // Small attribution
  _map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

  // Auto-center on user location on load
  _map.on('load', function() {
    _geolocateCtrl.trigger();
  });

  return _map;
}


// ═══════════════════════════════════════════════════
// 2. loadMapMarkers() — Fetch stores & farms, render markers
// ═══════════════════════════════════════════════════

function _hashHue(id) {
  var h = 0;
  var sid = String(id || 'x');
  for (var i = 0; i < sid.length; i++) h = sid.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

function _tsrFillColor(tsrId, cache) {
  if (!tsrId) return '#90A4AE';
  if (cache && cache[tsrId]) return cache[tsrId];
  var c = _TSR_MAP_PALETTE[_hashHue(tsrId) % _TSR_MAP_PALETTE.length];
  if (cache) cache[tsrId] = c;
  return c;
}

async function loadMapMarkers() {
  if (!_map) initMap();

  try {
    var session = typeof getSession === 'function' ? getSession() : null;
    var role = session && session.role ? String(session.role).toLowerCase() : '';
    var managerMode = role === 'dsm' || role === 'rsm' || role === 'ceo';

    var tsrColorCache = {};
    var tsrNameById = {};

    if (managerMode) {
      try {
        var teamRows = [];
        if (role === 'dsm' && session.district && typeof getTSRsByDistrict === 'function') {
          teamRows = await getTSRsByDistrict(session.district);
        } else if ((role === 'rsm' || role === 'ceo') && session.region && typeof getTSRsByRegion === 'function') {
          teamRows = await getTSRsByRegion(session.region);
        }
        for (var ti = 0; ti < teamRows.length; ti++) {
          tsrNameById[teamRows[ti].id] = teamRows[ti].name || teamRows[ti].territory || 'TSR';
          _tsrFillColor(teamRows[ti].id, tsrColorCache);
        }
        if (session.id) tsrNameById[session.id] = session.name || 'Ikaw (DSM)';
      } catch (eTeam) {
        console.warn('loadMapMarkers team lookup:', eTeam && eTeam.message);
      }
    }

    var storesFn = typeof getStoresForTerritoryMap === 'function' ? getStoresForTerritoryMap : getStores;
    var farmsFn = typeof getFarmsForTerritoryMap === 'function' ? getFarmsForTerritoryMap : null;

    var stores = await storesFn();
    var farmRows = farmsFn ? await farmsFn() : [];

    // Clear existing markers
    _clearMarkers();

    var okCount = 0, warnCount = 0, critCount = 0;
    var storeCount = 0, farmCount = 0;

    var ctx = {
      managerMode: managerMode,
      tsrColorCache: tsrColorCache,
      tsrNameById: tsrNameById
    };

    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];
      if (!s.lat || !s.lng) continue;

      var stLow = String(s.store_type || '').toLowerCase();
      var isFarm = stLow === 'farm_supply' || stLow === 'veterinary' || stLow === 'farm';
      if (isFarm) farmCount++; else storeCount++;

      var h = s.health_status || 'ok';
      if (h === 'ok') okCount++;
      else if (h === 'warn') warnCount++;
      else if (h === 'crit') critCount++;

      _addStoreMarker(s, isFarm, ctx);
    }

    for (var fi = 0; fi < farmRows.length; fi++) {
      var fr = farmRows[fi];
      if (!fr.lat || !fr.lng) continue;
      farmCount++;

      var fh = fr.health_status || 'ok';
      if (fh === 'ok') okCount++;
      else if (fh === 'warn') warnCount++;
      else if (fh === 'crit') critCount++;

      _addFarmTableMarker(fr, ctx);
    }

    var mi;
    var allEnt = _markers.concat(_farmMarkers);
    for (mi = 0; mi < allEnt.length; mi++) {
      var row = allEnt[mi].store;
      if (!row || !managerMode) continue;
      var pk = row.assigned_tsr || row.created_by;
      if (pk) {
        _tsrFillColor(pk, tsrColorCache);
        if (!tsrNameById[pk]) tsrNameById[pk] = 'TSR';
      }
    }

    // Update header stats
    _updateHeaderStats(okCount, warnCount, critCount);

    // Update subtitle
    var subtitle = document.getElementById('map-subtitle');
    if (subtitle) {
      var total = storeCount + farmCount;
      var base =
        total +
        (total !== 1 ? ' lokasyon' : ' lokasyon') +
        ' — ' +
        storeCount +
        ' POS · ' +
        farmCount +
        ' bukid';
      if (managerMode) {
        base += ' · Kulay = TSR';
      }
      subtitle.textContent = base;
    }

    _updateMapManagerLegend(managerMode, tsrColorCache, tsrNameById);

    // Update stats pill in the top-right of map page
    var statsTotal = document.getElementById('stats-total');
    var statsStores = document.getElementById('stats-stores');
    var statsFarms = document.getElementById('stats-farms');
    if (statsTotal) statsTotal.textContent = storeCount + farmCount;
    if (statsStores) statsStores.textContent = storeCount;
    if (statsFarms) statsFarms.textContent = farmCount;

    _fitMapToMarkers();
  } catch (err) {
    console.error('loadMapMarkers:', err);
  }
}

function _updateMapManagerLegend(managerMode, tsrColorCache, tsrNameById) {
  var host = document.getElementById('map-tsr-legend');
  if (!host) return;

  if (!managerMode) {
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }

  var ids = Object.keys(tsrColorCache || {});
  if (ids.length === 0) {
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }

  ids.sort(function (a, b) {
    var na = (tsrNameById[a] || a).toLowerCase();
    var nb = (tsrNameById[b] || b).toLowerCase();
    return na.localeCompare(nb);
  });

  var html =
    '<div class="map-legend-title" style="margin-top:6px">TSR (kulay ng pin)</div>';
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var col = tsrColorCache[id];
    var nm = _esc(tsrNameById[id] || id.slice(0, 8));
    html +=
      '<div class="map-legend-item map-legend-tsr-row">' +
      '<span class="map-tsr-swatch" style="background:' +
      col +
      '"></span>' +
      '<span>' +
      nm +
      '</span>' +
      '</div>';
  }

  host.innerHTML = html;
  host.style.display = 'block';
}

function _fitMapToMarkers() {
  if (!_map) return;
  var all = _markers.concat(_farmMarkers);
  if (all.length === 0) return;

  var b = new maplibregl.LngLatBounds(all[0].marker.getLngLat(), all[0].marker.getLngLat());
  for (var i = 1; i < all.length; i++) {
    b.extend(all[i].marker.getLngLat());
  }
  try {
    _map.fitBounds(b, { padding: 56, maxZoom: 14, duration: 600 });
  } catch (_e) {}
}


// ═══════════════════════════════════════════════════
// 3. _addStoreMarker() — Create a Mapbox marker + popup
// ═══════════════════════════════════════════════════

function _assignKeyForPin(row) {
  return row.assigned_tsr || row.created_by || null;
}

function _addStoreMarker(store, isFarm, ctx) {
  ctx = ctx || {};
  var health = store.health_status || 'ok';
  var status = store.store_status || 'active';

  var colorMap = { ok: '#31A24C', warn: '#F7B928', crit: '#FA383E' };
  var healthRing = colorMap[health] || colorMap.ok;

  var fill;
  var borderOuter;

  if (ctx.managerMode) {
    var ak = _assignKeyForPin(store);
    fill = _tsrFillColor(ak, ctx.tsrColorCache);
    borderOuter = healthRing;
  } else {
    fill = (status === 'prospect') ? '#A855F7' : healthRing;
    borderOuter = isFarm ? '#004D71' : '#fff';
  }

  var el = document.createElement('div');
  el.className = 'map-marker';
  el.style.cssText =
    'width:32px;height:32px;' +
    'background:' + fill + ';' +
    'border:3px solid ' + borderOuter + ';' +
    'border-radius:50%;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.3);' +
    'display:flex;align-items:center;justify-content:center;' +
    'font-size:14px;cursor:pointer;';

  if (isFarm) {
    var farmType = (store.store_type || '').toLowerCase();
    el.textContent = (farmType === 'veterinary') ? '\uD83D\uDC14' : '\uD83D\uDC16';
  } else {
    el.textContent = '\uD83C\uDFEA';
  }

  if (health === 'crit') {
    el.style.animation = 'pulse-crit 2s ease-in-out infinite';
  }

  var popupHtml = _buildPopupContent(store, isFarm, ctx);

  var popup = new maplibregl.Popup({
    offset: 20,
    maxWidth: '300px',
    closeButton: true
  }).setHTML(popupHtml);

  var marker = new maplibregl.Marker({ element: el })
    .setLngLat([store.lng, store.lat])
    .setPopup(popup)
    .addTo(_map);

  var entry = {
    marker: marker,
    popup: popup,
    store: store,
    el: el,
    visible: true,
    isFarm: isFarm,
    fromFarmsTable: false
  };

  if (isFarm) {
    _farmMarkers.push(entry);
  } else {
    _markers.push(entry);
  }
}

function _addFarmTableMarker(farm, ctx) {
  ctx = ctx || {};
  var health = farm.health_status || 'ok';
  var colorMap = { ok: '#31A24C', warn: '#F7B928', crit: '#FA383E' };
  var healthRing = colorMap[health] || colorMap.ok;

  var fill;
  if (ctx.managerMode) {
    var ak = _assignKeyForPin(farm);
    fill = _tsrFillColor(ak, ctx.tsrColorCache);
  } else {
    fill = '#004D71';
  }

  var el = document.createElement('div');
  el.className = 'map-marker';
  el.style.cssText =
    'width:32px;height:32px;' +
    'background:' + fill + ';' +
    'border:3px solid ' + healthRing + ';' +
    'border-radius:50%;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.3);' +
    'display:flex;align-items:center;justify-content:center;' +
    'font-size:14px;cursor:pointer;';

  var ty = String(farm.type || '').toLowerCase();
  el.textContent =
    ty === 'poultry' || ty === 'layer'
      ? '\uD83D\uDC14'
      : ty === 'aqua'
        ? '\uD83D\uDC1F'
        : '\uD83D\uDC16';

  if (health === 'crit') {
    el.style.animation = 'pulse-crit 2s ease-in-out infinite';
  }

  var pseudo = {
    id: farm.id,
    name: farm.name,
    health_status: farm.health_status,
    store_type: 'farm',
    city: farm.city,
    bags_per_month: farm.bags_per_month,
    last_visit_at: farm.last_visit_at,
    assigned_tsr: farm.assigned_tsr,
    created_by: farm.created_by,
    _farmRow: farm
  };

  var popupHtml = _buildPopupContent(pseudo, true, ctx);

  var popup = new maplibregl.Popup({
    offset: 20,
    maxWidth: '300px',
    closeButton: true
  }).setHTML(popupHtml);

  var marker = new maplibregl.Marker({ element: el })
    .setLngLat([farm.lng, farm.lat])
    .setPopup(popup)
    .addTo(_map);

  _farmMarkers.push({
    marker: marker,
    popup: popup,
    store: pseudo,
    el: el,
    visible: true,
    isFarm: true,
    fromFarmsTable: true
  });
}


// ═══════════════════════════════════════════════════
// 4. _buildPopupContent() — Glass popup HTML
// ═══════════════════════════════════════════════════

function _buildPopupContent(store, isFarm, ctx) {
  ctx = ctx || {};
  var health = store.health_status || 'ok';
  var volClass = (store.vol_class || '-').toUpperCase();
  var storeType = (typeof formatStoreTypeTagalog === 'function') ? formatStoreTypeTagalog(store.store_type) : (store.store_type || '');
  var city = store.city || store.location || '';
  var bags = store.bags_per_month || 0;
  var lastVisit = (typeof formatRelativeTimeTagalog === 'function') ? formatRelativeTimeTagalog(store.last_visit_at) : (store.last_visit_at || (typeof T !== 'undefined' && T.never) || 'Never');
  var escapedName = _esc(store.name || '');
  var escapedId = (store.id || '').replace(/'/g, "\\'");
  var fromFarmsTable = !!(store._farmRow);

  var tsrLine = '';
  if (ctx.managerMode && ctx.tsrNameById) {
    var aid = store.assigned_tsr;
    var repName = aid && ctx.tsrNameById[aid] ? ctx.tsrNameById[aid] : null;
    if (!repName && store.created_by && ctx.tsrNameById[store.created_by]) {
      repName = ctx.tsrNameById[store.created_by];
    }
    if (!repName && aid) repName = 'TSR ' + String(aid).slice(0, 8);
    if (!repName) repName = 'Walang assign';
    tsrLine =
      '<div style="font-size:11px;color:rgba(255,255,255,0.55);margin:0 0 8px 0">TSR: <strong style="color:#fff">' +
      _esc(repName) +
      '</strong></div>';
  }

  var badgeBg, badgeColor, badgeBorder;
  if (volClass === 'A') {
    badgeBg = 'rgba(0,166,206,0.15)'; badgeColor = '#00A6CE'; badgeBorder = 'rgba(0,166,206,0.3)';
  } else if (volClass === 'B') {
    badgeBg = 'rgba(149,201,61,0.15)'; badgeColor = '#95C93D'; badgeBorder = 'rgba(149,201,61,0.3)';
  } else {
    badgeBg = 'rgba(255,255,255,0.08)'; badgeColor = 'rgba(255,255,255,0.5)'; badgeBorder = 'rgba(255,255,255,0.1)';
  }

  var healthColors = { ok: '#31A24C', warn: '#F7B928', crit: '#FA383E' };
  var hColor = healthColors[health] || healthColors.ok;

  var typeLabel = fromFarmsTable ? _esc(String(store._farmRow.type || 'Farm')) : _esc(storeType);

  var actionsHtml;
  if (fromFarmsTable) {
    var heads = store._farmRow.heads != null ? store._farmRow.heads : 0;
    actionsHtml =
      '<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-bottom:10px">' +
      '<strong style="color:#fff">' +
      heads +
      '</strong> heads</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.45)">Farm record — bisita mula sa listahan ng bukid (malapit na).</div>';
  } else {
    actionsHtml =
      '<div style="display:flex;gap:8px">' +
      '<button onclick="openStoreDetail(\'' + escapedId + '\')" style="flex:1;padding:8px 0;border-radius:6px;font-size:11px;font-weight:700;text-align:center;cursor:pointer;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.1)">View Store</button>' +
      '<button onclick="openVisitWizard(\'' + escapedId + '\',\'' + escapedName.replace(/'/g, "\\'") + '\')" style="flex:1;padding:8px 0;border-radius:6px;font-size:11px;font-weight:700;text-align:center;cursor:pointer;background:linear-gradient(135deg,#004D71,#00A6CE);color:#fff;border:none">' +
      (isFarm ? '\uD83D\uDC16 Bisitahin' : '\uD83D\uDCCB Bisitahin') +
      '</button>' +
      '</div>';
  }

  var html = '<div style="padding:16px 18px;font-family:system-ui,-apple-system,sans-serif">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + hColor + ';box-shadow:0 0 6px ' + hColor + ';flex-shrink:0"></span>' +
      '<span style="font-size:14px;font-weight:700;color:#fff;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapedName + '</span>' +
      '<span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:4px;letter-spacing:0.5px;background:' + badgeBg + ';color:' + badgeColor + ';border:1px solid ' + badgeBorder + '">' + volClass + '</span>' +
    '</div>' +
    tsrLine +
    '<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-bottom:12px">' + typeLabel + (city ? ' &middot; ' + _esc(city) : '') + '</div>' +
    '<div style="height:1px;background:rgba(255,255,255,0.06);margin:10px 0"></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.7)">' +
      '<div><strong style="color:#fff">' + bags + '</strong> bags/mo</div>' +
      '<div>Last: <strong style="color:#fff">' + lastVisit + '</strong></div>' +
    '</div>' +
    '<div style="height:1px;background:rgba(255,255,255,0.06);margin:10px 0"></div>' +
    actionsHtml +
  '</div>';

  return html;
}


// ═══════════════════════════════════════════════════
// 5. initMapFilters() — Wire the filter chips
// ═══════════════════════════════════════════════════

function initMapFilters() {
  if (_mapFiltersWired) return;
  var bar = document.querySelector('#page-map .map-filter-bar');
  if (!bar) return;

  _mapFiltersWired = true;

  var chips = bar.querySelectorAll('.map-filter-chip');
  for (var i = 0; i < chips.length; i++) {
    (function(chip) {
      chip.addEventListener('click', function() {
        // Update active state
        for (var j = 0; j < chips.length; j++) chips[j].classList.remove('active');
        chip.classList.add('active');

        var filter = chip.getAttribute('data-filter');
        _activeMapFilter = filter;
        _applyFilter(filter);
      });
    })(chips[i]);
  }
}


// ═══════════════════════════════════════════════════
// 6. _applyFilter() — Show/hide markers by type
// ═══════════════════════════════════════════════════

function _applyFilter(filter) {
  // Store markers
  for (var i = 0; i < _markers.length; i++) {
    var entry = _markers[i];
    var show = (filter === 'all' || filter === 'store');
    if (show && !entry.visible) {
      entry.marker.addTo(_map);
      entry.visible = true;
    } else if (!show && entry.visible) {
      entry.marker.remove();
      entry.visible = false;
    }
  }

  // Farm markers
  for (var j = 0; j < _farmMarkers.length; j++) {
    var fEntry = _farmMarkers[j];
    var fShow = (filter === 'all' || filter === 'farm');
    if (fShow && !fEntry.visible) {
      fEntry.marker.addTo(_map);
      fEntry.visible = true;
    } else if (!fShow && fEntry.visible) {
      fEntry.marker.remove();
      fEntry.visible = false;
    }
  }
}


// ═══════════════════════════════════════════════════
// 7. updateMapMarkers(filter) — Called by existing code
// ═══════════════════════════════════════════════════

function updateMapMarkers(filter) {
  if (!filter || (!filter.type && !filter.health_status)) {
    _applyFilter('all');
    return;
  }
  if (filter.type) _applyFilter(filter.type);
  if (filter.health_status) {
    // Show only markers with matching health
    var h = filter.health_status;
    var all = _markers.concat(_farmMarkers);
    for (var i = 0; i < all.length; i++) {
      var entry = all[i];
      var storeHealth = entry.store.health_status || 'ok';
      if (storeHealth === h) {
        if (!entry.visible) { entry.marker.addTo(_map); entry.visible = true; }
      } else {
        if (entry.visible) { entry.marker.remove(); entry.visible = false; }
      }
    }
  }
}


// ═══════════════════════════════════════════════════
// 8. flyToStore(lat, lng) — Smooth fly animation
// ═══════════════════════════════════════════════════

function flyToStore(lat, lng) {
  if (!_map) return;
  _map.flyTo({
    center: [lng, lat],
    zoom: 16,
    duration: 1200,
    essential: true
  });
}


// ═══════════════════════════════════════════════════
// 9. addUserLocationMarker() — Trigger geolocate
// ═══════════════════════════════════════════════════

function addUserLocationMarker() {
  if (_geolocateCtrl) {
    _geolocateCtrl.trigger();
  }
}


// ═══════════════════════════════════════════════════
// 10. getMapStats() — Counts for legend
// ═══════════════════════════════════════════════════

function getMapStats() {
  var stats = { total: 0, ok: 0, warn: 0, crit: 0, stores: 0, farms: 0 };
  var all = _markers.concat(_farmMarkers);
  for (var i = 0; i < all.length; i++) {
    var s = all[i].store;
    stats.total++;
    var h = s.health_status || 'ok';
    if (h === 'ok') stats.ok++;
    else if (h === 'warn') stats.warn++;
    else if (h === 'crit') stats.crit++;
    if (all[i].isFarm) stats.farms++; else stats.stores++;
  }
  return stats;
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Update header health counts
// ═══════════════════════════════════════════════════

function _updateHeaderStats(ok, warn, crit) {
  var okEl = document.getElementById('map-count-ok');
  var warnEl = document.getElementById('map-count-warn');
  var critEl = document.getElementById('map-count-crit');
  if (okEl) okEl.textContent = ok;
  if (warnEl) warnEl.textContent = warn;
  if (critEl) critEl.textContent = crit;

  // Also update legend if it exists
  var legendOk = document.getElementById('legend-ok');
  var legendWarn = document.getElementById('legend-warn');
  var legendCrit = document.getElementById('legend-crit');
  if (legendOk) legendOk.textContent = ok;
  if (legendWarn) legendWarn.textContent = warn;
  if (legendCrit) legendCrit.textContent = crit;
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Clear all markers
// ═══════════════════════════════════════════════════

function _clearMarkers() {
  for (var i = 0; i < _markers.length; i++) _markers[i].marker.remove();
  for (var j = 0; j < _farmMarkers.length; j++) _farmMarkers[j].marker.remove();
  _markers = [];
  _farmMarkers = [];
}


// ═══════════════════════════════════════════════════
//  PRIVATE — HTML-escape
// ═══════════════════════════════════════════════════

// Delegates to canonical PatrolEscape.escapeHtml (js/_util/escape.js).
// NOTE: original returned '' for `0` (falsy) — known P2 bug in audit; the
// canonical helper correctly preserves "0".
function _esc(str) {
  return (typeof PatrolEscape !== 'undefined') ? PatrolEscape.escapeHtml(str) : (str == null ? '' : String(str));
}

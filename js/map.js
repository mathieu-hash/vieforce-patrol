// Map Module — Mapbox GL JS (streets-v12, Google Maps quality)

// ── State ──
var _map = null;
var _markers = [];       // { marker, popup, store, el, visible }
var _farmMarkers = [];   // { marker, popup, farm, el, visible }
var _activeMapFilter = 'all';
var _geolocateCtrl = null;

// ═══════════════════════════════════════════════════
// 1. initMap() — Initialize Mapbox GL on #map-container
// ═══════════════════════════════════════════════════

function initMap() {
  var container = document.getElementById('map-container');
  if (!container || _map) return _map;

  // OpenFreeMap — no token needed, free forever
  mapboxgl.accessToken = '';

  _map = new mapboxgl.Map({
    container: 'map-container',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [121.0900, 14.6900],
    zoom: 12,
    attributionControl: false,
    maxBounds: [[116.0, 4.5], [127.0, 21.5]]
  });

  // Navigation controls (zoom +/-)
  _map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  // Geolocate — "locate me" with blue pulsing dot
  _geolocateCtrl = new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
  });
  _map.addControl(_geolocateCtrl, 'top-right');

  // Small attribution
  _map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

  // Auto-center on user location on load
  _map.on('load', function() {
    _geolocateCtrl.trigger();
  });

  return _map;
}


// ═══════════════════════════════════════════════════
// 2. loadMapMarkers() — Fetch stores & farms, render markers
// ═══════════════════════════════════════════════════

async function loadMapMarkers() {
  if (!_map) initMap();

  try {
    var stores = await getStores();

    // Clear existing markers
    _clearMarkers();

    var okCount = 0, warnCount = 0, critCount = 0;
    var storeCount = 0, farmCount = 0;

    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];
      if (!s.lat || !s.lng) continue;

      var isFarm = (s.store_type === 'farm_supply' || s.store_type === 'veterinary');
      if (isFarm) farmCount++; else storeCount++;

      var h = s.health_status || 'ok';
      if (h === 'ok') okCount++;
      else if (h === 'warn') warnCount++;
      else if (h === 'crit') critCount++;

      _addStoreMarker(s, isFarm);
    }

    // Update header stats
    _updateHeaderStats(okCount, warnCount, critCount);

    // Update subtitle
    var subtitle = document.getElementById('map-subtitle');
    if (subtitle) {
      var total = storeCount + farmCount;
      subtitle.textContent = total + ' location' + (total !== 1 ? 's' : '') + ' — ' + storeCount + ' stores, ' + farmCount + ' farms';
    }

    // Update stats pill in the top-right of map page
    var statsTotal = document.getElementById('stats-total');
    var statsStores = document.getElementById('stats-stores');
    var statsFarms = document.getElementById('stats-farms');
    if (statsTotal) statsTotal.textContent = storeCount + farmCount;
    if (statsStores) statsStores.textContent = storeCount;
    if (statsFarms) statsFarms.textContent = farmCount;

  } catch (err) {
    console.error('loadMapMarkers:', err);
  }
}


// ═══════════════════════════════════════════════════
// 3. _addStoreMarker() — Create a Mapbox marker + popup
// ═══════════════════════════════════════════════════

function _addStoreMarker(store, isFarm) {
  var health = store.health_status || 'ok';

  // Colors by health
  var colorMap = { ok: '#31A24C', warn: '#F7B928', crit: '#FA383E' };
  var color = colorMap[health] || colorMap.ok;

  // Marker element
  var el = document.createElement('div');
  el.className = 'map-marker';
  el.style.cssText =
    'width:32px;height:32px;' +
    'background:' + color + ';' +
    'border:3px solid ' + (isFarm ? '#004D71' : '#fff') + ';' +
    'border-radius:50%;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.3);' +
    'display:flex;align-items:center;justify-content:center;' +
    'font-size:14px;cursor:pointer;';

  // Icon: farm or store
  if (isFarm) {
    var farmType = (store.store_type || '').toLowerCase();
    el.textContent = (farmType === 'veterinary') ? '\uD83D\uDC14' : '\uD83D\uDC16';
  } else {
    el.textContent = '\uD83C\uDFEA';
  }

  // Critical markers pulse
  if (health === 'crit') {
    el.style.animation = 'pulse-crit 2s ease-in-out infinite';
  }

  // Popup content
  var popupHtml = _buildPopupContent(store, isFarm);

  var popup = new mapboxgl.Popup({
    offset: 20,
    maxWidth: '300px',
    closeButton: true
  }).setHTML(popupHtml);

  var marker = new mapboxgl.Marker({ element: el })
    .setLngLat([store.lng, store.lat])
    .setPopup(popup)
    .addTo(_map);

  var entry = { marker: marker, popup: popup, store: store, el: el, visible: true, isFarm: isFarm };

  if (isFarm) {
    _farmMarkers.push(entry);
  } else {
    _markers.push(entry);
  }
}


// ═══════════════════════════════════════════════════
// 4. _buildPopupContent() — Glass popup HTML
// ═══════════════════════════════════════════════════

function _buildPopupContent(store, isFarm) {
  var health = store.health_status || 'ok';
  var volClass = (store.vol_class || '-').toUpperCase();
  var storeType = (typeof formatStoreTypeTagalog === 'function') ? formatStoreTypeTagalog(store.store_type) : (store.store_type || '');
  var city = store.city || store.location || '';
  var bags = store.bags_per_month || 0;
  var lastVisit = (typeof formatRelativeTimeTagalog === 'function') ? formatRelativeTimeTagalog(store.last_visit_at) : (store.last_visit_at || T.never || 'Never');
  var escapedName = _esc(store.name || '');
  var escapedId = (store.id || '').replace(/'/g, "\\'");

  // Vol class badge color
  var badgeBg, badgeColor, badgeBorder;
  if (volClass === 'A') {
    badgeBg = 'rgba(0,166,206,0.15)'; badgeColor = '#00A6CE'; badgeBorder = 'rgba(0,166,206,0.3)';
  } else if (volClass === 'B') {
    badgeBg = 'rgba(149,201,61,0.15)'; badgeColor = '#95C93D'; badgeBorder = 'rgba(149,201,61,0.3)';
  } else {
    badgeBg = 'rgba(255,255,255,0.08)'; badgeColor = 'rgba(255,255,255,0.5)'; badgeBorder = 'rgba(255,255,255,0.1)';
  }

  // Health dot color
  var healthColors = { ok: '#31A24C', warn: '#F7B928', crit: '#FA383E' };
  var hColor = healthColors[health] || healthColors.ok;

  var html = '<div style="padding:16px 18px;font-family:system-ui,-apple-system,sans-serif">' +
    // Header
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + hColor + ';box-shadow:0 0 6px ' + hColor + ';flex-shrink:0"></span>' +
      '<span style="font-size:14px;font-weight:700;color:#fff;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapedName + '</span>' +
      '<span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:4px;letter-spacing:0.5px;background:' + badgeBg + ';color:' + badgeColor + ';border:1px solid ' + badgeBorder + '">' + volClass + '</span>' +
    '</div>' +
    // Subtitle
    '<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-bottom:12px">' + _esc(storeType) + (city ? ' &middot; ' + _esc(city) : '') + '</div>' +
    // Divider
    '<div style="height:1px;background:rgba(255,255,255,0.06);margin:10px 0"></div>' +
    // Stats
    '<div style="display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,0.7)">' +
      '<div><strong style="color:#fff">' + bags + '</strong> bags/mo</div>' +
      '<div>Last: <strong style="color:#fff">' + lastVisit + '</strong></div>' +
    '</div>' +
    // Divider
    '<div style="height:1px;background:rgba(255,255,255,0.06);margin:10px 0"></div>' +
    // Action buttons
    '<div style="display:flex;gap:8px">' +
      '<button onclick="openStoreDetail(\'' + escapedId + '\')" style="flex:1;padding:8px 0;border-radius:6px;font-size:11px;font-weight:700;text-align:center;cursor:pointer;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.1)">View Store</button>' +
      '<button onclick="openVisitWizard(\'' + escapedId + '\',\'' + escapedName.replace(/'/g, "\\'") + '\')" style="flex:1;padding:8px 0;border-radius:6px;font-size:11px;font-weight:700;text-align:center;cursor:pointer;background:linear-gradient(135deg,#004D71,#00A6CE);color:#fff;border:none">' + (isFarm ? '\uD83D\uDC16 Bisitahin' : '\uD83D\uDCCB Bisitahin') + '</button>' +
    '</div>' +
  '</div>';

  return html;
}


// ═══════════════════════════════════════════════════
// 5. initMapFilters() — Wire the filter chips
// ═══════════════════════════════════════════════════

function initMapFilters() {
  var bar = document.querySelector('#page-map .map-filter-bar');
  if (!bar) return;

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

function _esc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

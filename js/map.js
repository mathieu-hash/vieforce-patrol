// Map Module — Elite Leaflet dark map with live store markers

// ── State ──
var _map = null;
var _markersLayer = null;
var _userMarker = null;
var _allMarkerData = []; // { marker, store, visible }
var _activeMapFilter = 'all';

// ── Inject Map Styles ──
(function injectMapStyles() {
  var style = document.createElement('style');
  style.textContent = '' +
    /* ── Pulse animation for critical markers ── */
    '@keyframes map-pulse{' +
      '0%{transform:scale(1);opacity:1}' +
      '50%{transform:scale(1.8);opacity:0.4}' +
      '100%{transform:scale(2.4);opacity:0}' +
    '}' +
    '@keyframes map-pulse-dot{' +
      '0%{box-shadow:0 0 4px 2px rgba(239,83,80,0.6)}' +
      '50%{box-shadow:0 0 10px 5px rgba(239,83,80,0.3)}' +
      '100%{box-shadow:0 0 4px 2px rgba(239,83,80,0.6)}' +
    '}' +
    '@keyframes user-pulse{' +
      '0%{transform:scale(1);opacity:0.6}' +
      '50%{transform:scale(2.2);opacity:0}' +
      '100%{transform:scale(1);opacity:0}' +
    '}' +

    /* ── Marker base ── */
    '.map-marker{position:relative;display:flex;align-items:center;justify-content:center}' +
    '.map-marker svg{filter:drop-shadow(0 0 3px currentColor);transition:transform .2s ease}' +
    '.map-marker:hover svg{transform:scale(1.3)}' +

    /* ── OK marker — green glow ── */
    '.map-marker-ok svg{color:#66bb6a;filter:drop-shadow(0 0 4px rgba(102,187,106,0.5))}' +

    /* ── Warn marker — amber glow ── */
    '.map-marker-warn svg{color:#ffa726;filter:drop-shadow(0 0 4px rgba(255,167,38,0.5))}' +

    /* ── Crit marker — red glow + pulse ring ── */
    '.map-marker-crit svg{color:#ef5350;filter:drop-shadow(0 0 6px rgba(239,83,80,0.7))}' +
    '.map-marker-crit .pulse-ring{' +
      'position:absolute;width:100%;height:100%;border-radius:50%;' +
      'border:2px solid rgba(239,83,80,0.6);' +
      'animation:map-pulse 1.8s ease-out infinite;pointer-events:none' +
    '}' +
    '.map-marker-crit svg{animation:map-pulse-dot 1.8s ease-in-out infinite}' +

    /* ── User location marker ── */
    '.map-user-marker{position:relative;width:16px;height:16px}' +
    '.map-user-dot{width:12px;height:12px;background:#42a5f5;border:2px solid #fff;border-radius:50%;position:absolute;top:2px;left:2px;z-index:2;box-shadow:0 0 6px rgba(66,165,245,0.6)}' +
    '.map-user-ring{position:absolute;top:0;left:0;width:16px;height:16px;border-radius:50%;background:rgba(66,165,245,0.25);animation:user-pulse 2s ease-out infinite}' +

    /* ── Glassmorphism popup ── */
    '.leaflet-popup-content-wrapper{' +
      'background:rgba(10,10,15,0.92)!important;' +
      'backdrop-filter:blur(16px)!important;' +
      '-webkit-backdrop-filter:blur(16px)!important;' +
      'border:1px solid rgba(255,255,255,0.08)!important;' +
      'border-radius:12px!important;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.04)!important;' +
      'padding:0!important;color:#fff!important' +
    '}' +
    '.leaflet-popup-content{margin:0!important;min-width:260px!important}' +
    '.leaflet-popup-tip{background:rgba(10,10,15,0.92)!important;border:1px solid rgba(255,255,255,0.08)!important;border-top:none!important;border-left:none!important}' +
    '.leaflet-popup-close-button{color:rgba(255,255,255,0.4)!important;font-size:18px!important;top:8px!important;right:10px!important}' +
    '.leaflet-popup-close-button:hover{color:#fff!important}' +

    /* ── Popup inner layout ── */
    '.map-popup{padding:16px 18px}' +
    '.map-popup-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}' +
    '.map-popup-name{font-size:14px;font-weight:700;color:#fff;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.map-popup-badge{font-size:10px;font-weight:800;padding:2px 7px;border-radius:4px;letter-spacing:0.5px}' +
    '.map-popup-badge-a{background:rgba(0,166,206,0.15);color:#00A6CE;border:1px solid rgba(0,166,206,0.3)}' +
    '.map-popup-badge-b{background:rgba(149,201,61,0.15);color:#95C93D;border:1px solid rgba(149,201,61,0.3)}' +
    '.map-popup-badge-c{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.1)}' +
    '.map-popup-sub{font-size:11px;color:rgba(255,255,255,0.45);margin-bottom:12px}' +
    '.map-popup-divider{height:1px;background:rgba(255,255,255,0.06);margin:10px 0}' +
    '.map-popup-stats{display:flex;justify-content:space-between;align-items:center;gap:12px}' +
    '.map-popup-stat{font-size:12px;color:rgba(255,255,255,0.7)}' +
    '.map-popup-stat strong{color:#fff;font-weight:700}' +

    /* ── Vienovo share bar ── */
    '.map-popup-share{margin-top:4px}' +
    '.map-popup-share-label{font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:4px;display:flex;justify-content:space-between}' +
    '.map-popup-share-bar{height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden}' +
    '.map-popup-share-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#00A6CE,#95C93D);transition:width .6s ease}' +

    /* ── Popup action buttons ── */
    '.map-popup-actions{display:flex;gap:8px;margin-top:14px}' +
    '.map-popup-btn{flex:1;padding:8px 0;border-radius:6px;font-size:11px;font-weight:700;text-align:center;cursor:pointer;transition:all .2s ease;border:none;letter-spacing:0.3px}' +
    '.map-popup-btn-ghost{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.1)}' +
    '.map-popup-btn-ghost:hover{background:rgba(255,255,255,0.1);color:#fff}' +
    '.map-popup-btn-primary{background:linear-gradient(135deg,#004D71,#00A6CE);color:#fff}' +
    '.map-popup-btn-primary:hover{filter:brightness(1.15)}' +

    /* ── Health dot in popup ── */
    '.map-popup-health{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:6px;flex-shrink:0}' +
    '.map-popup-health-ok{background:#66bb6a;box-shadow:0 0 4px rgba(102,187,106,0.5)}' +
    '.map-popup-health-warn{background:#ffa726;box-shadow:0 0 4px rgba(255,167,38,0.5)}' +
    '.map-popup-health-crit{background:#ef5350;box-shadow:0 0 4px rgba(239,83,80,0.5)}' +

    /* ── Map legend — glass card bottom-left ── */
    '.map-legend{' +
      'position:absolute;bottom:24px;left:12px;z-index:800;' +
      'background:rgba(10,10,15,0.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(255,255,255,0.08);border-radius:10px;' +
      'padding:12px 14px;min-width:140px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.4)' +
    '}' +
    '.map-legend-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.35);margin-bottom:8px}' +
    '.map-legend-item{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px;color:rgba(255,255,255,0.7)}' +
    '.map-legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}' +
    '.map-legend-dot-ok{background:#66bb6a;box-shadow:0 0 4px rgba(102,187,106,0.4)}' +
    '.map-legend-dot-warn{background:#ffa726;box-shadow:0 0 4px rgba(255,167,38,0.4)}' +
    '.map-legend-dot-crit{background:#ef5350;box-shadow:0 0 4px rgba(239,83,80,0.4)}' +
    '.map-legend-count{margin-left:auto;font-weight:700;color:#fff}' +

    /* ── Map stats overlay — top-right ── */
    '.map-stats{' +
      'position:absolute;top:12px;right:12px;z-index:800;' +
      'background:rgba(10,10,15,0.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(255,255,255,0.08);border-radius:10px;' +
      'padding:10px 14px;display:flex;gap:16px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.4)' +
    '}' +
    '.map-stats-item{text-align:center}' +
    '.map-stats-value{font-size:18px;font-weight:800;color:#fff;line-height:1}' +
    '.map-stats-label{font-size:9px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}' +

    /* ── Filter chips on map ── */
    '.map-filters{' +
      'position:absolute;top:12px;left:12px;z-index:800;' +
      'display:flex;gap:6px;flex-wrap:wrap' +
    '}' +
    '.map-filter-chip{' +
      'padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;' +
      'background:rgba(10,10,15,0.8);backdrop-filter:blur(8px);' +
      'border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);' +
      'cursor:pointer;transition:all .2s ease;user-select:none' +
    '}' +
    '.map-filter-chip:hover{background:rgba(255,255,255,0.1);color:#fff}' +
    '.map-filter-chip.active{background:rgba(0,77,113,0.6);border-color:rgba(0,166,206,0.4);color:#00A6CE}' +

    /* ── Zoom controls override ── */
    '.map-zoom-controls{' +
      'position:absolute;bottom:24px;right:12px;z-index:800;' +
      'display:flex;flex-direction:column;gap:2px' +
    '}' +
    '.map-zoom-btn{' +
      'width:36px;height:36px;' +
      'background:rgba(10,10,15,0.88);backdrop-filter:blur(12px);' +
      'border:1px solid rgba(255,255,255,0.1);color:#fff;' +
      'font-size:18px;font-weight:300;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;' +
      'transition:all .2s ease' +
    '}' +
    '.map-zoom-btn:first-child{border-radius:8px 8px 0 0}' +
    '.map-zoom-btn:last-child{border-radius:0 0 8px 8px}' +
    '.map-zoom-btn:hover{background:rgba(255,255,255,0.12)}' +
    '.map-zoom-btn:active{background:rgba(0,166,206,0.3)}' +

    /* ── Marker entry animation ── */
    '@keyframes marker-enter{0%{transform:scale(0);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}' +
    '.map-marker-enter{animation:marker-enter .4s cubic-bezier(.34,1.56,.64,1) forwards}' +
    '.map-marker-exit{transition:opacity .3s ease,transform .3s ease;opacity:0!important;transform:scale(0)!important;pointer-events:none}' +
  '';
  document.head.appendChild(style);
})();


// ═══════════════════════════════════════════════════
// 1. initMap() — Initialize Leaflet on #map-container
// ═══════════════════════════════════════════════════

function initMap() {
  var container = document.getElementById('map-container');
  if (!container || _map) return _map;

  // Create the Leaflet map
  _map = L.map('map-container', {
    center: [14.5995, 120.9842],
    zoom: 11,
    zoomControl: false,
    attributionControl: false,
    maxBounds: [
      [4.5, 116.0],   // SW corner — Philippines approximate
      [21.5, 127.0]   // NE corner
    ],
    maxBoundsViscosity: 0.8
  });

  // Dark Matter tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(_map);

  // Subtle attribution
  L.control.attribution({
    position: 'bottomright',
    prefix: false
  }).addTo(_map);

  // Markers layer group
  _markersLayer = L.layerGroup().addTo(_map);

  // Build custom UI overlays
  _buildZoomControls(container);
  _buildLegend(container);
  _buildStatsOverlay(container);
  _buildFilterChips(container);

  // Fix Leaflet sizing after tab switch
  setTimeout(function () {
    if (_map) _map.invalidateSize();
  }, 200);

  return _map;
}


// ═══════════════════════════════════════════════════
// 2. loadMapMarkers() — Fetch stores & render markers
// ═══════════════════════════════════════════════════

async function loadMapMarkers() {
  if (!_map) initMap();

  try {
    var stores = await getStores();
    _markersLayer.clearLayers();
    _allMarkerData = [];

    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];
      if (!s.lat || !s.lng) continue;

      var marker = _createStoreMarker(s);
      _markersLayer.addLayer(marker);
      _allMarkerData.push({ marker: marker, store: s, visible: true });
    }

    _updateLegendCounts(stores);
    _updateStatsOverlay(stores);

  } catch (err) {
    console.error('loadMapMarkers:', err);
  }
}


// ═══════════════════════════════════════════════════
// 3. updateMapMarkers(filter) — Re-filter markers
// ═══════════════════════════════════════════════════

function updateMapMarkers(filter) {
  if (!_markersLayer) return;
  var type = (filter && filter.type) || null;           // 'feeds_dealer','farm' etc.
  var health = (filter && filter.health_status) || null; // 'ok','warn','crit'

  for (var i = 0; i < _allMarkerData.length; i++) {
    var entry = _allMarkerData[i];
    var s = entry.store;
    var show = true;

    if (health && s.health_status !== health) show = false;
    if (type === 'store' && (s.store_type === 'farm_supply' || s.store_type === 'veterinary')) show = false;
    if (type === 'farm' && s.store_type !== 'farm_supply') show = false;

    var el = entry.marker.getElement ? entry.marker.getElement() : null;

    if (show && !entry.visible) {
      if (!_markersLayer.hasLayer(entry.marker)) _markersLayer.addLayer(entry.marker);
      if (el) { el.classList.remove('map-marker-exit'); el.classList.add('map-marker-enter'); }
      entry.visible = true;
    } else if (!show && entry.visible) {
      if (el) {
        el.classList.remove('map-marker-enter');
        el.classList.add('map-marker-exit');
      }
      // Remove after animation
      (function (m) {
        setTimeout(function () { _markersLayer.removeLayer(m); }, 300);
      })(entry.marker);
      entry.visible = false;
    }
  }
}


// ═══════════════════════════════════════════════════
// 4. initMapFilters() — Wire filter chips
// ═══════════════════════════════════════════════════

function initMapFilters() {
  // Filter chips are built dynamically in _buildFilterChips
  // This function re-wires them if the map page is re-rendered
  var container = document.getElementById('map-container');
  if (!container) return;

  var existing = container.parentElement.querySelector('.map-filters');
  if (existing) {
    var chips = existing.querySelectorAll('.map-filter-chip');
    for (var i = 0; i < chips.length; i++) {
      _wireFilterChip(chips[i], chips);
    }
  }
}


// ═══════════════════════════════════════════════════
// 5. flyToStore(lat, lng) — Smooth fly animation
// ═══════════════════════════════════════════════════

function flyToStore(lat, lng) {
  if (!_map) return;
  _map.flyTo([lat, lng], 16, {
    duration: 1.2,
    easeLinearity: 0.25
  });
}


// ═══════════════════════════════════════════════════
// 6. addUserLocationMarker() — GPS blue dot
// ═══════════════════════════════════════════════════

function addUserLocationMarker() {
  if (!_map) return;
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;

      if (_userMarker) {
        _userMarker.setLatLng([lat, lng]);
      } else {
        var icon = L.divIcon({
          className: '',
          html: '<div class="map-user-marker">' +
                  '<div class="map-user-ring"></div>' +
                  '<div class="map-user-dot"></div>' +
                '</div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        _userMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 }).addTo(_map);
      }
    },
    function (err) {
      console.warn('User location unavailable:', err.message);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}


// ═══════════════════════════════════════════════════
// 7. getMapStats() — Counts for legend
// ═══════════════════════════════════════════════════

function getMapStats() {
  var stats = { total: 0, ok: 0, warn: 0, crit: 0, stores: 0, farms: 0 };

  for (var i = 0; i < _allMarkerData.length; i++) {
    var s = _allMarkerData[i].store;
    stats.total++;

    var h = s.health_status || 'ok';
    if (h === 'ok') stats.ok++;
    else if (h === 'warn') stats.warn++;
    else if (h === 'crit') stats.crit++;

    if (s.store_type === 'farm_supply') stats.farms++;
    else stats.stores++;
  }

  return stats;
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Create a single store marker
// ═══════════════════════════════════════════════════

function _createStoreMarker(store) {
  var health = store.health_status || 'ok';
  var volClass = (store.vol_class || 'C').toUpperCase();

  // Size based on vol_class
  var size = volClass === 'A' ? 16 : volClass === 'B' ? 12 : 8;
  var halfSize = size / 2;

  // Color by health
  var colorMap = { ok: '#66bb6a', warn: '#ffa726', crit: '#ef5350' };
  var glowMap = {
    ok:   'rgba(102,187,106,0.4)',
    warn: 'rgba(255,167,38,0.4)',
    crit: 'rgba(239,83,80,0.5)'
  };
  var color = colorMap[health] || colorMap.ok;
  var glow = glowMap[health] || glowMap.ok;

  // SVG circle with glow filter
  var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><filter id="glow-' + health + '" x="-50%" y="-50%" width="200%" height="200%">' +
      '<feGaussianBlur stdDeviation="2" result="blur"/>' +
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
    '</filter></defs>' +
    '<circle cx="' + halfSize + '" cy="' + halfSize + '" r="' + (halfSize - 1) + '" ' +
      'fill="' + color + '" filter="url(#glow-' + health + ')" opacity="0.9"/>' +
  '</svg>';

  // Pulse ring for critical
  var pulseHtml = health === 'crit'
    ? '<div class="pulse-ring" style="width:' + (size + 8) + 'px;height:' + (size + 8) + 'px;top:-4px;left:-4px"></div>'
    : '';

  var html = '<div class="map-marker map-marker-' + health + ' map-marker-enter" style="width:' + size + 'px;height:' + size + 'px">' +
    pulseHtml + svg +
  '</div>';

  var icon = L.divIcon({
    className: '',
    html: html,
    iconSize: [size, size],
    iconAnchor: [halfSize, halfSize],
    popupAnchor: [0, -(halfSize + 4)]
  });

  var marker = L.marker([store.lat, store.lng], {
    icon: icon,
    riseOnHover: true
  });

  // Bind popup
  marker.bindPopup(function () { return _buildPopupContent(store); }, {
    maxWidth: 300,
    minWidth: 260,
    closeButton: true,
    autoPan: true,
    autoPanPadding: [40, 40]
  });

  // Fly to on click
  marker.on('click', function () {
    if (_map) {
      _map.flyTo([store.lat, store.lng], Math.max(_map.getZoom(), 14), {
        duration: 0.8
      });
    }
  });

  return marker;
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Build popup HTML
// ═══════════════════════════════════════════════════

function _buildPopupContent(store) {
  var health = store.health_status || 'ok';
  var volClass = (store.vol_class || '-').toUpperCase();
  var storeType = formatStoreType(store.store_type);
  var city = store.city || '';
  var bags = store.bags_per_month || 0;
  var lastVisit = formatRelativeTime(store.last_visit_at);
  var escapedName = _esc(store.name);
  var escapedId = store.id.replace(/'/g, "\\'");

  // Vol class badge
  var badgeClass = 'map-popup-badge ';
  if (volClass === 'A') badgeClass += 'map-popup-badge-a';
  else if (volClass === 'B') badgeClass += 'map-popup-badge-b';
  else badgeClass += 'map-popup-badge-c';

  // Calculate Vienovo share asynchronously? No — use store data we have.
  // We fetch products in background and update popup via DOM.
  var shareId = 'share-' + store.id.replace(/-/g, '');

  var html = '<div class="map-popup">' +
    // Header: health dot + name + badge
    '<div class="map-popup-header">' +
      '<span class="map-popup-health map-popup-health-' + health + '"></span>' +
      '<span class="map-popup-name">' + escapedName + '</span>' +
      '<span class="' + badgeClass + '">' + volClass + '</span>' +
    '</div>' +
    // Subtitle
    '<div class="map-popup-sub">' + _esc(storeType) + (city ? ' &middot; ' + _esc(city) : '') + '</div>' +
    // Divider
    '<div class="map-popup-divider"></div>' +
    // Stats row
    '<div class="map-popup-stats">' +
      '<div class="map-popup-stat"><strong>' + bags + '</strong> bags/mo</div>' +
      '<div class="map-popup-stat">Last: <strong>' + lastVisit + '</strong></div>' +
    '</div>' +
    // Vienovo share bar
    '<div class="map-popup-share" id="' + shareId + '">' +
      '<div class="map-popup-share-label"><span>Vienovo Share</span><span id="' + shareId + '-pct">--</span></div>' +
      '<div class="map-popup-share-bar"><div class="map-popup-share-fill" id="' + shareId + '-fill" style="width:0%"></div></div>' +
    '</div>' +
    // Divider
    '<div class="map-popup-divider"></div>' +
    // Action buttons
    '<div class="map-popup-actions">' +
      '<button class="map-popup-btn map-popup-btn-ghost" onclick="openStoreDetail(\'' + escapedId + '\')">View Store</button>' +
      '<button class="map-popup-btn map-popup-btn-primary" onclick="openVisitWizard(\'' + escapedId + '\',\'' + escapedName.replace(/'/g, "\\'") + '\')">Start Visit</button>' +
    '</div>' +
  '</div>';

  // Fetch products in background to fill the share bar
  _loadVienovoShare(store.id, shareId);

  return html;
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Load Vienovo share % into popup
// ═══════════════════════════════════════════════════

function _loadVienovoShare(storeId, shareId) {
  // Fetch store products via Supabase
  supabaseClient
    .from('store_products')
    .select('bags_per_month, is_vienovo')
    .eq('store_id', storeId)
    .then(function (result) {
      var products = (result.data || []);
      if (products.length === 0) return;

      var total = 0;
      var vienovo = 0;
      for (var i = 0; i < products.length; i++) {
        var b = products[i].bags_per_month || 0;
        total += b;
        if (products[i].is_vienovo) vienovo += b;
      }

      var pct = total > 0 ? Math.round((vienovo / total) * 100) : 0;

      var pctEl = document.getElementById(shareId + '-pct');
      var fillEl = document.getElementById(shareId + '-fill');
      if (pctEl) pctEl.textContent = pct + '%';
      if (fillEl) fillEl.style.width = pct + '%';
    })
    .catch(function () {
      // Silently fail — share bar stays at "--"
    });
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Build custom zoom controls
// ═══════════════════════════════════════════════════

function _buildZoomControls(container) {
  var wrapper = container.parentElement || container;
  var ctrl = document.createElement('div');
  ctrl.className = 'map-zoom-controls';
  ctrl.innerHTML = '<button class="map-zoom-btn" id="map-zoom-in">+</button>' +
                   '<button class="map-zoom-btn" id="map-zoom-out">&minus;</button>';
  wrapper.appendChild(ctrl);

  ctrl.querySelector('#map-zoom-in').addEventListener('click', function (e) {
    e.stopPropagation();
    if (_map) _map.zoomIn();
  });
  ctrl.querySelector('#map-zoom-out').addEventListener('click', function (e) {
    e.stopPropagation();
    if (_map) _map.zoomOut();
  });
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Build legend card
// ═══════════════════════════════════════════════════

function _buildLegend(container) {
  var wrapper = container.parentElement || container;
  var legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.id = 'map-legend';
  legend.innerHTML =
    '<div class="map-legend-title">Health Status</div>' +
    '<div class="map-legend-item"><span class="map-legend-dot map-legend-dot-ok"></span>Healthy<span class="map-legend-count" id="legend-ok">0</span></div>' +
    '<div class="map-legend-item"><span class="map-legend-dot map-legend-dot-warn"></span>Warning<span class="map-legend-count" id="legend-warn">0</span></div>' +
    '<div class="map-legend-item"><span class="map-legend-dot map-legend-dot-crit"></span>Critical<span class="map-legend-count" id="legend-crit">0</span></div>';
  wrapper.appendChild(legend);
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Build stats overlay
// ═══════════════════════════════════════════════════

function _buildStatsOverlay(container) {
  var wrapper = container.parentElement || container;
  var stats = document.createElement('div');
  stats.className = 'map-stats';
  stats.id = 'map-stats';
  stats.innerHTML =
    '<div class="map-stats-item"><div class="map-stats-value" id="stats-total">0</div><div class="map-stats-label">Total</div></div>' +
    '<div class="map-stats-item"><div class="map-stats-value" id="stats-stores">0</div><div class="map-stats-label">Stores</div></div>' +
    '<div class="map-stats-item"><div class="map-stats-value" id="stats-farms">0</div><div class="map-stats-label">Farms</div></div>';
  wrapper.appendChild(stats);
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Build filter chips
// ═══════════════════════════════════════════════════

function _buildFilterChips(container) {
  var wrapper = container.parentElement || container;

  // Remove existing if re-initialized
  var existing = wrapper.querySelector('.map-filters');
  if (existing) existing.remove();

  var filtersDiv = document.createElement('div');
  filtersDiv.className = 'map-filters';

  var chipData = [
    { label: 'All',      filter: 'all' },
    { label: 'Stores',   filter: 'store' },
    { label: 'Farms',    filter: 'farm' },
    { label: 'Critical', filter: 'crit' }
  ];

  for (var i = 0; i < chipData.length; i++) {
    var chip = document.createElement('div');
    chip.className = 'map-filter-chip' + (i === 0 ? ' active' : '');
    chip.textContent = chipData[i].label;
    chip.setAttribute('data-filter', chipData[i].filter);
    filtersDiv.appendChild(chip);
  }

  wrapper.appendChild(filtersDiv);

  // Wire clicks
  var allChips = filtersDiv.querySelectorAll('.map-filter-chip');
  for (var j = 0; j < allChips.length; j++) {
    _wireFilterChip(allChips[j], allChips);
  }
}


function _wireFilterChip(chip, allChips) {
  chip.addEventListener('click', function () {
    for (var k = 0; k < allChips.length; k++) {
      allChips[k].classList.remove('active');
    }
    chip.classList.add('active');

    var filterVal = chip.getAttribute('data-filter');
    _activeMapFilter = filterVal;

    if (filterVal === 'all') {
      updateMapMarkers({});
    } else if (filterVal === 'crit') {
      updateMapMarkers({ health_status: 'crit' });
    } else if (filterVal === 'store') {
      updateMapMarkers({ type: 'store' });
    } else if (filterVal === 'farm') {
      updateMapMarkers({ type: 'farm' });
    }
  });
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Update legend counts
// ═══════════════════════════════════════════════════

function _updateLegendCounts(stores) {
  var ok = 0, warn = 0, crit = 0;
  for (var i = 0; i < stores.length; i++) {
    var h = stores[i].health_status || 'ok';
    if (h === 'ok') ok++;
    else if (h === 'warn') warn++;
    else if (h === 'crit') crit++;
  }
  var okEl = document.getElementById('legend-ok');
  var warnEl = document.getElementById('legend-warn');
  var critEl = document.getElementById('legend-crit');
  if (okEl) okEl.textContent = ok;
  if (warnEl) warnEl.textContent = warn;
  if (critEl) critEl.textContent = crit;
}


// ═══════════════════════════════════════════════════
//  PRIVATE — Update stats overlay
// ═══════════════════════════════════════════════════

function _updateStatsOverlay(stores) {
  var total = 0, storeCount = 0, farmCount = 0;
  for (var i = 0; i < stores.length; i++) {
    if (!stores[i].lat || !stores[i].lng) continue;
    total++;
    if (stores[i].store_type === 'farm_supply') farmCount++;
    else storeCount++;
  }
  var totalEl = document.getElementById('stats-total');
  var storesEl = document.getElementById('stats-stores');
  var farmsEl = document.getElementById('stats-farms');
  if (totalEl) totalEl.textContent = total;
  if (storesEl) storesEl.textContent = storeCount;
  if (farmsEl) farmsEl.textContent = farmCount;
}

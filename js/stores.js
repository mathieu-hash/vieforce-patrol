// Stores Module — store list rendering, home KPIs, search & filters

// ── Helpers ──

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Never';
  var now = Date.now();
  var then = new Date(dateStr).getTime();
  var diff = now - then;
  if (diff < 0) return 'Just now';

  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + ' min' + (mins > 1 ? 's' : '') + ' ago';

  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';

  var days = Math.floor(hours / 24);
  if (days < 30) return days + ' day' + (days > 1 ? 's' : '') + ' ago';

  var months = Math.floor(days / 30);
  if (months < 12) return months + ' month' + (months > 1 ? 's' : '') + ' ago';

  var years = Math.floor(months / 12);
  return years + ' year' + (years > 1 ? 's' : '') + ' ago';
}

function formatStoreType(type) {
  if (!type) return '';
  return type
    .split('_')
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

// ── Store List Rendering ──

var _storeCache = [];

async function renderStoreList(filter) {
  var listEl = document.getElementById('store-list');
  if (!listEl) return;

  try {
    var stores = await getStores(filter || {});
    _storeCache = stores;

    if (stores.length === 0) {
      listEl.innerHTML = '<div class="card" style="text-align:center;padding:30px;color:#888;font-size:13px">' +
        'No stores yet. Tap + to add your first store.</div>';
      _updateFilterCounts([]);
      return;
    }

    var html = '';
    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];
      var health = s.health_status || 'ok';
      var volBadge = (s.vol_class || '-').toLowerCase();
      var badgeClass = volBadge === 'a' ? 'badge-a' : volBadge === 'b' ? 'badge-b' : 'badge-c';
      var storeType = formatStoreType(s.store_type);
      var city = s.city || '';
      var lastVisit = formatRelativeTime(s.last_visit_at);

      html += '<div class="card clickable" onclick="openStoreDetail(\'' + s.id + '\')" style="padding-left:20px">' +
        '<div class="health-bar health-' + health + '"></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:start">' +
          '<div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--navy)">' + _esc(s.name) + '</div>' +
            '<div style="font-size:11px;color:#888;margin-top:2px">' + _esc(storeType) + (city ? ' \u00b7 ' + _esc(city) : '') + '</div>' +
            '<div style="font-size:11px;color:#888;margin-top:2px">Last visit: ' + lastVisit + '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<span class="badge ' + badgeClass + '">' + (s.vol_class || '-') + '</span>' +
            '<div style="font-size:18px;font-weight:800;color:var(--navy);margin-top:4px">' + (s.bags_per_month || 0) + '</div>' +
            '<div style="font-size:9px;color:#888">bags/mo</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    listEl.innerHTML = html;
    _updateFilterCounts(stores);
  } catch (err) {
    listEl.innerHTML = '<div class="card" style="text-align:center;padding:20px;color:var(--pink);font-size:13px">' +
      'Error loading stores: ' + _esc(err.message) + '</div>';
  }
}

// HTML-escape helper
function _esc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Home Page KPIs ──

async function updateHomeKPIs() {
  var session = getSession();
  if (!session) return;

  try {
    // Fetch stores and visits in parallel
    var weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    var weekAgoDate = weekAgo.toISOString();

    var storesPromise = getStores();
    var visitsPromise = getVisitsByTSR(session.id, weekAgoDate);

    var results = await Promise.all([storesPromise, visitsPromise]);
    var stores = results[0];
    var visits = results[1];

    // Total stores
    var storesEl = document.getElementById('kpi-stores');
    if (storesEl) storesEl.textContent = stores.length;

    var storesDelta = storesEl ? storesEl.parentElement.querySelector('.delta') : null;
    if (storesDelta) storesDelta.textContent = 'mapped';

    // Visits this week
    var visitsEl = document.getElementById('kpi-visits');
    if (visitsEl) visitsEl.textContent = visits.length;

    var visitsDelta = visitsEl ? visitsEl.parentElement.querySelector('.delta') : null;
    if (visitsDelta) visitsDelta.textContent = 'this week';

    // Critical stores
    var critCount = 0;
    for (var i = 0; i < stores.length; i++) {
      if (stores[i].health_status === 'crit') critCount++;
    }
    var critEl = document.getElementById('kpi-critical');
    if (critEl) critEl.textContent = critCount;

    var critDelta = critEl ? critEl.parentElement.querySelector('.delta') : null;
    if (critDelta) critDelta.textContent = 'need attention';

    // Orders this week
    var orderCount = 0;
    var orderTotal = 0;
    for (var j = 0; j < visits.length; j++) {
      if (visits[j].order_taken) {
        orderCount++;
        orderTotal += parseFloat(visits[j].order_amount) || 0;
      }
    }
    var ordersEl = document.getElementById('kpi-orders');
    if (ordersEl) ordersEl.textContent = orderCount;

    var ordersDelta = ordersEl ? ordersEl.parentElement.querySelector('.delta') : null;
    if (ordersDelta) {
      ordersDelta.textContent = orderTotal > 0
        ? '\u20b1 ' + orderTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : 'this week';
    }

    // Stores subtitle
    var subtitleEl = document.getElementById('stores-subtitle');
    if (subtitleEl) {
      var territory = session.territory || session.district || session.region || 'All';
      subtitleEl.textContent = territory + ' \u00b7 ' + stores.length + ' store' + (stores.length !== 1 ? 's' : '');
    }

  } catch (err) {
    // Silently fail — KPIs stay as "--"
    console.error('updateHomeKPIs:', err);
  }
}

// ── Search ──

var _searchTimer = null;

function initStoreSearch() {
  var input = document.getElementById('store-search');
  if (!input) return;

  input.addEventListener('keyup', function () {
    var val = input.value.trim();
    if (_searchTimer) clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function () {
      var activeFilter = _getActiveHealthFilter();
      var filter = {};
      if (activeFilter) filter.health_status = activeFilter;
      if (val) filter.search = val;
      renderStoreList(filter);
    }, 300);
  });
}

// ── Filter Chips ──

function initStoreFilters() {
  var page = document.getElementById('page-stores');
  if (!page) return;

  var chips = page.querySelectorAll('.filter-chip');
  for (var i = 0; i < chips.length; i++) {
    (function (chip, idx) {
      chip.addEventListener('click', function () {
        // Set active
        for (var j = 0; j < chips.length; j++) {
          chips[j].classList.remove('active');
        }
        chip.classList.add('active');

        // Determine filter
        var filterMap = [null, 'crit', 'warn', 'ok'];
        var healthFilter = filterMap[idx] || null;

        var searchInput = document.getElementById('store-search');
        var searchVal = searchInput ? searchInput.value.trim() : '';

        var filter = {};
        if (healthFilter) filter.health_status = healthFilter;
        if (searchVal) filter.search = searchVal;

        renderStoreList(filter);
      });
    })(chips[i], i);
  }

  // Initial load with counts
  renderStoreList();
}

function _getActiveHealthFilter() {
  var page = document.getElementById('page-stores');
  if (!page) return null;
  var chips = page.querySelectorAll('.filter-chip');
  var filterMap = [null, 'crit', 'warn', 'ok'];
  for (var i = 0; i < chips.length; i++) {
    if (chips[i].classList.contains('active')) return filterMap[i] || null;
  }
  return null;
}

function _updateFilterCounts(allStores) {
  // Use cached full list if filtered subset passed
  // We need the full unfiltered list for counts
  var page = document.getElementById('page-stores');
  if (!page) return;

  var chips = page.querySelectorAll('.filter-chip');
  if (chips.length < 4) return;

  // If we have a health filter active, allStores is a subset — fetch counts from cache
  // We always count from the last unfiltered fetch
  // Use a separate async count if filter is active
  getStores().then(function (full) {
    var total = full.length;
    var crit = 0, warn = 0, ok = 0;
    for (var i = 0; i < full.length; i++) {
      var h = full[i].health_status;
      if (h === 'crit') crit++;
      else if (h === 'warn') warn++;
      else ok++;
    }
    chips[0].textContent = 'All (' + total + ')';
    chips[1].textContent = 'Critical (' + crit + ')';
    chips[2].textContent = 'Warning (' + warn + ')';
    chips[3].textContent = 'OK (' + ok + ')';
  }).catch(function () {
    // ignore — counts just won't update
  });
}

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

  // Show skeleton while loading (Rule 7: never show spinners)
  if (_storeCache.length === 0) {
    listEl.innerHTML = _buildStoreSkeleton(4);
  }

  try {
    var stores = await getStores(filter || {});
    _storeCache = stores;

    if (stores.length === 0) {
      listEl.innerHTML = (typeof getEmptyStoreStateHTML === 'function')
        ? getEmptyStoreStateHTML()
        : '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:15px">' + _esc(T.noStores) + '</div>';
      _updateFilterCounts([]);
      return;
    }

    // Check which stores were visited today
    var todayStr = new Date().toISOString().slice(0, 10);

    var html = '';
    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];
      var health = s.health_status || 'ok';
      var initial = (s.name || '?').charAt(0).toUpperCase();
      var storeType = formatStoreTypeTagalog ? formatStoreTypeTagalog(s.store_type) : formatStoreType(s.store_type);
      var city = s.city || '';
      var lastVisitText = formatRelativeTimeTagalog ? formatRelativeTimeTagalog(s.last_visit_at) : formatRelativeTime(s.last_visit_at);

      // Was this store visited today?
      var visitedToday = s.last_visit_at && s.last_visit_at.slice(0, 10) === todayStr;
      var nameClass = visitedToday ? 'store-row-name visited' : 'store-row-name';

      // Priority ring: not visited in 7+ days
      var daysSinceVisit = s.last_visit_at ? Math.floor((Date.now() - new Date(s.last_visit_at).getTime()) / 86400000) : 999;
      var hasPriorityRing = daysSinceVisit >= 7;
      var avatarClass = 'store-avatar health-' + health + (hasPriorityRing ? ' priority-ring' : '');

      // Subtitle: type + city + bags
      var subParts = [];
      if (city) subParts.push(_esc(city));
      if (s.bags_per_month) subParts.push(s.bags_per_month + ' ' + T.bagsMonth);
      var subText = subParts.join(' \u00b7 ');

      // Preview line: last visit outcome (like Messenger last message)
      var previewText = s.last_visit_at ? (T.lastVisit + ' \u00b7 ' + lastVisitText) : T.notVisited;

      // Sync tick: show done tick for visited stores
      var syncHtml = visitedToday
        ? '<span class="sync-tick-done">\u2713\u2713</span>'
        : (s.last_visit_at ? '' : '<span class="sync-tick-pending">\u25cb</span>');

      html += '<div class="store-row" data-store-id="' + s.id + '" onclick="openStoreDetail(\'' + s.id + '\')">' +
        // Avatar circle with health dot
        '<div class="' + avatarClass + '">' +
          initial +
          '<span class="health-dot dot-' + health + '"></span>' +
        '</div>' +
        // Body
        '<div class="store-row-body">' +
          '<div class="' + nameClass + '">' + _esc(s.name) + '</div>' +
          (subText ? '<div class="store-row-sub">' + subText + '</div>' : '') +
          '<div class="store-row-preview">' + _esc(previewText) + '</div>' +
        '</div>' +
        // Meta: timestamp + sync
        '<div class="store-row-meta">' +
          '<span class="store-row-time">' + (s.last_visit_at ? lastVisitText : '') + '</span>' +
          syncHtml +
        '</div>' +
      '</div>';
    }

    listEl.innerHTML = html;
    _updateFilterCounts(stores);
  } catch (err) {
    listEl.innerHTML = '<div style="text-align:center;padding:30px 20px;color:var(--sync-error);font-size:14px">' +
      _esc(T.loadError) + '<br><small>' + _esc(err.message) + '</small></div>';
  }
}

// Skeleton loading rows (Rule 7: no spinners)
function _buildStoreSkeleton(count) {
  var html = '';
  for (var i = 0; i < count; i++) {
    html += '<div class="skeleton-row">' +
      '<div class="skeleton skeleton-circle"></div>' +
      '<div style="flex:1;display:flex;flex-direction:column;gap:6px">' +
        '<div class="skeleton skeleton-line w60"></div>' +
        '<div class="skeleton skeleton-line w80"></div>' +
        '<div class="skeleton skeleton-line w40"></div>' +
      '</div>' +
    '</div>';
  }
  return html;
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
    var storesDelta = document.getElementById('kpi-stores-delta');
    if (storesDelta) storesDelta.textContent = 'na-map na';

    // Visits this week
    var visitsEl = document.getElementById('kpi-visits');
    if (visitsEl) visitsEl.textContent = visits.length;
    var visitsDelta = document.getElementById('kpi-visits-delta');
    if (visitsDelta) visitsDelta.textContent = 'ngayong linggo';

    // Critical stores
    var critCount = 0;
    for (var i = 0; i < stores.length; i++) {
      if (stores[i].health_status === 'crit') critCount++;
    }
    var critEl = document.getElementById('kpi-critical');
    if (critEl) critEl.textContent = critCount;
    var critDelta = document.getElementById('kpi-critical-delta');
    if (critDelta) critDelta.textContent = critCount > 0 ? 'kailangan ng atensyon' : 'OK lahat';

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
    var ordersDelta = document.getElementById('kpi-orders-delta');
    if (ordersDelta) {
      ordersDelta.textContent = orderTotal > 0
        ? '\u20b1 ' + orderTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : 'ngayong linggo';
    }

    // Stores subtitle
    var subtitleEl = document.getElementById('stores-subtitle');
    if (subtitleEl) {
      var territory = session.territory || session.district || session.region || '';
      subtitleEl.textContent = territory + ' \u00b7 ' + T.storesCount(stores.length);
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

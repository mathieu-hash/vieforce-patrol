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

// Sprint B-TSR: trend badge helper for KPI cards
function _setKpiTrend(elId, current, previous) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (current == null || previous == null) {
    el.className = 'kpi-trend';
    el.textContent = '';
    return;
  }
  if (previous === 0) {
    if (current === 0) { el.className = 'kpi-trend flat'; el.textContent = '\u2014'; }
    else { el.className = 'kpi-trend up'; el.textContent = '\u2191 NEW'; }
    return;
  }
  var pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0)      { el.className = 'kpi-trend up';   el.textContent = '\u2191 ' + pct + '%'; }
  else if (pct < 0) { el.className = 'kpi-trend down'; el.textContent = '\u2193 ' + Math.abs(pct) + '%'; }
  else              { el.className = 'kpi-trend flat'; el.textContent = '\u2014'; }
}

function formatStoreType(type) {
  if (!type) return '';
  return type
    .split('_')
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

function _formatDaysWithoutVisit(days) {
  if (!days || days > 365) return (T && T.neverVisited) || 'Never visited';
  if (T && typeof T.daysWithoutVisit === 'function') return T.daysWithoutVisit(days);
  return days + ' days without visit';
}

function getStoreIcon(type) {
  var icons = {
    'feeds_dealer': '\ud83c\udfea',
    'farm_supply':  '\ud83c\udfea',
    'pet_shop':     '\ud83d\udc15',
    'veterinary':   '\ud83c\udfe5',
    'supermarket':  '\ud83d\uded2',
    'other':        '\ud83c\udfec'
  };
  return icons[type] || '\ud83c\udfea';
}
window.getStoreIcon = getStoreIcon;

function getStoreTypeColor(type) {
  var colors = {
    'feeds_dealer': '#1877F2',
    'farm_supply': '#2E9B5F',
    'pet_shop': '#A855F7',
    'veterinary': '#0EA5A5',
    'supermarket': '#F59E0B',
    'other': '#5F6B76'
  };
  return colors[type] || '#1877F2';
}

// ── Messenger-style reusable components (TSR vanilla implementation) ──
function renderStoreRowComponent(opts) {
  var o = opts || {};
  return '<div class="store-row conv" data-store-id="' + _esc(o.id || '') + '" onclick="openStoreDetail(\'' + _esc(o.id || '') + '\')">' +
    '<div class="av-wrap">' +
      '<div class="av" style="background:' + _esc(o.avatarBg || '#1877F2') + '">' +
        '<span class="av-icon">' + _esc(o.icon || '\ud83c\udfea') + '</span>' +
        '<span class="av-initials">' + _esc(o.initials || '') + '</span>' +
      '</div>' +
      '<div class="' + _esc(o.dotClass || 'status-dot dot-ok') + '"></div>' +
    '</div>' +
    '<div class="conv-info">' +
      '<div class="' + _esc(o.nameClass || 'conv-name') + '">' + _esc(o.name || '--') + '</div>' +
      '<div class="' + _esc(o.previewClass || 'conv-last') + '">' + (o.previewHtml || '') + '</div>' +
    '</div>' +
    '<div class="conv-meta">' +
      '<span class="' + _esc(o.timeClass || 'conv-time') + '">' + _esc(o.timeText || '') + '</span>' +
      (o.statusHtml || '') +
      '<span class="store-row-chevron">\u203a</span>' +
    '</div>' +
  '</div>';
}
window.renderStoreRowComponent = renderStoreRowComponent;

function renderVisitBubbleComponent(opts) {
  var o = opts || {};
  return '<div class="msg-row">' +
    '<div class="msg-av-small" style="background:' + _esc(o.avatarBg || '#5F6B76') + '">' + _esc(o.initials || '') + '</div>' +
    '<div>' +
      '<div class="bubble in visit-bubble-msg" onclick="showVisitDetail(\'' + _esc(o.visitId || '') + '\')">' +
        _esc(o.outcomeLabel || '') +
        (o.notes ? '<br><span class="visit-bubble-notes">' + _esc(o.notes) + '</span>' : '') +
      '</div>' +
      '<div class="msg-time">' + _esc(o.timeText || '') + ' <span class="ticks gray">\u2713\u2713</span></div>' +
    '</div>' +
  '</div>';
}
window.renderVisitBubbleComponent = renderVisitBubbleComponent;

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

    // Flat Messenger-style colors for conv rows (no gradients)
    var _gradients = {
      crit: '#E8746E',
      warn: '#F2B14A',
      ok:   '#7EB87E'
    };
    var _gradientArr = [
      '#4A90E2',
      '#6BA3E8',
      '#C78AD9',
      '#7EB87E',
      '#65676B'
    ];

    // Split stores into unvisited-today and visited-today
    var unvisited = [];
    var visited = [];
    for (var si = 0; si < stores.length; si++) {
      var vs = stores[si].last_visit_at && stores[si].last_visit_at.slice(0, 10) === todayStr;
      if (vs) visited.push(stores[si]); else unvisited.push(stores[si]);
    }

    // Render story circles for priority stores (7+ days unvisited or critical)
    _renderStoryCircles(stores, _gradients, _gradientArr);

    // Build conversation rows
    var html = '';
    if (unvisited.length > 0) {
      html += '<div class="section-hdr">\u26a1 ' + T.notVisited + '</div>';
      for (var u = 0; u < unvisited.length; u++) {
        html += _buildConvRow(unvisited[u], todayStr, _gradients, _gradientArr);
      }
    }
    if (visited.length > 0) {
      html += '<div class="section-hdr">\u2705 ' + (T.visited || 'Visited') + ' \u00b7 ' + (T.today || 'Today') + '</div>';
      for (var v = 0; v < visited.length; v++) {
        html += _buildConvRow(visited[v], todayStr, _gradients, _gradientArr);
      }
    }
    if (unvisited.length === 0 && visited.length === 0) {
      html = (typeof getEmptyStoreStateHTML === 'function')
        ? getEmptyStoreStateHTML()
        : '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:15px">' + _esc(T.noStores) + '</div>';
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

// ── FB Messenger conversation row builder ──

function _buildConvRow(s, todayStr, gradients, gradientArr) {
  var health = s.health_status || 'ok';
  var initial = (s.name || '?').charAt(0).toUpperCase();
  var second = (s.name || '').split(/\s+/)[1];
  var initials = initial + (second ? second.charAt(0).toUpperCase() : '');
  var city = s.city || '';
  var lastVisitText = formatRelativeTimeTagalog ? formatRelativeTimeTagalog(s.last_visit_at) : formatRelativeTime(s.last_visit_at);
  var visitedToday = s.last_visit_at && s.last_visit_at.slice(0, 10) === todayStr;
  var daysSinceVisit = s.last_visit_at ? Math.floor((Date.now() - new Date(s.last_visit_at).getTime()) / 86400000) : 999;

  // Avatar gradient — use health-based or hash-based
  var typeColor = getStoreTypeColor(s.store_type);
  var grad = 'linear-gradient(135deg,' + typeColor + ',#004A64)';

  // Name styling: bold if unvisited, muted if visited today
  var nameClass = visitedToday ? 'conv-name muted' : 'conv-name';

  // Preview text
  var previewClass = 'conv-last' + (visitedToday ? ' muted' : '');
  var previewText = '';
  if (daysSinceVisit >= 7) {
    previewClass = 'conv-last urgent';
    previewText = '\u26a0\ufe0f ' + _formatDaysWithoutVisit(daysSinceVisit);
  } else if (visitedToday) {
    previewText = '\u2713 ' + T.lastVisit + ' \u00b7 ' + lastVisitText;
  } else if (s.last_visit_at) {
    previewText = T.lastVisit + ' \u00b7 ' + lastVisitText;
  } else {
    previewText = T.notVisited;
  }

  // Timestamp: short Messenger format
  var timeText = '';
  var timeClass = 'conv-time';
  if (visitedToday) {
    timeText = s.last_visit_at ? new Date(s.last_visit_at).toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'}) : '';
  } else if (s.last_visit_at) {
    timeText = _shortTime(daysSinceVisit);
    if (daysSinceVisit >= 7) timeClass = 'conv-time new';
  }

  // Right side: ticks or urgent badge
  var statusHtml = '';
  if (daysSinceVisit >= 7 && health === 'crit') {
    statusHtml += '<div class="urgent-badge">!</div>';
  } else if (daysSinceVisit >= 5 && !visitedToday) {
    statusHtml += '<div class="urgent-badge" style="background:var(--status-warn)">' + daysSinceVisit + 'd</div>';
  } else if (visitedToday) {
    statusHtml += '<span class="ticks">\u2713\u2713</span>';
  } else if (s.last_visit_at) {
    statusHtml += '<span class="ticks gray">\u2713\u2713</span>';
  }

  // Health dot
  var dotClass = 'status-dot dot-' + health;

  var icon = getStoreIcon(s.store_type);

  return renderStoreRowComponent({
    id: s.id,
    avatarBg: grad,
    icon: icon,
    initials: initials,
    dotClass: dotClass,
    name: s.name,
    nameClass: nameClass,
    previewClass: previewClass,
    previewHtml: previewText,
    timeClass: timeClass,
    timeText: timeText,
    statusHtml: statusHtml
  });
}

function _shortTime(days) {
  if (days < 1) return T.justNow || 'Now';
  if (days === 1) return T.yesterday || 'Kahapon';
  if (days < 7) return days + 'd';
  if (days < 30) return Math.floor(days / 7) + 'w';
  return Math.floor(days / 30) + 'mo';
}

function _hashCode(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ── Story circles (priority stores) ──

function _renderStoryCircles(stores, gradients, gradientArr) {
  var el = document.getElementById('story-circles-row');
  if (!el) return;

  // Density pass: managers hide this row (CSS); skip DOM work for DSM/RSM/CEO.
  var b = document.body;
  if (b && (b.classList.contains('role-dsm') || b.classList.contains('role-rsm') || b.classList.contains('role-ceo'))) {
    el.style.display = 'none';
    return;
  }

  // Story circles keep gradients (urgent priority visuals). Soft palette.
  var storyGrads = {
    crit: 'linear-gradient(135deg,#E8746E,#F0958F)',
    warn: 'linear-gradient(135deg,#F2B14A,#F7C97A)',
    ok:   'linear-gradient(135deg,#7EB87E,#95C695)'
  };
  var storyGradArr = [
    'linear-gradient(135deg,#4A90E2,#6BA3E8)',
    'linear-gradient(135deg,#C78AD9,#D5A0E2)',
    'linear-gradient(135deg,#7EB87E,#95C695)'
  ];

  // Filter: unvisited 5+ days, critical, or new prospects
  var priority = [];
  for (var i = 0; i < stores.length; i++) {
    var s = stores[i];
    var days = s.last_visit_at ? Math.floor((Date.now() - new Date(s.last_visit_at).getTime()) / 86400000) : 999;
    if (days >= 5 || s.health_status === 'crit') {
      priority.push({ store: s, days: days });
    }
  }
  // Sort by urgency (most overdue first)
  priority.sort(function(a, b) { return b.days - a.days; });
  priority = priority.slice(0, 10);

  if (priority.length === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';

  var html = '';
  for (var j = 0; j < priority.length; j++) {
    var p = priority[j];
    var s = p.store;
    var health = s.health_status || 'ok';
    var initial = (s.name || '?').charAt(0).toUpperCase();
    var second = (s.name || '').split(/\s+/)[1];
    var initials = initial + (second ? second.charAt(0).toUpperCase() : '');
    var shortName = (s.name || '').split(/\s+/).slice(0, 2).join(' ');
    if (shortName.length > 10) shortName = shortName.slice(0, 9) + '\u2026';

    // Ring class
    var ringClass = 'story-ring ';
    var badgeBg = '';
    var badgeText = '';
    if (p.days >= 7 && health === 'crit') {
      ringClass += 'ring-urgent';
      badgeBg = 'var(--status-crit)';
      badgeText = '!';
    } else if (p.days >= 7) {
      ringClass += 'ring-warn';
      badgeBg = 'var(--status-warn)';
      badgeText = p.days + 'd';
    } else if (health === 'crit') {
      ringClass += 'ring-urgent';
      badgeBg = 'var(--status-crit)';
      badgeText = '!';
    } else {
      ringClass += 'ring-warn';
      badgeBg = 'var(--status-warn)';
      badgeText = p.days + 'd';
    }

    var typeColor = getStoreTypeColor(s.store_type);
    var grad = 'linear-gradient(135deg,' + typeColor + ',#004A64)';
    var icon = getStoreIcon(s.store_type);

    html += '<div class="story" onclick="openStoreDetail(\'' + s.id + '\')">' +
      '<div class="story-ring-wrap">' +
        '<div class="' + ringClass + '">' +
          '<div class="story-inner"><div class="story-av" style="background:' + grad + '">' + icon + '</div></div>' +
        '</div>' +
        '<div class="story-badge" style="background:' + badgeBg + '">' + badgeText + '</div>' +
      '</div>' +
      '<span class="story-label">' + _esc(shortName) + '</span>' +
    '</div>';
  }

  el.innerHTML = html;
}

// ── Home Page KPIs ──

async function updateHomeKPIs() {
  var session = getSession();
  if (!session) return;

  try {
    // Fetch stores + this-week + previous-week visits in parallel
    var now = new Date();
    var weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    var twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    var storesPromise = getStores();
    var visitsPromise = getVisitsByTSR(session.id, weekAgo.toISOString());
    var prevVisitsPromise = getVisitsByTSR(session.id, twoWeeksAgo.toISOString());

    var results = await Promise.all([storesPromise, visitsPromise, prevVisitsPromise]);
    var stores = results[0];
    var visits = results[1];
    var allRecentVisits = results[2] || [];

    // Sprint B-TSR: previous-week metrics for trend arrows
    var weekAgoMs = weekAgo.getTime();
    var prevWeekVisits = allRecentVisits.filter(function (v) {
      return v.visited_at && new Date(v.visited_at).getTime() < weekAgoMs;
    });
    var prevOrderCount = 0;
    for (var pv = 0; pv < prevWeekVisits.length; pv++) {
      if (prevWeekVisits[pv].order_taken) prevOrderCount++;
    }
    _setKpiTrend('kpi-stores-trend', null, null);
    _setKpiTrend('kpi-visits-trend', visits.length, prevWeekVisits.length);

    // Total stores
    var storesEl = document.getElementById('kpi-stores');
    if (storesEl) storesEl.textContent = stores.length;
    var storesDelta = document.getElementById('kpi-stores-delta');
    if (storesDelta) storesDelta.textContent = (T && T.kpiMapped) || 'na-map na';

    // Visits this week
    var visitsEl = document.getElementById('kpi-visits');
    if (visitsEl) visitsEl.textContent = visits.length;
    var visitsDelta = document.getElementById('kpi-visits-delta');
    if (visitsDelta) visitsDelta.textContent = (T && T.kpiThisWeek) || 'ngayong linggo';

    // Critical stores
    var critCount = 0;
    for (var i = 0; i < stores.length; i++) {
      if (stores[i].health_status === 'crit') critCount++;
    }
    var critEl = document.getElementById('kpi-critical');
    if (critEl) critEl.textContent = critCount;
    var critDelta = document.getElementById('kpi-critical-delta');
    if (critDelta) critDelta.textContent = critCount > 0
      ? ((T && T.kpiNeedsAttn) || 'kailangan ng atensyon')
      : ((T && T.kpiAllOk) || 'OK lahat');

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
        : ((T && T.kpiThisWeek) || 'ngayong linggo');
    }

    // Sprint B-TSR: trend arrows (this week vs prev week) for orders + critical
    _setKpiTrend('kpi-orders-trend', orderCount, prevOrderCount);
    _setKpiTrend('kpi-critical-trend', null, null); // critical is a snapshot, not delta

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
    (function (chip) {
      chip.addEventListener('click', function () {
        for (var j = 0; j < chips.length; j++) chips[j].classList.remove('active');
        chip.classList.add('active');

        var label = chip.getAttribute('data-filter-label') || 'all';
        var searchInput = document.getElementById('store-search');
        var searchVal = searchInput ? searchInput.value.trim() : '';

        var filter = {};
        if (label === 'crit' || label === 'warn' || label === 'ok') {
          filter.health_status = label;
        } else if (label === 'prospect') {
          filter.store_status = 'prospect';
        } else if (label === 'active') {
          filter.store_status = 'active';
        }
        if (searchVal) filter.search = searchVal;
        renderStoreList(filter);
      });
    })(chips[i]);
  }

  renderStoreList();
}

function _getActiveHealthFilter() {
  var page = document.getElementById('page-stores');
  if (!page) return null;
  var chips = page.querySelectorAll('.filter-chip');
  for (var i = 0; i < chips.length; i++) {
    if (chips[i].classList.contains('active')) {
      var l = chips[i].getAttribute('data-filter-label');
      return (l === 'crit' || l === 'warn' || l === 'ok') ? l : null;
    }
  }
  return null;
}

function _updateFilterCounts(allStores) {
  var page = document.getElementById('page-stores');
  if (!page) return;

  var chips = page.querySelectorAll('.filter-chip');
  if (chips.length < 4) return;

  // Prefer already-fetched list to avoid an extra round-trip per render.
  if (Array.isArray(allStores)) {
    var total = allStores.length;
    var crit = 0, warn = 0, ok = 0;
    for (var i = 0; i < allStores.length; i++) {
      var h = allStores[i].health_status;
      if (h === 'crit') crit++;
      else if (h === 'warn') warn++;
      else ok++;
    }
    chips[0].textContent = (T.all || 'Lahat') + ' (' + total + ')';
    chips[1].textContent = (T.critical || 'Critical') + ' (' + crit + ')';
    chips[2].textContent = (T.warning || 'Babala') + ' (' + warn + ')';
    chips[3].textContent = 'OK (' + ok + ')';
    return;
  }

  // Fallback if caller has no list yet.
  getStores().then(function (full) {
    _updateFilterCounts(full || []);
  }).catch(function () {
    // ignore — counts just won't update
  });
}

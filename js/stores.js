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

/** DSM/RSM/CEO: drill-down by assigned rep (client-side filter after one fetch). */
var _storesTeamMembers = [];
var _storesAssigneeScope = 'all'; // 'all' | 'unassigned' | 'mine' | '<uuid>'
var _storesAssigneeHandlersBound = false;

function _sessionShowsAssigneeFilters(sess) {
  return !!(sess && (sess.role === 'dsm' || sess.role === 'rsm' || sess.role === 'ceo'));
}

function _shortRepLabel(name) {
  if (!name) return '?';
  var s = String(name).trim();
  var low = s.toLowerCase();
  var idx = low.indexOf('tsr');
  if (idx !== -1) {
    var tail = s.slice(idx + 3).replace(/^[:\-\s]+/, '').trim();
    if (tail.length) return tail.split(/\s+/).slice(0, 2).join(' ');
  }
  var parts = s.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return s;
  return parts.slice(-2).join(' ');
}

function _assigneeLabelForStore(s, lookup) {
  lookup = lookup || {};
  if (!s || !s.assigned_tsr) {
    return (T && T.noRepTag) || 'Walang rep';
  }
  var id = s.assigned_tsr;
  if (lookup[id]) return lookup[id];
  if (s._assigned_name_cache) return s._assigned_name_cache;
  return 'Rep';
}

var _lastStoresAssigneeLookup = {};

function _collectHealthSearchFilterFromUi() {
  var filter = {};
  var page = document.getElementById('page-stores');
  if (!page) return filter;
  var row = page.querySelector('[data-filter-row="health"]');
  var chips = row ? row.querySelectorAll('.tab') : [];
  var label = 'all';
  var ci;
  for (ci = 0; ci < chips.length; ci++) {
    if (chips[ci].classList.contains('active')) {
      label = chips[ci].getAttribute('data-filter-label') || 'all';
      break;
    }
  }
  if (label === 'crit' || label === 'warn' || label === 'ok') filter.health_status = label;
  else if (label === 'prospect') filter.store_status = 'prospect';
  else if (label === 'active') filter.store_status = 'active';
  var searchInput = document.getElementById('store-search');
  var searchVal = searchInput ? searchInput.value.trim() : '';
  if (searchVal) filter.search = searchVal;
  return filter;
}

function _escAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}

function _refreshAssigneeChipStrip(stores) {
  var row = document.getElementById('stores-assignee-filter-row');
  if (!row || !_storesTeamMembers.length) return;

  var counts = { all: stores.length, unassigned: 0, mine: 0 };
  var sess = typeof getSession === 'function' ? getSession() : null;
  var k;
  for (k = 0; k < _storesTeamMembers.length; k++) {
    counts[_storesTeamMembers[k].id] = 0;
  }
  var i;
  for (i = 0; i < stores.length; i++) {
    var st = stores[i];
    if (!st.assigned_tsr) counts.unassigned++;
    if (sess && st.created_by === sess.id) counts.mine++;
    if (st.assigned_tsr && counts[st.assigned_tsr] != null) counts[st.assigned_tsr]++;
  }

  var html = '';
  function chip(scope, lbl, count) {
    var active = String(_storesAssigneeScope) === String(scope) ? ' active' : '';
    html +=
      '<button type="button" class="filter-chip filter-chip-assignee' + active + '" data-assignee-scope="' +
      _escAttr(scope) +
      '">' +
      _esc(lbl) +
      ' (' +
      count +
      ')</button>';
  }

  chip('all', (T && T.teamAll) || 'Lahat ng team', counts.all);
  for (var j = 0; j < _storesTeamMembers.length; j++) {
    var m = _storesTeamMembers[j];
    var c = counts[m.id] != null ? counts[m.id] : 0;
    chip(String(m.id), _shortRepLabel(m.name), c);
  }
  chip('unassigned', (T && T.noRepShort) || 'Walang rep', counts.unassigned);
  chip('mine', (T && T.myListShort) || 'Lista ko', counts.mine);

  row.innerHTML = html;
  row.style.display = 'flex';
  _bindAssigneeChipHandlersOnce();
}

function _bindAssigneeChipHandlersOnce() {
  if (_storesAssigneeHandlersBound) return;
  var row = document.getElementById('stores-assignee-filter-row');
  if (!row) return;
  _storesAssigneeHandlersBound = true;
  row.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('.filter-chip-assignee');
    if (!btn || !row.contains(btn)) return;
    var scope = btn.getAttribute('data-assignee-scope');
    if (scope == null) return;
    _storesAssigneeScope = scope;
    var assignees = row.querySelectorAll('.filter-chip-assignee');
    var i;
    for (i = 0; i < assignees.length; i++) assignees[i].classList.remove('active');
    btn.classList.add('active');
    renderStoreList();
  });
}

async function initStoresAssigneeRow() {
  var sess = typeof getSession === 'function' ? getSession() : null;
  var row = document.getElementById('stores-assignee-filter-row');
  if (!row || !_sessionShowsAssigneeFilters(sess) || !sess.id) return;
  try {
    var fn = typeof getTeamMembersForStoresFilter === 'function'
      ? getTeamMembersForStoresFilter
      : null;
    if (!fn) return;
    var members = await fn(sess.id);
    _storesTeamMembers = members || [];
    if (!_storesTeamMembers.length) {
      row.style.display = 'none';
      row.innerHTML = '';
    }
  } catch (e) {
    console.warn('initStoresAssigneeRow', e);
  }
}

function _filterStoresByAssignee(stores, scope, session) {
  if (!_sessionShowsAssigneeFilters(session)) return stores;
  scope = scope || 'all';
  if (scope === 'all') return stores;
  if (scope === 'unassigned') {
    return stores.filter(function (s) { return !s.assigned_tsr; });
  }
  if (scope === 'mine' && session && session.id) {
    return stores.filter(function (s) { return s.created_by === session.id; });
  }
  return stores.filter(function (s) {
    return s.assigned_tsr && String(s.assigned_tsr) === String(scope);
  });
}

function _repLookupFromMembers(members) {
  var m = {};
  for (var i = 0; i < (members || []).length; i++) {
    var r = members[i];
    if (r && r.id) m[r.id] = _shortRepLabel(r.name || '');
  }
  return m;
}

async function renderStoreList(filter) {
  var listEl = document.getElementById('storesList') || document.getElementById('store-list');
  if (!listEl) return;

  // Show skeleton while loading (Rule 7: never show spinners)
  if (_storeCache.length === 0) {
    listEl.innerHTML = _buildStoreSkeleton(4);
  }

  try {
    var session = typeof getSession === 'function' ? getSession() : null;
    var baseFilter = filter != null ? filter : _collectHealthSearchFilterFromUi();

    var storesRaw = await getStores(baseFilter || {});
    var assigneeLookup = _repLookupFromMembers(_storesTeamMembers);
    _lastStoresAssigneeLookup = assigneeLookup;

    var stores = storesRaw;
    if (_sessionShowsAssigneeFilters(session)) {
      if (_storesTeamMembers.length > 0) {
        for (var ai = 0; ai < storesRaw.length; ai++) {
          var sid = storesRaw[ai].assigned_tsr;
          if (sid && assigneeLookup[sid]) storesRaw[ai]._assigned_name_cache = assigneeLookup[sid];
        }
        _refreshAssigneeChipStrip(storesRaw);
      }
      stores = _filterStoresByAssignee(storesRaw, _storesAssigneeScope, session);
    }

    _storeCache = stores;

    if (stores.length === 0) {
      listEl.innerHTML = (typeof getEmptyStoreStateHTML === 'function')
        ? getEmptyStoreStateHTML()
        : '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:15px">' + _esc(T.noStores) + '</div>';
      _updateFilterCounts([]);
      return;
    }

    var mgrSession = typeof getSession === 'function' ? getSession() : null;

    _renderStoryCircles(stores);

    var combined = stores.slice().sort(function (a, b) {
      var da = _daysSinceVisitStore(a);
      var db = _daysSinceVisitStore(b);
      var aa = da == null ? 9999 : da;
      var bb = db == null ? 9999 : db;
      var ha = (a.health_status || 'ok');
      var hb = (b.health_status || 'ok');
      function rank(store, daysNum, hlth) {
        if (hlth === 'crit' || daysNum == null || daysNum > 30) {
          return 400000 + Math.min(daysNum != null ? daysNum : 9999, 999);
        }
        if (hlth === 'warn' || (daysNum >= 7 && daysNum <= 30)) {
          return 300000 + (daysNum || 0);
        }
        return 100000 + (daysNum != null ? (365 - Math.min(daysNum, 365)) : 0);
      }
      return rank(b, bb, hb) - rank(a, aa, ha);
    });

    var html = '';
    var ci;
    for (ci = 0; ci < combined.length; ci++) {
      html += _buildCompactStoreRow(combined[ci], mgrSession, assigneeLookup);
    }

    var hintEl = document.getElementById('stores-empty-hint');
    if (hintEl) hintEl.style.display = 'none';

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

  var previewHtmlCombined = previewText;
  var mgr = typeof getSession === 'function' ? getSession() : null;
  if (_sessionShowsAssigneeFilters(mgr)) {
    previewHtmlCombined =
      '<span class="store-assignee-pill">' +
      _esc(_assigneeLabelForStore(s, _lastStoresAssigneeLookup)) +
      '</span><span class="store-assignee-sep"> · </span>' +
      _esc(previewText);
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
    previewHtml: previewHtmlCombined,
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

function _daysSinceVisitStore(s) {
  if (!s || !s.last_visit_at) return null;
  return Math.floor((Date.now() - new Date(s.last_visit_at).getTime()) / 86400000);
}

function _avatarDotClassForStore(s) {
  var days = _daysSinceVisitStore(s);
  if (days == null) return 'avatar-dot-danger';
  if (days < 7) return 'avatar-dot-online';
  if (days <= 30) return 'avatar-dot-warning';
  return 'avatar-dot-danger';
}

function _rowSeverityClassForStore(s) {
  var days = _daysSinceVisitStore(s);
  var h = (s && s.health_status) || 'ok';
  if (h === 'crit' || days == null || days > 30) return 'danger';
  if (h === 'warn' || (days >= 7 && days <= 30)) return 'warn';
  return '';
}

function _buildCompactStoreRow(s, mgrSession, assigneeLookup) {
  var todayStr = new Date().toISOString().slice(0, 10);
  var visitedToday = s.last_visit_at && s.last_visit_at.slice(0, 10) === todayStr;
  var initial = (s.name || '?').charAt(0).toUpperCase();
  var second = (s.name || '').split(/\s+/)[1];
  var initials = initial + (second ? second.charAt(0).toUpperCase() : '');
  var dotCls = _avatarDotClassForStore(s);
  var sev = _rowSeverityClassForStore(s);
  var rowCls = 'row store-row' + (sev ? ' ' + sev : '');
  var grad = 'linear-gradient(135deg, var(--brand-navy, #004D71), var(--accent, #00A6CE))';
  var lastVisitText = formatRelativeTimeTagalog ? formatRelativeTimeTagalog(s.last_visit_at) : formatRelativeTime(s.last_visit_at);
  var previewText = '';
  if (visitedToday) {
    previewText = '\u2713 ' + (T.lastVisit || '') + ' \u00b7 ' + lastVisitText;
  } else if (s.last_visit_at) {
    previewText = (T.lastVisit || '') + ' \u00b7 ' + lastVisitText;
  } else {
    previewText = (T.notVisited || '');
  }
  if (_sessionShowsAssigneeFilters(mgrSession)) {
    previewText = _assigneeLabelForStore(s, assigneeLookup) + ' \u00b7 ' + previewText;
  }
  var days = _daysSinceVisitStore(s);
  var timeText = '';
  if (visitedToday) {
    timeText = s.last_visit_at ? new Date(s.last_visit_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
  } else if (s.last_visit_at && days != null) {
    timeText = _shortTime(days);
  }

  return (
    '<div class="' +
    _esc(rowCls) +
    '" data-store-id="' +
    _escAttr(s.id || '') +
    '" onclick="openStoreDetail(\'' +
    _esc(s.id || '') +
    '\')">' +
    '<div class="avatar ' +
    dotCls +
    '" style="background:' +
    grad +
    ';">' +
    _esc(initials) +
    '</div>' +
    '<div class="row-content">' +
    '<div class="row-title">' +
    _esc(s.name || '--') +
    '</div>' +
    '<div class="row-subtitle">' +
    _esc(previewText) +
    '</div>' +
    '</div>' +
    '<div class="row-meta num">' +
    _esc(timeText) +
    '</div>' +
    '</div>'
  );
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
  if (el) {
    el.style.display = 'none';
    el.innerHTML = '';
  }
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
      renderStoreList();
    }, 300);
  });
}

// ── Filter Chips ──

function initStoreFilters() {
  var page = document.getElementById('page-stores');
  if (!page) return;

  var healthRow = page.querySelector('[data-filter-row="health"]');
  var chips = healthRow ? healthRow.querySelectorAll('.tab') : [];
  var i;
  for (i = 0; i < chips.length; i++) {
    (function (chip) {
      chip.addEventListener('click', function () {
        var j;
        for (j = 0; j < chips.length; j++) chips[j].classList.remove('active');
        chip.classList.add('active');
        renderStoreList();
      });
    })(chips[i]);
  }

  initStoresAssigneeRow()
    .catch(function () {})
    .finally(function () {
      renderStoreList();
    });
}

function _getActiveHealthFilter() {
  var page = document.getElementById('page-stores');
  if (!page) return null;
  var chips = page.querySelectorAll('[data-filter-row="health"] .tab');
  var i;
  for (i = 0; i < chips.length; i++) {
    if (chips[i].classList.contains('active')) {
      var l = chips[i].getAttribute('data-filter-label');
      return (l === 'crit' || l === 'warn' || l === 'ok') ? l : null;
    }
  }
  return null;
}

function _updateFilterCounts(allStores) {
  function setCt(id, n) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(n);
  }

  if (Array.isArray(allStores)) {
    var total = allStores.length;
    var crit = 0;
    var warn = 0;
    var ok = 0;
    var pi;
    for (pi = 0; pi < allStores.length; pi++) {
      var h = allStores[pi].health_status;
      if (h === 'crit') crit++;
      else if (h === 'warn') warn++;
      else ok++;
    }
    setCt('cntAll', total);
    setCt('cntCritical', crit);
    setCt('cntWarning', warn);
    setCt('cntOk', ok);

    var badge = document.querySelector('#bottom-nav .nav-item[data-page="page-stores"] .nav-badge');
    if (badge) {
      if (crit > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = crit > 9 ? '9+' : String(crit);
      } else {
        badge.style.display = 'none';
      }
    }
    return;
  }

  getStores().then(function (full) {
    _updateFilterCounts(full || []);
  }).catch(function () {});
}

/** Sales / Pulse → Stores: consume one-shot filter pref (sessionStorage). */
function applyStoresNavPreference() {
  var raw = null;
  try {
    raw = sessionStorage.getItem('patrol_stores_nav_pref');
  } catch (_e) {}
  if (!raw) return false;
  try {
    sessionStorage.removeItem('patrol_stores_nav_pref');
  } catch (_e2) {}

  var page = document.getElementById('page-stores');
  if (!page) return false;

  var norm = typeof window.normalizeStoresChipLabel === 'function'
    ? window.normalizeStoresChipLabel(raw)
    : String(raw).trim().toLowerCase() || 'all';

  var chips = page.querySelectorAll('[data-filter-row="health"] .tab');
  var i;
  var matched = false;
  for (i = 0; i < chips.length; i++) {
    chips[i].classList.remove('active');
    if ((chips[i].getAttribute('data-filter-label') || '') === norm) {
      chips[i].classList.add('active');
      matched = true;
    }
  }
  if (!matched && chips.length) {
    chips[0].classList.add('active');
  }

  var searchInput = document.getElementById('store-search');
  var searchVal = searchInput ? searchInput.value.trim() : '';

  var filter = typeof window.storesNavPrefToFilter === 'function'
    ? window.storesNavPrefToFilter(norm, searchVal)
    : (function () {
      var f = {};
      if (norm === 'crit' || norm === 'warn' || norm === 'ok') f.health_status = norm;
      else if (norm === 'prospect') f.store_status = 'prospect';
      else if (norm === 'active') f.store_status = 'active';
      if (searchVal) f.search = searchVal;
      return f;
    })();

  renderStoreList(filter);
  return true;
}
window.applyStoresNavPreference = applyStoresNavPreference;

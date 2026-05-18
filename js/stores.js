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
  var photoHtml = '';
  if (o.photoUrl) {
    photoHtml = '<div class="visit-bubble-photo-wrap"><img class="visit-bubble-photo" src="' + _esc(o.photoUrl) + '" alt="Visit selfie"></div>';
  }
  return '<div class="msg-row">' +
    '<div class="msg-av-small" style="background:' + _esc(o.avatarBg || '#5F6B76') + '">' + _esc(o.initials || '') + '</div>' +
    '<div>' +
      '<div class="bubble in visit-bubble-msg" onclick="showVisitDetail(\'' + _esc(o.visitId || '') + '\')">' +
        _esc(o.outcomeLabel || '') +
        photoHtml +
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

// ── Phase 4.7 Tindahan (priority list + circle filters; mock SAP fields Phase 5+) ──

// Skeleton loading rows (Rule 7: no spinners) — hoisted for Tindahan first paint
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

var _tindahanFiltersWired = false;
var AVATAR_COLORS_TINDAHAN = ['c-gold', 'c-orange', 'c-teal', 'c-blue', 'c-green', 'c-purple', 'c-red'];

function _wireTindahanFiltersOnce() {
  var grid = document.getElementById('tindahanFilterGrid');
  if (!grid || _tindahanFiltersWired) return;
  _tindahanFiltersWired = true;
  grid.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('.tindahan-filter-item');
    if (!btn || !grid.contains(btn)) return;
    var key = btn.getAttribute('data-filter');
    if (window._tindahanActiveFilter === key) {
      window._tindahanActiveFilter = null;
      btn.classList.remove('active');
    } else {
      var items = grid.querySelectorAll('.tindahan-filter-item');
      var i;
      for (i = 0; i < items.length; i++) items[i].classList.remove('active');
      btn.classList.add('active');
      window._tindahanActiveFilter = key;
    }
    renderStoreList();
  });
}

function _collectTindahanApiFilter(passThrough) {
  var f = {};
  if (passThrough) {
    var k;
    for (k in passThrough) {
      if (Object.prototype.hasOwnProperty.call(passThrough, k)) f[k] = passThrough[k];
    }
  }
  var input = document.getElementById('tindahan-store-search');
  var searchVal = input ? input.value.trim() : '';
  if (searchVal) f.search = searchVal;
  return f;
}

function _tAvatarColorForStore(store) {
  var seed = (store.id || store.name || '').toString();
  var hash = 0;
  var i;
  for (i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS_TINDAHAN[Math.abs(hash) % AVATAR_COLORS_TINDAHAN.length];
}

function _tStoreInitials(store) {
  if (store.initials) return String(store.initials).toUpperCase().slice(0, 2);
  var raw = String(store.name || '').replace(/^\[[^\]]*\]\s*/, '').trim();
  var words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return '\u00b7\u00b7';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function _tComputeDaysSinceVisit(store) {
  if (!store.last_visit_at) return null;
  var last = new Date(store.last_visit_at).getTime();
  return Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24));
}

function _tComputePriorityScore(store) {
  var score = 0;
  var reasons = [];
  var daysSinceVisit = _tComputeDaysSinceVisit(store);

  if (daysSinceVisit === null) {
    score += 25;
    reasons.push({ key: 'tindahan.priority_reason_never' });
  } else if (daysSinceVisit > 30) {
    score += 30;
    reasons.push({ key: 'tindahan.priority_reason_visit_idle', days: daysSinceVisit });
  } else if (daysSinceVisit > 14) {
    score += 20;
    reasons.push({ key: 'tindahan.priority_reason_overdue', days: daysSinceVisit });
  } else if (daysSinceVisit > 7) {
    score += 10;
    reasons.push({ key: 'tindahan.priority_reason_overdue', days: daysSinceVisit });
  }

  // Phase 5+: conversion / penetration / merchandizing from HQ (not AR — POS accounts offline in SAP)
  if (store._mock_target_lagging) {
    score += 15;
    reasons.push({ key: 'tindahan.priority_reason_at_risk' });
  }

  if (store.pending_action) {
    score += 15;
  }

  return { score: score, reasons: reasons };
}

function _tNormalizeCircleFilterKey(filterKey) {
  if (filterKey === 'ar') return 'visit_gt30';
  return filterKey;
}

function _tTindahanFilterEmptyLabel(filterKey) {
  var k = _tNormalizeCircleFilterKey(filterKey);
  if (k === 'visit_gt30') return t('tindahan.filter_visit_gt30');
  if (k === 'target') return t('tindahan.filter_target');
  if (k === 'promo') return t('tindahan.filter_promo');
  if (k === 'vip') return t('tindahan.filter_vip');
  return filterKey || '';
}

function _tFilterStoresByCircle(stores, filterKey) {
  if (!filterKey) return stores;
  var fk = _tNormalizeCircleFilterKey(filterKey);
  switch (fk) {
    case 'visit_gt30':
      return stores.filter(function (s) {
        var d = _tComputeDaysSinceVisit(s);
        return d === null || d > 30;
      });
    case 'target':
      return stores.filter(function (s) { return s._mock_target_lagging; });
    case 'promo':
      return stores.filter(function (s) { return s._mock_promo_active; });
    case 'vip':
      return stores.filter(function (s) { return s._mock_vip; });
    default:
      return stores;
  }
}

function _tComputeStatusLine(store) {
  var daysSince = _tComputeDaysSinceVisit(store);
  var todayStr = new Date().toISOString().slice(0, 10);
  var visitedToday = !!(store.last_visit_at && store.last_visit_at.slice(0, 10) === todayStr);

  if (daysSince === null) {
    return {
      text: t('tindahan.status_never_visited'),
      severity: 'warn'
    };
  }
  if (visitedToday) {
    return {
      text: t('tindahan.status_visit_today'),
      severity: 'normal'
    };
  }
  if (daysSince > 30) {
    return {
      text: t('tindahan.status_visit_stale', { days: daysSince }),
      severity: 'danger'
    };
  }
  if (daysSince > 14) {
    return {
      text: t('tindahan.status_visit_stale', { days: daysSince }),
      severity: 'warn'
    };
  }
  return {
    text: t('tindahan.status_last_visit_ok', { days: daysSince }),
    severity: 'normal'
  };
}

function _tFormatTimeAgo(ts) {
  if (!ts) return '';
  var last = new Date(ts).getTime();
  var hours = Math.floor((Date.now() - last) / (1000 * 60 * 60));

  if (hours < 1) return t('tindahan.time_today');
  if (hours < 24) return hours + 'h';

  var days = Math.floor(hours / 24);
  if (days === 1) return t('tindahan.time_yesterday');
  if (days < 7) {
    var d = new Date(ts);
    return t('time.weekday_' + d.getDay() + '_short');
  }

  var d2 = new Date(ts);
  return t('time.month_' + d2.getMonth() + '_short') + ' ' + d2.getDate();
}

function _tNotificationCount(store) {
  return store._mock_notif_count || 0;
}

function _tApplyMockSapData(stores) {
  return stores.map(function (s, i) {
    var seed = (s.id || s.name || '').toString().length + i;
    var o = {};
    var k;
    for (k in s) {
      if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k];
    }
    o._mock_notif_count = (seed % 7 === 0) ? 1 + (seed % 3) : 0;
    o._mock_target_lagging = (seed % 6 === 0);
    o._mock_promo_active = (seed % 8 === 0);
    o._mock_vip = (seed % 10 === 0);
    return o;
  });
}

function _tRestoreTindahanFilterActiveClass() {
  var key = window._tindahanActiveFilter;
  var grid = document.getElementById('tindahanFilterGrid');
  if (!grid || !key) return;
  var btn = grid.querySelector('.tindahan-filter-item[data-filter="' + key + '"]');
  if (btn) btn.classList.add('active');
}

function _tRenderTindahanRow(store, isPriority) {
  var colorClass = _tAvatarColorForStore(store);
  var initials = _tStoreInitials(store);
  var status = _tComputeStatusLine(store);
  var timeAgo = _tFormatTimeAgo(store.last_visit_at);
  var notifCount = _tNotificationCount(store);

  var priorityClass = isPriority ? 'priority' : '';
  var severityClass = '';
  if (status.severity === 'warn' || status.severity === 'danger') {
    severityClass = status.severity;
  }

  var badgeHtml = notifCount > 0
    ? '<div class="tindahan-row-badge">' + _esc(String(notifCount)) + '</div>'
    : '';

  return (
    '<div class="tindahan-row ' + priorityClass + ' ' + severityClass + '" data-store-id="' +
    _escAttr(store.id || '') +
    '" onclick="openStoreDetail(\'' +
    _esc(store.id || '') +
    '\')">' +
    '<div class="tindahan-avatar ' +
    colorClass +
    '">' +
    _esc(initials) +
    '</div>' +
    '<div class="tindahan-row-content">' +
    '<div class="tindahan-row-name">' +
    _esc(store.name || '') +
    '</div>' +
    '<div class="tindahan-row-status ' +
    severityClass +
    '">' +
    status.text +
    '</div>' +
    '</div>' +
    '<div class="tindahan-row-meta">' +
    '<div class="tindahan-row-time ' +
    severityClass +
    '">' +
    _esc(timeAgo) +
    '</div>' +
    badgeHtml +
    '</div>' +
    '</div>'
  );
}

function _tRenderTindahanRows(containerId, stores, isPriority, opts) {
  opts = opts || {};
  var el = document.getElementById(containerId);
  if (!el) return;

  if (!stores.length) {
    if (isPriority) {
      el.innerHTML = '';
      return;
    }
    var emptyKey = opts.emptyKey || 'tindahan.empty_all';
    var icon = opts.icon || '\ud83c\udfea';
    el.innerHTML =
      '<div class="tindahan-empty">' +
      '<div class="tindahan-empty-icon">' +
      icon +
      '</div>' +
      '<div class="tindahan-empty-title">' +
      t(emptyKey) +
      '</div>' +
      '</div>';
    return;
  }

  var html = '';
  var i;
  for (i = 0; i < stores.length; i++) {
    html += _tRenderTindahanRow(stores[i], isPriority);
  }
  el.innerHTML = html;
}

async function renderTindahan(externalFilter) {
  var priEl = document.getElementById('tindahanPriorityList');
  var allEl = document.getElementById('tindahanAllList');
  if (!priEl || !allEl) {
    console.warn('renderTindahan: DOM missing');
    return;
  }

  var tit = document.getElementById('tindahanTitle');
  if (tit) tit.textContent = t('tindahan.page_title');

  var synced = typeof navigator !== 'undefined' && navigator.onLine;
  var pill = document.getElementById('tindahanSyncPill');
  if (pill) {
    pill.textContent = synced ? t('tindahan.sync_synced') : t('tindahan.sync_syncing');
    pill.classList.toggle('syncing', !synced);
  }

  var secPri = document.getElementById('tindahanSectionPriority');
  var secAll = document.getElementById('tindahanSectionAll');
  if (secPri) secPri.textContent = t('tindahan.section_priority');
  if (secAll) secAll.textContent = t('tindahan.section_all');

  var searchInput = document.getElementById('tindahan-store-search');
  if (searchInput) {
    searchInput.setAttribute('placeholder', t('tindahan.search_placeholder'));
    searchInput.setAttribute('aria-label', t('tindahan.search_aria'));
  }

  var hdrNew = document.getElementById('btn-new-store');
  if (hdrNew) hdrNew.setAttribute('aria-label', t('tindahan.aria_new_store'));
  var hdrAv = document.getElementById('stores-avatar-btn');
  if (hdrAv) hdrAv.setAttribute('aria-label', t('tindahan.aria_profile'));

  if (typeof applyI18nLabels === 'function') {
    applyI18nLabels(document.getElementById('page-stores') || document);
  }

  _wireTindahanFiltersOnce();

  var session = typeof getSession === 'function' ? getSession() : null;
  var baseFilter = _collectTindahanApiFilter(externalFilter);

  if (!window.__patrolTindahanHydratedOnce) {
    priEl.innerHTML = _buildStoreSkeleton(4);
    allEl.innerHTML = '';
  }

  try {
    var storesRaw = await getStores(baseFilter || {});
    var assigneeLookup = _repLookupFromMembers(_storesTeamMembers);
    _lastStoresAssigneeLookup = assigneeLookup;

    if (_sessionShowsAssigneeFilters(session)) {
      if (_storesTeamMembers.length > 0) {
        for (var ai = 0; ai < storesRaw.length; ai++) {
          var sid = storesRaw[ai].assigned_tsr;
          if (sid && assigneeLookup[sid]) storesRaw[ai]._assigned_name_cache = assigneeLookup[sid];
        }
        _refreshAssigneeChipStrip(storesRaw);
      }
    }

    var storesScoped = storesRaw;
    if (_sessionShowsAssigneeFilters(session)) {
      storesScoped = _filterStoresByAssignee(storesRaw, _storesAssigneeScope, session);
    }

    _storeCache = storesScoped;

    var storesMocked =
      typeof patrolFeatureEnabled === 'function' && patrolFeatureEnabled('storeSapBadges')
        ? _tApplyMockSapData(storesScoped)
        : storesScoped;

    var activeFilter = window._tindahanActiveFilter || null;
    var filtered = _tFilterStoresByCircle(storesMocked, activeFilter);

    _updateFilterCounts(storesScoped);

    if (!filtered.length) {
      priEl.innerHTML = '';
      if (secPri) secPri.style.display = 'none';
      if (activeFilter) {
        allEl.innerHTML =
          '<div class="tindahan-empty">' +
          '<div class="tindahan-empty-icon">\ud83d\udd0d</div>' +
          '<div class="tindahan-empty-title">' +
          _esc(t('tindahan.empty_filter', { filter: _tTindahanFilterEmptyLabel(activeFilter) })) +
          '</div></div>';
      } else {
        _tRenderTindahanRows('tindahanAllList', [], false, {
          emptyKey: 'tindahan.empty_all',
          icon: '\ud83c\udfea'
        });
      }
      _tRestoreTindahanFilterActiveClass();
      window.__patrolTindahanHydratedOnce = true;
      return;
    }

    _renderStoryCircles(filtered);

    var scored = filtered.map(function (s) {
      var o = {};
      var k;
      for (k in s) {
        if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k];
      }
      o._priority = _tComputePriorityScore(s);
      return o;
    });

    scored.sort(function (a, b) {
      return b._priority.score - a._priority.score;
    });

    var priorityStores = scored.filter(function (s) {
      return s._priority.score >= 25;
    }).slice(0, 3);

    var priorityIds = {};
    var pi;
    for (pi = 0; pi < priorityStores.length; pi++) {
      priorityIds[priorityStores[pi].id] = true;
    }

    var allOtherStores = scored.filter(function (s) {
      return !priorityIds[s.id];
    });

    _tRenderTindahanRows('tindahanPriorityList', priorityStores, true);

    if (secAll) {
      if (!allOtherStores.length && priorityStores.length) {
        var allListEl = document.getElementById('tindahanAllList');
        if (allListEl) allListEl.innerHTML = '';
        secAll.style.display = 'none';
      } else {
        secAll.style.display = '';
        _tRenderTindahanRows('tindahanAllList', allOtherStores, false, {});
      }
    }

    if (secPri) {
      secPri.style.display = priorityStores.length === 0 ? 'none' : '';
    }

    var hintEl = document.getElementById('stores-empty-hint');
    if (hintEl) hintEl.style.display = 'none';

    _tRestoreTindahanFilterActiveClass();
    window.__patrolTindahanHydratedOnce = true;
  } catch (err) {
    priEl.innerHTML =
      '<div class="tindahan-empty"><div class="tindahan-empty-title">' +
      _esc(T.loadError) +
      '</div><small>' +
      _esc(err.message) +
      '</small></div>';
    allEl.innerHTML = '';
    window.__patrolTindahanHydratedOnce = true;
  } finally {
    try {
      var _ap = document.querySelector('.page.active');
      if (_ap && typeof window.syncStoresPaneVisibility === 'function') {
        window.syncStoresPaneVisibility(_ap.id);
      }
    } catch (eSync) {}
  }
}

window.renderTindahan = renderTindahan;

async function renderStoreList(filter) {
  await renderTindahan(filter);
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
  var input = document.getElementById('tindahan-store-search');
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

  var searchInput = document.getElementById('tindahan-store-search');
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

window.addEventListener('patrol:locale-changed', function () {
  var ap = document.querySelector('.page.active');
  if (!ap || ap.id !== 'page-stores') return;
  var tFn = typeof window.t === 'function' ? window.t : function (k) { return k; };
  var si = document.getElementById('tindahan-store-search');
  if (si) {
    si.setAttribute('placeholder', tFn('tindahan.search_placeholder'));
    si.setAttribute('aria-label', tFn('tindahan.search_aria'));
  }
  var nb = document.getElementById('btn-new-store');
  if (nb) nb.setAttribute('aria-label', tFn('tindahan.aria_new_store'));
  var sb = document.getElementById('stores-avatar-btn');
  if (sb) sb.setAttribute('aria-label', tFn('tindahan.aria_profile'));
  if (typeof renderStoreList === 'function') renderStoreList();
});

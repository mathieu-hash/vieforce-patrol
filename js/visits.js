// Visits Module — visit list rendering, search, filters, sync status

// ── Visit Type Colors ──

var _visitTypeColors = {
  mapping: 'var(--blue)',
  regular: 'var(--navy)',
  order: 'var(--green)',
  merch: 'var(--orange)',
  farm: 'var(--gold)'
};

var _VF_AVATAR_CLASSES = ['c-blue', 'c-teal', 'c-green', 'c-purple', 'c-orange', 'c-gold', 'c-red'];

function _vfAvatarClassForSeed(seedStr) {
  var s = String(seedStr || '');
  var hash = 0;
  for (var i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return _VF_AVATAR_CLASSES[Math.abs(hash) % _VF_AVATAR_CLASSES.length];
}

function _vfInitialsFromName(name) {
  var raw = String(name || '').replace(/^\[[^\]]*\]\s*/, '').trim();
  var words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return '\u00b7\u00b7';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ── Store Name Cache ──

var _storeNameMap = {};
var _tsrNameMap = {};

function _visitMatchesOrderFilter(v) {
  if (!v) return false;
  if (v.order_taken === true) return true;
  if (v.visit_type === 'order') return true;
  if (v.order_amount != null && parseFloat(v.order_amount) > 0) return true;
  return false;
}

async function _buildTsrNameMap() {
  try {
    if (typeof getUsers !== 'function') return;
    var users = await getUsers();
    _tsrNameMap = {};
    for (var i = 0; i < (users || []).length; i++) {
      if (users[i] && users[i].id) _tsrNameMap[users[i].id] = users[i].name || '';
    }
  } catch (e) {
    console.error('_buildTsrNameMap:', e);
  }
}

async function _buildStoreNameMap() {
  try {
    var stores = await getStores();
    _storeNameMap = {};
    for (var i = 0; i < stores.length; i++) {
      _storeNameMap[stores[i].id] = stores[i].name;
    }
  } catch (e) {
    console.error('_buildStoreNameMap:', e);
  }
}

// ── Visit List Rendering ──

var _visitCache = [];

function applyVisitPageLabels() {
  if (typeof T === 'undefined') return;
  var title = document.getElementById('visits-page-title');
  if (title && T.visitsPageTitle) title.textContent = T.visitsPageTitle;
  var input = document.getElementById('visit-search');
  if (input && T.visitsSearchPh) {
    input.setAttribute('placeholder', T.visitsSearchPh);
    input.setAttribute('aria-label', T.visitsSearchPh);
  }
  var page = document.getElementById('page-visits');
  if (!page) return;
  var sec = document.getElementById('visits-section-label');
  if (sec && T.visitsSectionRecent) sec.textContent = T.visitsSectionRecent;
  var la = document.getElementById('visit-fl-all');
  var lw = document.getElementById('visit-fl-week');
  var lo = document.getElementById('visit-fl-order');
  var lm = document.getElementById('visit-fl-mapping');
  if (la && T.all) la.textContent = T.all;
  if (lw && T.thisWeek) lw.textContent = T.thisWeek;
  if (lo && T.withOrder) lo.textContent = T.withOrder;
  if (lm) {
    lm.textContent = (T.visitsChipMapping != null && T.visitsChipMapping !== '') ? T.visitsChipMapping : 'Mapping';
  }
  var nv = document.getElementById('btn-visits-new');
  var nvLabel = document.getElementById('btn-visits-new-label');
  var visitCta = (T && (T.logVisit || T.visitsAriaLogVisit)) || 'Log visit';
  if (nv) {
    nv.setAttribute('aria-label', T.visitsAriaLogVisit || 'Log visit');
    nv.setAttribute('title', T.visitsAriaLogVisit || 'Log visit');
  }
  if (nvLabel) nvLabel.textContent = visitCta;
  var chips = page.querySelectorAll('.vf-visits-chips .filter-chip');
  if (chips.length >= 4) {
    if (T.all) chips[0].textContent = T.all;
    if (T.thisWeek) chips[1].textContent = T.thisWeek;
    if (T.withOrder) chips[2].textContent = T.withOrder;
    chips[3].textContent = (T.visitsChipMapping != null && T.visitsChipMapping !== '') ? T.visitsChipMapping : 'Mapping';
  }
}

function _buildVisitSkeleton(count) {
  var html = '';
  for (var si = 0; si < count; si++) {
    html +=
      '<div class="skeleton-row">' +
      '<div class="skeleton skeleton-circle"></div>' +
      '<div style="flex:1;display:flex;flex-direction:column;gap:6px">' +
      '<div class="skeleton skeleton-line w60"></div>' +
      '<div class="skeleton skeleton-line w80"></div>' +
      '<div class="skeleton skeleton-line w40"></div>' +
      '</div></div>';
  }
  return html;
}

async function renderVisitList(filter) {
  var listEl = document.getElementById('visit-list');
  if (!listEl) return;

  var session = getSession();
  if (!session) return;

  applyVisitPageLabels();

  if (!window.__patrolVisitsHydratedOnce) {
    listEl.innerHTML = _buildVisitSkeleton(5);
  }

  var base = _getActiveVisitFilter();
  var f = base;
  if (filter && typeof filter === 'object') {
    f = {};
    for (var k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) f[k] = base[k];
    }
    for (var k2 in filter) {
      if (Object.prototype.hasOwnProperty.call(filter, k2)) f[k2] = filter[k2];
    }
  }

  try {
    updateVisitSubtitle();

    if (Object.keys(_storeNameMap).length === 0) {
      await _buildStoreNameMap();
    }

    var roleLc = (session.role || '').toLowerCase();
    var showTsr =
      roleLc === 'dsm' || roleLc === 'rsm' || roleLc === 'ceo';
    if (showTsr && Object.keys(_tsrNameMap).length === 0) {
      await _buildTsrNameMap();
    }

    var visits;
    if (roleLc === 'tsr' || roleLc === 'champion') {
      visits = await getVisitsByTSR(session.id);
    } else if (roleLc === 'dsm' || roleLc === 'rsm' || roleLc === 'ceo') {
      visits =
        typeof getVisitsForManagerTeam === 'function'
          ? await getVisitsForManagerTeam(session.id)
          : [];
    } else {
      visits = await getVisitsByTSR(session.id);
    }
    _visitCache = visits;

    var filtered = [];

    var weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    for (var i = 0; i < visits.length; i++) {
      var v = visits[i];

      if (f.period === 'week') {
        var visitDate = new Date(v.visited_at);
        if (visitDate < weekAgo) continue;
      }

      if (f.type && f.type !== 'all') {
        if (f.type === 'order') {
          if (!_visitMatchesOrderFilter(v)) continue;
        } else if ((v.visit_type || '') !== f.type) {
          continue;
        }
      }

      if (f.search) {
        var term = f.search.toLowerCase();
        var storeName = (_storeNameMap[v.store_id] || '').toLowerCase();
        var notes = (v.notes || '').toLowerCase();
        var visitType = (v.visit_type || '').toLowerCase();
        var tsrLine = '';
        if (showTsr && v.tsr_id && _tsrNameMap[v.tsr_id]) {
          tsrLine = String(_tsrNameMap[v.tsr_id]).toLowerCase();
        }
        if (
          storeName.indexOf(term) === -1 &&
          notes.indexOf(term) === -1 &&
          visitType.indexOf(term) === -1 &&
          (!tsrLine || tsrLine.indexOf(term) === -1)
        ) {
          continue;
        }
      }

      filtered.push(v);
    }

    updateVisitSubtitle(filtered.length, f.period === 'week');

    if (filtered.length === 0) {
      listEl.innerHTML =
        '<div class="vf-visits-empty">' + _esc(T.noVisits) + '</div>';
      return;
    }

    var html = '';
    for (var j = 0; j < filtered.length; j++) {
      var visit = filtered[j];
      var storeName = _storeNameMap[visit.store_id] || 'Unknown Store';
      var typeColor = _visitTypeColors[visit.visit_type] || 'var(--navy)';
      var relTime = formatRelativeTime(visit.visited_at);
      var truncNotes = visit.notes
        ? visit.notes.length > 120
          ? visit.notes.substring(0, 120) + '\u2026'
          : visit.notes
        : '';
      var visitTypeLabel = (visit.visit_type || '').charAt(0).toUpperCase() + (visit.visit_type || '').slice(1);

      var seedKey = String(visit.store_id || '') + '|' + storeName;
      var avClass = _vfAvatarClassForSeed(seedKey);
      var initials = _vfInitialsFromName(storeName);

      var statusParts = [visitTypeLabel];
      if (showTsr && visit.tsr_id && _tsrNameMap[visit.tsr_id]) {
        statusParts.push((T.visitsByTsr || 'TSR') + ': ' + _tsrNameMap[visit.tsr_id]);
      }
      if (truncNotes) statusParts.push(truncNotes);
      var statusLine = _esc(statusParts.join(' \u00b7 '));

      var sideLines = '';
      if (visit.order_taken && visit.order_amount) {
        var amt = parseFloat(visit.order_amount) || 0;
        sideLines +=
          '<div class="vf-visit-side-amount">\u20b1' +
          amt.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          }) +
          '</div>';
      }
      if (visit.merch_score != null) {
        sideLines +=
          '<div class="vf-visit-side-meta">' +
          visit.merch_score +
          '/5 \u00b7 ' +
          _esc(T.merchScore || 'Merch') +
          '</div>';
      }

      var vid = visit.id != null ? String(visit.id) : '';
      html +=
        '<div class="tindahan-row vf-visit-row" style="--vf-visit-accent:' +
        typeColor +
        '" data-visit-id="' +
        _escAttr(vid) +
        '">' +
        '<div class="tindahan-avatar ' +
        avClass +
        '">' +
        _esc(initials) +
        '</div>' +
        '<div class="tindahan-row-content">' +
        '<div class="tindahan-row-name">' +
        _esc(storeName) +
        '</div>' +
        '<div class="tindahan-row-status">' +
        statusLine +
        '</div>' +
        '</div>' +
        '<div class="tindahan-row-meta">' +
        '<div class="vf-visit-meta-top">' +
        '<span class="tindahan-row-time">' +
        _esc(relTime) +
        '</span>' +
        '<span class="vf-visit-chev" aria-hidden="true">\u203a</span>' +
        '</div>' +
        sideLines +
        '</div>' +
        '</div>';
    }

    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML =
      '<div class="vf-visits-error">' +
      _esc((T.loadError || 'Error') + ': ' + err.message) +
      '</div>';
  } finally {
    window.__patrolVisitsHydratedOnce = true;
  }
}

// ── Subtitle ──

function updateVisitSubtitle(count, isWeek) {
  // CLAUDE.md Rule 7 (no "Loading\u2026" text on TSR-visible surfaces): while count
  // is still loading, render a skeleton chip in the pill rather than text.
  var loading = (typeof count === 'undefined');
  var line = '';
  if (!loading) {
    if (typeof T !== 'undefined' && typeof T.visitsSubtitle === 'function') {
      line = T.visitsSubtitle(count, !!isWeek);
    } else {
      line = count + ' visit' + (count !== 1 ? 's' : '');
      if (isWeek) line += ' this week';
    }
  }
  var el = document.getElementById('visits-subtitle');
  if (el) el.textContent = line;
  var pill = document.getElementById('visits-head-pill');
  if (pill) {
    if (loading) {
      pill.innerHTML =
        '<span class="skeleton skeleton-line w60" style="display:inline-block;height:10px;min-width:60px;vertical-align:middle"></span>';
      pill.setAttribute('aria-busy', 'true');
      pill.classList.remove('syncing');
    } else {
      var online = typeof navigator !== 'undefined' && navigator.onLine;
      pill.textContent = (online ? '\u25cf ' : '\u25cb ') + line;
      pill.removeAttribute('aria-busy');
      pill.classList.toggle('syncing', !online);
    }
  }
}

// ── Search ──

var _visitSearchTimer = null;

function initVisitSearch() {
  var input = document.getElementById('visit-search');
  if (!input) return;

  input.addEventListener('keyup', function () {
    var val = input.value.trim();
    if (_visitSearchTimer) clearTimeout(_visitSearchTimer);
    _visitSearchTimer = setTimeout(function () {
      var filter = _getActiveVisitFilter();
      if (val) filter.search = val;
      renderVisitList(filter);
    }, 300);
  });
}

// ── Filter Chips ──

function initVisitFilters() {
  var page = document.getElementById('page-visits');
  if (!page) return;

  var gridBtns = page.querySelectorAll('#visits-filter-grid .tindahan-filter-item[data-visit-filter]');
  if (gridBtns.length) {
    for (var g = 0; g < gridBtns.length; g++) {
      gridBtns[g].addEventListener('click', function () {
        var self = this;
        for (var j = 0; j < gridBtns.length; j++) {
          gridBtns[j].classList.remove('active');
        }
        self.classList.add('active');

        var searchInput = document.getElementById('visit-search');
        var searchVal = searchInput ? searchInput.value.trim() : '';
        var mode = (self.getAttribute('data-visit-filter') || 'all').toLowerCase();
        var filter = {};
        if (mode === 'week') filter.period = 'week';
        if (mode === 'order') filter.type = 'order';
        if (mode === 'mapping') filter.type = 'mapping';
        if (searchVal) filter.search = searchVal;
        renderVisitList(filter);
      });
    }
    return;
  }

  var chips = page.querySelectorAll('.vf-visits-chips .filter-chip');
  if (!chips.length) chips = page.querySelectorAll('.filter-chip');
  for (var i = 0; i < chips.length; i++) {
    (function (chip, idx) {
      chip.addEventListener('click', function () {
        for (var j = 0; j < chips.length; j++) {
          chips[j].classList.remove('active');
        }
        chip.classList.add('active');
        var searchInput = document.getElementById('visit-search');
        var searchVal = searchInput ? searchInput.value.trim() : '';
        var filter = {};
        if (idx === 1) filter.period = 'week';
        if (idx === 2) filter.type = 'order';
        if (idx === 3) filter.type = 'mapping';
        if (searchVal) filter.search = searchVal;
        renderVisitList(filter);
      });
    })(chips[i], i);
  }
}

function _getActiveVisitFilter() {
  var page = document.getElementById('page-visits');
  if (!page) return {};
  var out = {};
  var activeGrid = page.querySelector('#visits-filter-grid .tindahan-filter-item.active[data-visit-filter]');
  if (activeGrid) {
    var mode = (activeGrid.getAttribute('data-visit-filter') || 'all').toLowerCase();
    if (mode === 'week') out.period = 'week';
    if (mode === 'order') out.type = 'order';
    if (mode === 'mapping') out.type = 'mapping';
  } else {
    var chips = page.querySelectorAll('.vf-visits-chips .filter-chip');
    if (!chips.length) chips = page.querySelectorAll('.filter-chip');
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].classList.contains('active')) {
        if (i === 1) out.period = 'week';
        if (i === 2) out.type = 'order';
        if (i === 3) out.type = 'mapping';
        break;
      }
    }
  }
  var searchInput = document.getElementById('visit-search');
  var sv = searchInput ? searchInput.value.trim() : '';
  if (sv) out.search = sv;
  return out;
}

var _visitRowDelegationBound = false;

/** Open store thread (Messenger-style tap on conversation row). */
function initVisitRowDelegation() {
  if (_visitRowDelegationBound) return;
  var list = document.getElementById('visit-list');
  if (!list) return;
  _visitRowDelegationBound = true;
  list.addEventListener('click', function (ev) {
    var row = ev.target.closest('.vf-visit-row');
    if (!row) return;
    var vid = row.getAttribute('data-visit-id');
    var visit = null;
    for (var i = 0; i < _visitCache.length; i++) {
      if (_visitCache[i] && String(_visitCache[i].id) === vid) {
        visit = _visitCache[i];
        break;
      }
    }
    if (!visit || !visit.store_id) return;
    if (typeof openStoreDetail === 'function') {
      openStoreDetail(visit.store_id);
    }
  });
}

// ── Enhanced Sync Status ──
// State machine guards:
//   _syncInProgress — prevents concurrent / recursive syncPending calls
//   _syncSafetyId   — forces exit from "Syncing..." after 10s if stuck

// W2-SyncTruthBadge: rendering lives in PatrolSyncBadge (js/_util/sync-badge.js).
// This block keeps the trigger/safety-timeout machinery but no longer duplicates
// state-derived class/text painting. Window-scoped flags so the badge module can
// read them via its legacy-synthesis path (until W2-RetryClassify exports a
// proper getSyncState()/event source).
if (typeof window._syncInProgress === 'undefined') window._syncInProgress = false;
var _syncSafetyId = null;

function _clearSyncSafety() {
  if (_syncSafetyId) { clearTimeout(_syncSafetyId); _syncSafetyId = null; }
}

function _refreshGlobalSyncBadge() {
  var bar = document.getElementById('global-sync-bar');
  if (!bar || typeof PatrolSyncBadge === 'undefined') return;
  if (!bar._patrolBadge) {
    bar._patrolBadge = PatrolSyncBadge.mount(bar, { mode: 'bar' });
  } else {
    bar._patrolBadge.refresh();
  }
}

async function enhancedSyncStatus() {
  var homeSyncSection = document.getElementById('home-sync-section');
  var syncNowBtn = document.getElementById('btn-sync-now');

  try {
    var status = await getSyncStatus();
    var pending = status.pending || 0;
    var ejected = status.ejected || 0;

    // Hint cache for PatrolSyncBadge's legacy-synthesis path. Once
    // W2-RetryClassify exports getSyncState()/event source this becomes a
    // no-op (badge reads the real source instead).
    window._patrolSyncCache = {
      pending: pending,
      quarantined: ejected,
      ts: Date.now()
    };

    if (homeSyncSection) homeSyncSection.style.display = pending > 0 ? 'block' : 'none';
    if (syncNowBtn && pending > 0) {
      syncNowBtn.innerHTML = '&#8635; ' + T.syncNow + ' (' + T.pending(pending) + ')';
    }

    // Single render path - badge derives label/class from real state.
    _refreshGlobalSyncBadge();

    // Offline - no auto-sync. Badge paints offline+pending state.
    // Critical Rule-7 invariant: NEVER green when navigator.onLine===false.
    if (!navigator.onLine) {
      _clearSyncSafety();
      window._syncInProgress = false;
      _refreshGlobalSyncBadge();
      return;
    }

    // Online + nothing pending - badge shows green tick. Done.
    if (pending === 0) {
      _clearSyncSafety();
      window._syncInProgress = false;
      _refreshGlobalSyncBadge();
      return;
    }

    // Online + pending - kick off sync. Flip flag BEFORE refresh so the
    // badge paints "Syncing..." not "Sync next attempt".
    if (window._syncInProgress) return;
    window._syncInProgress = true;
    _refreshGlobalSyncBadge();

    // Safety timeout - force-exit syncing state if something hangs.
    _clearSyncSafety();
    _syncSafetyId = setTimeout(function () {
      window._syncInProgress = false;
      _refreshGlobalSyncBadge();
    }, 10000);

    try {
      await syncPending();
    } catch (e) {
      console.warn('syncPending:', e);
    }
    _clearSyncSafety();
    window._syncInProgress = false;

    // Re-paint with post-sync state (pending / quarantined may have changed).
    var after = await getSyncStatus();
    window._patrolSyncCache = {
      pending: after.pending || 0,
      quarantined: after.ejected || 0,
      ts: Date.now()
    };
    _refreshGlobalSyncBadge();
  } catch (e) {
    _clearSyncSafety();
    window._syncInProgress = false;
    _refreshGlobalSyncBadge();
  }
}

// ── Auto Sync ──

async function autoSync() {
  try {
    await syncPending();
  } catch (e) {
    console.error('autoSync:', e);
  }
  // Refresh visit list and KPIs
  renderVisitList(_getActiveVisitFilter());
  if (typeof updateHomeKPIs === 'function') {
    updateHomeKPIs();
  }
  enhancedSyncStatus();
}

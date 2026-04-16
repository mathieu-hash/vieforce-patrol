// Visits Module — visit list rendering, search, filters, sync status

// ── Visit Type Colors ──

var _visitTypeColors = {
  mapping: 'var(--blue)',
  regular: 'var(--navy)',
  order: 'var(--green)',
  merch: 'var(--orange)',
  farm: 'var(--gold)'
};

// ── Store Name Cache ──

var _storeNameMap = {};

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

async function renderVisitList(filter) {
  var listEl = document.getElementById('visit-list');
  if (!listEl) return;

  var session = getSession();
  if (!session) return;

  try {
    // Build store name map if empty
    if (Object.keys(_storeNameMap).length === 0) {
      await _buildStoreNameMap();
    }

    // Fetch all visits for this TSR
    var visits = await getVisitsByTSR(session.id);
    _visitCache = visits;

    // Apply filters
    var f = filter || {};
    var filtered = [];

    var now = new Date();
    var weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    for (var i = 0; i < visits.length; i++) {
      var v = visits[i];

      // Period filter
      if (f.period === 'week') {
        var visitDate = new Date(v.visited_at);
        if (visitDate < weekAgo) continue;
      }

      // Type filter
      if (f.type && f.type !== 'all') {
        if (v.visit_type !== f.type) continue;
      }

      // Search filter
      if (f.search) {
        var term = f.search.toLowerCase();
        var storeName = (_storeNameMap[v.store_id] || '').toLowerCase();
        var notes = (v.notes || '').toLowerCase();
        var visitType = (v.visit_type || '').toLowerCase();
        if (storeName.indexOf(term) === -1 && notes.indexOf(term) === -1 && visitType.indexOf(term) === -1) {
          continue;
        }
      }

      filtered.push(v);
    }

    // Update subtitle
    updateVisitSubtitle(filtered.length, f.period === 'week');

    // Render
    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:15px">' +
        _esc(T.noVisits) + '</div>';
      return;
    }

    var html = '';
    for (var j = 0; j < filtered.length; j++) {
      var visit = filtered[j];
      var storeName = _storeNameMap[visit.store_id] || 'Unknown Store';
      var typeColor = _visitTypeColors[visit.visit_type] || 'var(--navy)';
      var relTime = formatRelativeTime(visit.visited_at);
      var truncNotes = visit.notes ? (visit.notes.length > 60 ? visit.notes.substring(0, 60) + '...' : visit.notes) : '';
      var visitTypeLabel = (visit.visit_type || '').charAt(0).toUpperCase() + (visit.visit_type || '').slice(1);

      html += '<div class="card" style="padding-left:20px">' +
        '<div class="health-bar" style="background:' + typeColor + '"></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:start">' +
          '<div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--navy)">' + _esc(storeName) + '</div>' +
            '<div style="font-size:11px;color:#888;margin-top:2px">' + _esc(visitTypeLabel) + ' \u00b7 ' + relTime + '</div>' +
            (truncNotes ? '<div style="font-size:11px;color:#888;margin-top:2px">' + _esc(truncNotes) + '</div>' : '') +
          '</div>' +
          '<div style="text-align:right">';

      if (visit.order_taken && visit.order_amount) {
        var amt = parseFloat(visit.order_amount) || 0;
        html += '<span style="font-size:16px;font-weight:800;color:var(--green)">\u20b1' +
          amt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '</span>';
      }

      if (visit.merch_score != null) {
        html += '<div style="font-size:11px;color:#888">' + visit.merch_score + '/5 merch</div>';
      }

      html += '</div></div></div>';
    }

    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = '<div class="card" style="text-align:center;padding:20px;color:var(--pink);font-size:13px">' +
      'Error loading visits: ' + _esc(err.message) + '</div>';
  }
}

// ── Subtitle ──

function updateVisitSubtitle(count, isWeek) {
  var el = document.getElementById('visits-subtitle');
  if (!el) return;
  if (typeof count === 'undefined') {
    el.textContent = 'Loading...';
    return;
  }
  var label = count + ' visit' + (count !== 1 ? 's' : '');
  if (isWeek) {
    label += ' this week';
  }
  el.textContent = label;
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

  var chips = page.querySelectorAll('.filter-chip');
  for (var i = 0; i < chips.length; i++) {
    (function (chip, idx) {
      chip.addEventListener('click', function () {
        // Set active
        for (var j = 0; j < chips.length; j++) {
          chips[j].classList.remove('active');
        }
        chip.classList.add('active');

        var searchInput = document.getElementById('visit-search');
        var searchVal = searchInput ? searchInput.value.trim() : '';

        // Determine filter based on chip index:
        // 0=All, 1=This Week, 2=Orders, 3=Mapping
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
  var chips = page.querySelectorAll('.filter-chip');
  for (var i = 0; i < chips.length; i++) {
    if (chips[i].classList.contains('active')) {
      if (i === 1) return { period: 'week' };
      if (i === 2) return { type: 'order' };
      if (i === 3) return { type: 'mapping' };
      return {};
    }
  }
  return {};
}

// ── Enhanced Sync Status ──

async function enhancedSyncStatus() {
  var dot = document.getElementById('sync-dot');
  var label = document.getElementById('sync-label');

  // Global sync bar
  var bar = document.getElementById('global-sync-bar');
  var barIcon = document.getElementById('sync-bar-icon');
  var barText = document.getElementById('sync-bar-text');
  var barBtn = document.getElementById('sync-bar-btn');

  // Home sync button visibility
  var homeSyncSection = document.getElementById('home-sync-section');
  var syncNowBtn = document.getElementById('btn-sync-now');

  try {
    var status = await getSyncStatus();
    var pending = status.pending || 0;

    // Show/hide the home sync button based on pending count
    if (homeSyncSection) {
      homeSyncSection.style.display = pending > 0 ? 'block' : 'none';
    }
    if (syncNowBtn && pending > 0) {
      syncNowBtn.innerHTML = '&#8635; ' + T.syncNow + ' (' + T.pending(pending) + ')';
    }

    if (navigator.onLine) {
      if (pending === 0) {
        // Online + synced — hide bar, show green dot
        if (dot) { dot.className = 'sync-dot online'; }
        if (label) { label.textContent = T.synced; }
        if (bar) { bar.className = 'sync-bar sync-hidden'; }
      } else {
        // Online + pending — show blue syncing bar
        if (dot) { dot.className = 'sync-dot syncing'; }
        if (label) { label.textContent = T.syncing; }
        if (bar) {
          bar.className = 'sync-bar sync-working';
          if (barIcon) barIcon.textContent = '\u21bb';
          if (barText) barText.textContent = T.syncing;
          if (barBtn) barBtn.style.display = 'none';
        }
        // Trigger sync
        syncPending().then(function () {
          enhancedSyncStatus();
        }).catch(function () {
          // Sync failed — show error bar
          if (bar) {
            bar.className = 'sync-bar sync-error';
            if (barIcon) barIcon.textContent = '\u2717';
            if (barText) barText.textContent = T.syncError;
            if (barBtn) { barBtn.style.display = 'inline-block'; barBtn.textContent = T.retry; }
          }
        });
      }
    } else {
      // Offline — show orange bar
      if (dot) { dot.className = 'sync-dot offline'; }
      if (label) { label.textContent = T.offline + (pending > 0 ? ' \u00b7 ' + T.pending(pending) : ''); }
      if (bar) {
        bar.className = 'sync-bar sync-offline';
        if (barIcon) barIcon.textContent = '\u25cb';
        if (barText) barText.textContent = T.offline + (pending > 0 ? ' \u00b7 ' + T.pending(pending) : '');
        if (barBtn) { barBtn.style.display = 'inline-block'; barBtn.textContent = T.syncNow; }
      }
    }
  } catch (e) {
    // Fallback
    if (dot) { dot.className = navigator.onLine ? 'sync-dot online' : 'sync-dot offline'; }
    if (label) { label.textContent = navigator.onLine ? T.synced : T.offline; }
    if (bar) { bar.className = 'sync-bar sync-hidden'; }
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

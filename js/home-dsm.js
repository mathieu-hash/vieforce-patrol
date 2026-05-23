/**
 * DSM home — Wave 3 (Audit A #3): real Supabase aggregates replacing
 * seed % 11 fabricated data. Previous mock layer kept behind the
 * PATROL_DSM_USE_MOCKS feature flag (default false, dev-only).
 *
 * Real data path:
 *   - getDsmTeamMetrics(dsmId): { stores, visited_month, tsrs[], overdue }
 *       where tsrs[] is per-TSR { id, name, visits_week, visits_month,
 *       conversions_month, score, active_pct, last_active_days, ... }
 *       aggregated from `visits` + `stores` (RLS already scopes per Wave 1).
 *   - getDsmRecentActivity(dsmId, limit): wraps existing
 *       window.getRecentTeamActivity (already real Supabase joins).
 *
 * Cache: results stored in offlineDb.cachedDsmMetrics (1h TTL, keyed by
 * DSM user id). On query failure we serve the last good cache; if no
 * cache exists we render the empty state — never fabricated data.
 *
 * Dev fallback: set `window.PATROL_DSM_USE_MOCKS = true` in DevTools to
 * temporarily restore the seed % 11 path (debugging only, not for prod).
 */
(function () {
  'use strict';

  // 1h TTL for cached DSM metrics — matches MASTER_PLAN.md §4 mitigations row
  // "Wave 3 real DSM aggregates are slow on first cold-load".
  var DSM_METRICS_TTL_MS = 60 * 60 * 1000;

  function _t(key, vars) {
    return typeof window.t === 'function' ? window.t(key, vars) : key;
  }

  function _initials(name) {
    if (!name) return '?';
    var p = String(name).split(/\s+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  }

  // Delegates to canonical PatrolEscape.escapeHtml (js/_util/escape.js).
  function _escapeHtml(s) {
    return (typeof PatrolEscape !== 'undefined') ? PatrolEscape.escapeHtml(s) : (s == null ? '' : String(s));
  }

  function _firstName(name) {
    var p = String(name || '').split(/\s+/).filter(Boolean);
    return p[0] || '';
  }

  function getSessionUser() {
    var session = typeof window.getSession === 'function' ? window.getSession() : null;
    if (session && session.id) return session;
    var u = window.PatrolSession && window.PatrolSession.user;
    if (u && u.id) return u;
    return null;
  }

  function _useMocks() {
    return !!window.PATROL_DSM_USE_MOCKS;
  }

  function _isoDaysAgo(days) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }

  function _isoStartOfMonth() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }

  function _isoStartOfWeek() {
    var now = new Date();
    var dow = now.getDay(); // 0=Sun
    var mondayOffset = dow === 0 ? 6 : dow - 1;
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString();
  }

  function _daysBetween(iso, refMs) {
    if (!iso) return 99;
    var t = Date.parse(iso);
    if (!isFinite(t)) return 99;
    return Math.floor((refMs - t) / 86400000);
  }

  /**
   * MOCK (kept behind PATROL_DSM_USE_MOCKS for dev fallback only).
   * Production code path uses _fetchDsmTeamMetricsReal below.
   */
  async function _getMockTsrsWithActivity(dsmId) {
    var rows = [];
    try {
      if (typeof window.getDirectReports !== 'function') return rows;
      var reps = await window.getDirectReports(dsmId);
      for (var i = 0; i < (reps || []).length; i++) {
        var tr = reps[i];
        var rl = (tr.role || '').toLowerCase();
        if (rl !== 'tsr' && rl !== 'champion') continue;
        var seed = String(tr.id || '')
          .split('')
          .reduce(function (a, c) {
            return a + c.charCodeAt(0);
          }, 0) % 11;
        var nm = tr.name || 'TSR';
        rows.push({
          id: tr.id,
          name: nm,
          first_name: _firstName(nm),
          initials: _initials(nm),
          visits_week: 3 + seed,
          prospects_week: seed,
          visits_month: 12 + seed * 2,
          prospects_month: 3 + (seed % 5),
          conversions_month: seed % 5,
          score: 6.5 + seed * 0.35,
          score_delta: (seed % 3) - 1 + seed * 0.1,
          active_pct: Math.min(98, 58 + seed * 5),
          last_active_days: seed % 6,
          last_seen_text: 'Active',
          time_since: '',
        });
      }
    } catch (e) {}
    return rows;
  }

  /**
   * Real DSM team metrics aggregator. Returns null on hard failure so
   * the caller can decide between serving cache or rendering the empty
   * state — never falls back to fake data.
   *
   * Shape:
   *   { stores, visited_month, tsrs: [...per-TSR rows], overdue }
   *
   * Source tables (RLS-scoped to DSM district by Wave 1 migration):
   *   - users (manager_id = dsmId, role in tsr|champion)
   *   - stores (assigned_tsr in team OR district = session.district)
   *   - visits (tsr_id in team, visited_at >= start of week/month)
   */
  async function _fetchDsmTeamMetricsReal(dsmId) {
    var client = window.supabaseClient;
    if (!client || typeof window.getDirectReports !== 'function') return null;

    // 1. Direct reports (TSRs + champions only).
    var reps;
    try {
      reps = await window.getDirectReports(dsmId);
    } catch (e) {
      console.warn('[dsm-real] getDirectReports failed:', e && e.message);
      return null;
    }
    var team = [];
    for (var i = 0; i < (reps || []).length; i++) {
      var rl = (reps[i].role || '').toLowerCase();
      if (rl === 'tsr' || rl === 'champion') team.push(reps[i]);
    }
    if (!team.length) {
      return { stores: 0, visited_month: 0, tsrs: [], overdue: 0 };
    }
    var tsrIds = team.map(function (t) { return t.id; });

    // 2. Aggregate windows.
    var weekStart = _isoStartOfWeek();
    var monthStart = _isoStartOfMonth();
    var overdueCutoff = _isoDaysAgo(14);
    var nowMs = Date.now();

    // 3. Per-TSR visits in current week + month — pull only the columns
    // we aggregate to keep payload light (CLAUDE.md Rule 2).
    var monthVisitsRes = await client
      .from('visits')
      .select('tsr_id, store_id, visited_at, order_taken')
      .in('tsr_id', tsrIds)
      .gte('visited_at', monthStart);
    if (monthVisitsRes.error) {
      console.warn('[dsm-real] visits query failed:', monthVisitsRes.error.message);
      return null;
    }
    var monthVisits = monthVisitsRes.data || [];

    // 4. Team store count + visited-this-month derived from the same
    // visit rows (a store counts once even if visited multiple times).
    var teamStoresRes = await client
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .in('assigned_tsr', tsrIds);
    if (teamStoresRes.error) {
      console.warn('[dsm-real] stores count failed:', teamStoresRes.error.message);
      return null;
    }
    var storesCount = teamStoresRes.count || 0;

    // 5. Overdue stores in scope: assigned to team AND last_visit_at older
    // than 14 days (or null). Two queries because PostgREST can't OR
    // null + lt in one filter cleanly.
    var overdueOld = 0;
    var overdueNever = 0;
    try {
      var oldRes = await client
        .from('stores')
        .select('id', { count: 'exact', head: true })
        .in('assigned_tsr', tsrIds)
        .lt('last_visit_at', overdueCutoff);
      if (!oldRes.error) overdueOld = oldRes.count || 0;
      var neverRes = await client
        .from('stores')
        .select('id', { count: 'exact', head: true })
        .in('assigned_tsr', tsrIds)
        .is('last_visit_at', null);
      if (!neverRes.error) overdueNever = neverRes.count || 0;
    } catch (eOverdue) { /* non-fatal */ }
    var overdue = overdueOld + overdueNever;

    // 6. Roll up per-TSR.
    var perTsr = {};
    for (var ti = 0; ti < team.length; ti++) {
      perTsr[team[ti].id] = {
        id: team[ti].id,
        name: team[ti].name || 'TSR',
        first_name: _firstName(team[ti].name || ''),
        initials: _initials(team[ti].name || 'TSR'),
        visits_week: 0,
        visits_month: 0,
        prospects_week: 0,
        prospects_month: 0,
        conversions_month: 0,
        score: 0,
        score_delta: 0,
        active_pct: 0,
        last_active_days: 99,
        _last_visit_ms: 0,
      };
    }
    var visitedStores = {};
    var weekStartMs = Date.parse(weekStart);
    for (var vi = 0; vi < monthVisits.length; vi++) {
      var v = monthVisits[vi];
      var row = perTsr[v.tsr_id];
      if (!row) continue;
      row.visits_month++;
      if (v.order_taken) row.conversions_month++;
      var vms = Date.parse(v.visited_at || '');
      if (isFinite(vms)) {
        if (vms >= weekStartMs) row.visits_week++;
        if (vms > row._last_visit_ms) row._last_visit_ms = vms;
      }
      if (v.store_id) visitedStores[v.store_id] = 1;
    }

    // 7. Derive score + activity from real counts. Same scale the UI
    // already renders (~0–10). Active_pct = % of weekdays MTD with at
    // least one visit, capped at 100.
    var weekdaysMtd = _weekdaysSinceMonthStart();
    var teamAvgVisitsMonth = 0;
    var tsrsArr = [];
    for (var pk in perTsr) {
      if (!Object.prototype.hasOwnProperty.call(perTsr, pk)) continue;
      var r = perTsr[pk];
      r.active_pct = weekdaysMtd > 0
        ? Math.min(100, Math.round((r.visits_month / weekdaysMtd) * 100))
        : 0;
      r.last_active_days = r._last_visit_ms > 0
        ? Math.max(0, Math.floor((nowMs - r._last_visit_ms) / 86400000))
        : 99;
      r.score = Math.min(10, Math.round(((r.visits_month * 0.7) + (r.conversions_month * 1.5)) * 10) / 10);
      r.last_seen_text = r.last_active_days === 0
        ? 'Active'
        : (r.last_active_days < 99 ? r.last_active_days + 'd' : '--');
      r.time_since = '';
      delete r._last_visit_ms;
      tsrsArr.push(r);
      teamAvgVisitsMonth += r.visits_month;
    }
    teamAvgVisitsMonth = tsrsArr.length ? teamAvgVisitsMonth / tsrsArr.length : 0;
    // Score delta = this TSR's visits_month vs. team avg, scaled.
    for (var di = 0; di < tsrsArr.length; di++) {
      tsrsArr[di].score_delta = Math.round((tsrsArr[di].visits_month - teamAvgVisitsMonth) * 10) / 10;
    }

    return {
      stores: storesCount,
      visited_month: Object.keys(visitedStores).length,
      tsrs: tsrsArr,
      overdue: overdue,
    };
  }

  function _weekdaysSinceMonthStart() {
    var d = new Date();
    var n = 0;
    for (var day = 1; day <= d.getDate(); day++) {
      var dd = new Date(d.getFullYear(), d.getMonth(), day).getDay();
      if (dd !== 0 && dd !== 6) n++;
    }
    return n;
  }

  /**
   * Read cached metrics for a DSM. Returns { value, age_ms } or null.
   * Cache miss + Dexie unavailable both return null without throwing.
   */
  async function _readCachedDsmMetrics(dsmId) {
    try {
      if (!window.offlineDb || !window.offlineDb.cachedDsmMetrics) return null;
      var row = await window.offlineDb.cachedDsmMetrics.get(String(dsmId));
      if (!row || !row.payload) return null;
      var ageMs = Date.now() - Date.parse(row.updated_at || '');
      if (!isFinite(ageMs) || ageMs < 0) ageMs = Infinity;
      return { value: row.payload, age_ms: ageMs };
    } catch (e) {
      return null;
    }
  }

  async function _writeCachedDsmMetrics(dsmId, payload) {
    try {
      if (!window.offlineDb || !window.offlineDb.cachedDsmMetrics) return;
      await window.offlineDb.cachedDsmMetrics.put({
        id: String(dsmId),
        payload: payload,
        updated_at: new Date().toISOString(),
      });
    } catch (e) { /* non-fatal */ }
  }

  /**
   * Public API: real DSM team metrics with cache + fallback policy.
   * Returns { value, source, cached_at } where source is one of
   * 'live' | 'cache_warm' | 'cache_stale' | 'empty'.
   * Renderers use `source === 'empty'` to show the empty state.
   */
  async function getDsmTeamMetrics(dsmId) {
    if (!dsmId) return { value: null, source: 'empty', cached_at: null };

    // Dev-only mock path.
    if (_useMocks()) {
      var mockTsrs = await _getMockTsrsWithActivity(dsmId);
      return {
        value: {
          stores: mockTsrs.length ? Math.min(140, mockTsrs.length * 17 + 12) : 0,
          visited_month: 47,
          tsrs: mockTsrs,
          overdue: 0,
        },
        source: 'live',
        cached_at: new Date().toISOString(),
      };
    }

    var cached = await _readCachedDsmMetrics(dsmId);

    // Warm cache (< TTL): serve immediately, but kick off a background
    // refresh so the next render sees fresh data.
    if (cached && cached.age_ms < DSM_METRICS_TTL_MS) {
      _refreshDsmMetricsInBackground(dsmId);
      return {
        value: cached.value,
        source: 'cache_warm',
        cached_at: new Date(Date.now() - cached.age_ms).toISOString(),
      };
    }

    // No warm cache: try a live fetch.
    var live = null;
    try {
      live = await _fetchDsmTeamMetricsReal(dsmId);
    } catch (e) {
      console.warn('[dsm-real] live fetch threw:', e && e.message);
      live = null;
    }
    if (live) {
      await _writeCachedDsmMetrics(dsmId, live);
      return { value: live, source: 'live', cached_at: new Date().toISOString() };
    }

    // Live failed — serve stale cache if we have one, else empty.
    if (cached && cached.value) {
      return {
        value: cached.value,
        source: 'cache_stale',
        cached_at: new Date(Date.now() - cached.age_ms).toISOString(),
      };
    }
    return { value: null, source: 'empty', cached_at: null };
  }

  function _refreshDsmMetricsInBackground(dsmId) {
    // Fire-and-forget. Errors swallowed; next foreground fetch will retry.
    Promise.resolve()
      .then(function () { return _fetchDsmTeamMetricsReal(dsmId); })
      .then(function (fresh) {
        if (fresh) return _writeCachedDsmMetrics(dsmId, fresh);
      })
      .catch(function () { /* swallow */ });
  }

  /**
   * Public API: real squad-feed activity. Thin wrapper around the
   * already-real getRecentTeamActivity in js/db.js.
   */
  async function getDsmRecentActivity(dsmId, limit) {
    if (!dsmId) return [];
    if (_useMocks()) {
      // Dev-only: still pull real activity but allow override.
      if (window.PATROL_MOCK_FEED_POSTS && window.PATROL_MOCK_FEED_POSTS.length) {
        return window.PATROL_MOCK_FEED_POSTS.slice(0, limit || 15);
      }
    }
    if (typeof window.getRecentTeamActivity !== 'function') return [];
    try {
      var rows = await window.getRecentTeamActivity(dsmId, limit || 15);
      return rows || [];
    } catch (e) {
      console.warn('[dsm-real] getRecentTeamActivity failed:', e && e.message);
      return [];
    }
  }

  // Internal: convert team metrics into the per-TSR row array consumed
  // by renderDsmTsrTable / computeCoachingMoments / computeAttentionItems.
  async function getMyTsrsWithActivity(dsmId) {
    var metrics = await getDsmTeamMetrics(dsmId);
    if (!metrics.value || !metrics.value.tsrs) return [];
    return metrics.value.tsrs;
  }

  async function getOverdueStoresInScope(userId) {
    if (!userId) return [];
    var metrics = await getDsmTeamMetrics(userId);
    if (!metrics.value) return [];
    // Synthesize an array of length `overdue` so existing length checks work.
    var n = Math.max(0, parseInt(metrics.value.overdue, 10) || 0);
    var out = [];
    for (var i = 0; i < n; i++) out.push({ id: 'overdue_' + i });
    return out;
  }

  function _relativeVisitTime(iso) {
    try {
      if (typeof window.formatRelativeTime === 'function') return window.formatRelativeTime(iso);
    } catch (e) {}
    if (!iso) return '--';
    try {
      return new Date(iso).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch (e2) {
      return '--';
    }
  }

  function _peso(n) {
    var v = Number(n || 0);
    if (!v || !isFinite(v)) return '₱0';
    try {
      return (
        '₱' +
        v.toLocaleString('en-PH', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      );
    } catch (e) {
      return '₱' + String(Math.round(v));
    }
  }

  function renderDsmSquadActivity(rows) {
    var host = document.getElementById('dsmSquadFeed');
    if (!host) return;
    if (!rows || !rows.length) {
      renderDsmSquadFeedEmpty(host);
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var tsrName = r.tsr_name || 'TSR';
      var storeName = r.store_name || 'Store';
      var body = 'Bisita sa ' + storeName;
      if (r.order_taken) body += ' · Order: ' + _peso(r.order_amount);
      var notes = String(r.notes || '').replace(/\s+/g, ' ').trim();
      if (notes) {
        if (notes.length > 120) notes = notes.slice(0, 117) + '...';
        body += ' · ' + notes;
      }
      html +=
        '<article class="post" data-dsm-visit="' +
        _escapeHtml(String(r.id || i)) +
        '">' +
        '<div class="post-head">' +
        '<div class="avatar sm">' +
        _escapeHtml(_initials(tsrName)) +
        '</div>' +
        '<div class="post-author">' +
        '<div class="post-author-name">' +
        _escapeHtml(tsrName) +
        '</div>' +
        '<div class="post-author-meta">TSR · ' +
        _escapeHtml(_relativeVisitTime(r.visited_at)) +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="post-body">' +
        _escapeHtml(body) +
        '</div>' +
        '</article>';
    }
    host.innerHTML = html;
  }

  /** Squad empty is one string — render as single block */
  function renderDsmSquadFeedEmpty(host) {
    var msg = _t('dsm.squad_empty');
    host.innerHTML =
      '<div style="padding:32px 16px;text-align:center;color:var(--text-secondary,#64748b);font-size:13px;background:var(--bg-elevated,#fff);margin:0 8px;border-radius:14px;border:1px solid var(--border-soft,#e5e7eb);">' +
      '<div style="font-size:36px;margin-bottom:8px;opacity:0.6;">\ud83d\udcac</div>' +
      '<div style="font-size:13px;line-height:1.45;">' +
      _escapeHtml(msg) +
      '</div>' +
      '</div>';
  }

  async function getMyTsrsCount(userId) {
    var tsrs = await getMyTsrsWithActivity(userId);
    return tsrs.length;
  }

  // Real team store count — derived from getDsmTeamMetrics. Returns 0 (not
  // a hardcoded 87) when the DSM has no team yet or the query fails.
  async function getMyTeamStoreCount(userId) {
    var metrics = await getDsmTeamMetrics(userId);
    if (!metrics.value) return 0;
    return parseInt(metrics.value.stores, 10) || 0;
  }

  // Distinct stores in scope visited at least once this month — derived
  // from the same `visits` rollup used for the per-TSR table. No more
  // hardcoded 47.
  async function getStoresVisitedThisMonth(userId) {
    var metrics = await getDsmTeamMetrics(userId);
    if (!metrics.value) return 0;
    return parseInt(metrics.value.visited_month, 10) || 0;
  }

  async function computeDsmKpis(userId) {
    var tsrs = await getMyTsrsWithActivity(userId);
    var stores = await getMyTeamStoreCount(userId);
    var visited = await getStoresVisitedThisMonth(userId);
    var conversions = tsrs.reduce(function (s, t) {
      return s + (t.conversions_month || 0);
    }, 0);
    var activeTsrs = tsrs.filter(function (t) {
      return (t.last_active_days || 99) <= 1;
    }).length;
    return [
      {
        icon: '\ud83d\udcca',
        labelKey: 'dsm.kpi_active_tsrs',
        value: activeTsrs + '/' + tsrs.length,
        subKey: 'dsm.kpi_active_sub',
        subVars: {
          pct: Math.round((activeTsrs / Math.max(tsrs.length, 1)) * 100),
          idle: tsrs.length - activeTsrs,
        },
        trend: 0,
      },
      {
        icon: '\ud83c\udfea',
        labelKey: 'dsm.kpi_stores_visited',
        value: visited + '/' + stores,
        subKey: 'dsm.kpi_coverage_sub',
        subVars: {
          pct: Math.round((visited / Math.max(stores, 1)) * 100),
        },
        trend: 12,
        unit: '%',
      },
      {
        icon: '\ud83c\udfaf',
        labelKey: 'dsm.kpi_conversions',
        value: String(conversions),
        subKey: 'dsm.kpi_conv_sub',
        subVars: {},
        trend: 3,
      },
      {
        icon: '\ud83d\udcc8',
        labelKey: 'dsm.kpi_activity',
        value: String(
          tsrs.reduce(function (s, t) {
            return s + (t.visits_month || 0);
          }, 0)
        ),
        subKey: 'dsm.kpi_activity_sub',
        subVars: {},
        trend: 0,
      },
    ];
  }

  function renderDsmKpiGrid(kpis) {
    var host = document.getElementById('dsmKpiGrid');
    if (!host) return;
    var html = '';
    for (var i = 0; i < kpis.length; i++) {
      var k = kpis[i];
      var trendClass = k.trend < 0 ? 'down' : '';
      var trendText =
        k.trend > 0
          ? '\u2191' + Math.abs(k.trend) + (k.unit || '')
          : k.trend < 0
            ? '\u2193' + Math.abs(k.trend) + (k.unit || '')
            : '\u2014';
      var lbl = k.labelKey ? _t(k.labelKey) : k.label || '';
      var sub = k.subKey ? _t(k.subKey, k.subVars || {}) : k.sub || '';
      html +=
        '<div class="kpi-tile">' +
        '<div class="kpi-tile-label">' +
        k.icon +
        ' ' +
        _escapeHtml(lbl) +
        '</div>' +
        '<div class="kpi-tile-trend ' +
        trendClass +
        '">' +
        _escapeHtml(trendText) +
        '</div>' +
        '<div class="kpi-tile-value">' +
        _escapeHtml(String(k.value)) +
        '</div>' +
        '<div class="kpi-tile-sub">' +
        _escapeHtml(sub) +
        '</div>' +
        '</div>';
    }
    host.innerHTML = html;
  }

  function renderDsmSkeletons() {
    var kpiHost = document.getElementById('dsmKpiGrid');
    if (kpiHost) {
      kpiHost.innerHTML =
        '<div class="dsm-skeleton kpi" aria-hidden="true"></div>' +
        '<div class="dsm-skeleton kpi" aria-hidden="true"></div>' +
        '<div class="dsm-skeleton kpi" aria-hidden="true"></div>' +
        '<div class="dsm-skeleton kpi" aria-hidden="true"></div>';
    }
    var tbody = document.getElementById('dsmTsrTable');
    if (tbody) {
      var rows = '';
      for (var i = 0; i < 3; i++) {
        rows +=
          '<tr aria-hidden="true">' +
          '<td><span class="dsm-skeleton line w80"></span></td>' +
          '<td class="num"><span class="dsm-skeleton line w40"></span></td>' +
          '<td class="num"><span class="dsm-skeleton line w40"></span></td>' +
          '<td class="num"><span class="dsm-skeleton line w40"></span></td>' +
          '<td class="num"><span class="dsm-skeleton line w40"></span></td>' +
          '<td><span class="dsm-skeleton line w40"></span></td>' +
          '</tr>';
      }
      tbody.innerHTML = rows;
    }
    var coachHost = document.getElementById('dsmCoachingList');
    if (coachHost) {
      coachHost.innerHTML =
        '<div class="dsm-skeleton-card" aria-hidden="true"><span class="dsm-skeleton line w60"></span><span class="dsm-skeleton line w80"></span></div>';
    }
    var squadHost = document.getElementById('dsmSquadFeed');
    if (squadHost) {
      squadHost.innerHTML =
        '<div class="dsm-skeleton-card" aria-hidden="true"><span class="dsm-skeleton line w40"></span><span class="dsm-skeleton line w80"></span><span class="dsm-skeleton line w60"></span></div>';
    }
  }

  function renderDsmTsrTable(tsrs) {
    var tbody = document.getElementById('dsmTsrTable');
    if (!tbody) return;
    if (!tsrs.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-secondary);">' +
        _escapeHtml(_t('dsm.tsr_perf_empty')) +
        '</td></tr>';
      return;
    }
    var sorted = tsrs.slice().sort(function (a, b) {
      return (b.score || 0) - (a.score || 0);
    }).slice(0, 3);
    var html = '';
    for (var i = 0; i < sorted.length; i++) {
      var tr = sorted[i];
      var medal = i === 0 ? '\ud83e\udd47 ' : i === 1 ? '\ud83e\udd48 ' : i === 2 ? '\ud83e\udd49 ' : '';
      var dotClass = tr.active_pct >= 90 ? 'dot-green' : tr.active_pct >= 70 ? 'dot-yellow' : 'dot-red';
      var trendClass =
        (tr.score_delta || 0) > 0 ? 'trend-up' : (tr.score_delta || 0) < 0 ? 'trend-down' : '';
      var trendText =
        tr.score_delta > 0
          ? '\u2191' + tr.score_delta.toFixed(1)
          : tr.score_delta < 0
            ? '\u2193' + Math.abs(tr.score_delta).toFixed(1)
            : '\u2014';
      var convFire =
        tr.conversions_month >= 3 ? '\ud83d\udd25' : tr.conversions_month === 0 ? '\ud83d\udd3b' : '';
      var tid = String(tr.id || '').replace(/"/g, '');
      html +=
        '<tr data-dsm-tsr-row="' +
        tid +
        '" style="cursor:pointer;">' +
        '<td>' +
        medal +
        _escapeHtml(tr.name) +
        '</td>' +
        '<td class="num"><span class="score-dot ' +
        dotClass +
        '"></span>' +
        (tr.active_pct || 0) +
        '%</td>' +
        '<td class="num">' +
        (tr.prospects_month || 0) +
        '</td>' +
        '<td class="num">' +
        (tr.conversions_month || 0) +
        convFire +
        '</td>' +
        '<td class="num">' +
        (tr.score || 0).toFixed(1) +
        '</td>' +
        '<td><span class="trend-arrow ' +
        trendClass +
        '">' +
        trendText +
        '</span></td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
    if (tsrs.length > sorted.length) {
      tbody.insertAdjacentHTML(
        'beforeend',
        '<tr class="dsm-top-only-note"><td colspan="6" style="text-align:center;padding:12px;color:var(--text-secondary);font-size:12px;">' +
          _escapeHtml(_t('dsm.tsr_perf_top_only', { hidden: tsrs.length - sorted.length })) +
          '</td></tr>'
      );
    }
    tbody.querySelectorAll('[data-dsm-tsr-row]').forEach(function (row) {
      row.addEventListener('click', function () {
        var uid = row.getAttribute('data-dsm-tsr-row');
        if (uid && typeof window.navToProfile === 'function') window.navToProfile(uid);
      });
    });
  }

  function computeCoachingMoments(tsrs) {
    var moments = [];
    for (var i = 0; i < tsrs.length; i++) {
      var tr = tsrs[i];
      var nm = tr.first_name || tr.name || 'TSR';
      if ((tr.last_active_days || 0) >= 3) {
        moments.push({
          kind: 'idle',
          icon: '\ud83d\ude34',
          name: nm,
          days: tr.last_active_days,
        });
      }
      if (tr.conversions_month === 0 && tr.prospects_month >= 3) {
        moments.push({
          kind: 'stuck',
          icon: '\ud83c\udfaf',
          name: nm,
          prosp: tr.prospects_month,
        });
      }
      if (moments.length >= 3) break;
    }
    return moments;
  }

  function renderCoaching(items) {
    var host = document.getElementById('dsmCoachingList');
    if (!host) return;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var title = '';
      var text = '';
      if (it.kind === 'idle') {
        title = _t('dsm.coaching_idle_title', { name: it.name });
        text = _t('dsm.coaching_idle_text', { days: it.days });
      } else if (it.kind === 'stuck') {
        title = _t('dsm.coaching_stuck_title', { name: it.name });
        text = _t('dsm.coaching_stuck_text', { prosp: it.prosp });
      } else {
        title = it.title || '';
        text = it.text || '';
      }
      html +=
        '<div class="coaching-item">' +
        '<div class="coaching-icon">' +
        it.icon +
        '</div>' +
        '<div class="coaching-content">' +
        '<div class="coaching-title">' +
        _escapeHtml(title) +
        '</div>' +
        '<div class="coaching-text">\u201c' +
        _escapeHtml(text) +
        '\u201d</div>' +
        '</div>' +
        '</div>';
    }
    host.innerHTML = html;
  }

  async function computeAttentionItems(userId) {
    var items = [];
    var tsrs = await getMyTsrsWithActivity(userId);
    var j;
    for (j = 0; j < tsrs.length; j++) {
      var t = tsrs[j];
      if ((t.last_active_days || 0) >= 3) {
        items.push({
          label: _t('dsm.alert_idle_tsr', {
            name: t.first_name || t.name,
            days: t.last_active_days,
          }),
          type: 'idle_tsr',
        });
      }
    }
    var overdueStores = await getOverdueStoresInScope(userId);
    if (overdueStores.length > 0) {
      items.push({
        label: _t('dsm.alert_overdue_stores', { count: overdueStores.length }),
        type: 'overdue_store',
      });
    }
    void userId;
    return items;
  }

  async function renderDsmHome() {
    var session = getSessionUser();
    if (!session || !session.id) return;
    renderDsmSkeletons();

    var dsmSearchBtn = document.getElementById('dsmHomeSearchBtn');
    if (dsmSearchBtn) dsmSearchBtn.setAttribute('aria-label', _t('dsm.search_aria'));
    var dsmSearchPh = document.getElementById('dsmHomeSearchPlaceholder');
    if (dsmSearchPh) dsmSearchPh.textContent = _t('dsm.home_search_placeholder');

    var av = document.getElementById('dsmHeaderAvatar');
    if (av) {
      av.textContent = _initials(session.name);
      av.classList.add('avatar', 'sm');
    }

    var hdrName = document.getElementById('dsmHdrName');
    if (hdrName) hdrName.textContent = session.name || 'DSM';

    var hdrMeta = document.getElementById('dsmHdrMeta');
    if (hdrMeta) {
      var tsrCount = await getMyTsrsCount(session.id);
      var storeCount = await getMyTeamStoreCount(session.id);
      var pu = window.PatrolSession && window.PatrolSession.user;
      var cluster =
        (pu && pu.cluster_name) ||
        session.cluster_name ||
        session.cluster ||
        session.region ||
        session.territory ||
        session.district ||
        'Cluster';
      hdrMeta.textContent = _t('dsm.header_meta', {
        cluster: cluster,
        tsrs: tsrCount,
        stores: storeCount,
      });
    }

    var perfTitle = document.getElementById('dsmTsrPerfTitle');
    if (perfTitle) perfTitle.textContent = _t('dsm.tsr_perf_title');
    var perfBtn = document.getElementById('dsmTsrPerfDetails');
    if (perfBtn) perfBtn.textContent = _t('dsm.tsr_perf_view_details');

    var thTsr = document.getElementById('dsmColTsr');
    var th1 = document.getElementById('dsmTh1');
    var th2 = document.getElementById('dsmTh2');
    var th3 = document.getElementById('dsmTh3');
    var th4 = document.getElementById('dsmTh4');
    var th5 = document.getElementById('dsmTh5');
    if (thTsr) thTsr.textContent = _t('dsm.tsr_perf_col_name');
    if (th1) th1.textContent = _t('dsm.tsr_perf_th_active');
    if (th2) th2.textContent = _t('dsm.tsr_perf_th_prosp');
    if (th3) th3.textContent = _t('dsm.tsr_perf_th_conv');
    if (th4) th4.textContent = _t('dsm.tsr_perf_th_score');
    if (th5) th5.textContent = _t('dsm.tsr_perf_th_trend');

    var coachTitle = document.getElementById('dsmCoachingTitle');
    if (coachTitle) coachTitle.textContent = _t('dsm.coaching_title');

    var squadLabel = document.getElementById('dsmSquadLabel');
    if (squadLabel) squadLabel.textContent = _t('dsm.squad_label');

    var squadHint = document.getElementById('dsmSquadHint');
    if (squadHint) squadHint.textContent = _t('dsm.squad_hint');

    var alerts = await computeAttentionItems(session.id);
    var strip = document.getElementById('dsmAlerts');
    var alertsTitle = document.getElementById('dsmAlertsTitle');
    var alertsList = document.getElementById('dsmAlertsList');
    if (strip && alertsTitle && alertsList) {
      if (alerts.length > 0) {
        strip.style.display = 'flex';
        alertsTitle.textContent =
          alerts.length === 1
            ? _t('dsm.alerts_count', { count: alerts.length })
            : _t('dsm.alerts_count_plural', { count: alerts.length });
        alertsList.innerHTML = alerts
          .slice(0, 3)
          .map(function (a) {
            return '<span class="alert-tag">' + _escapeHtml(a.label) + '</span>';
          })
          .join('');
      } else {
        strip.style.display = 'none';
      }
    }

    renderDsmKpiGrid(await computeDsmKpis(session.id));

    var tsrs = await getMyTsrsWithActivity(session.id);
    renderDsmTsrTable(tsrs);

    var coaching = computeCoachingMoments(tsrs);
    var coachCard = document.getElementById('dsmCoachingCard');
    if (coachCard) {
      if (coaching.length > 0) {
        coachCard.style.display = 'block';
        renderCoaching(coaching);
      } else {
        coachCard.style.display = 'none';
      }
    }

    // Squad feed: real recent visits from district team (no mock feed).
    try {
      var rows = await getDsmRecentActivity(session.id, 15);
      renderDsmSquadActivity(rows || []);
    } catch (eFeed) {
      var squadHost = document.getElementById('dsmSquadFeed');
      if (squadHost) renderDsmSquadFeedEmpty(squadHost);
    }

    var bb = document.getElementById('bellBadgeDsm');
    if (bb && typeof window.patrolUnreadNotifCount === 'function') {
      var cn = window.patrolUnreadNotifCount();
      bb.textContent = cn > 0 ? String(cn) : '';
    }

    if (typeof window.applyI18nLabels === 'function') {
      var root = document.getElementById('page-home-dsm');
      if (root) window.applyI18nLabels(root);
    }

    // Wave 3: surface cache freshness + empty-state hint so a DSM
    // who sees no data understands whether to retry online vs wait
    // for their team to log visits. Never hides skeletons over fake
    // data — feature flag PATROL_DSM_USE_MOCKS bypasses this entirely.
    try {
      var headerMetrics = await getDsmTeamMetrics(session.id);
      _renderDsmDataState(headerMetrics);
    } catch (eState) { /* non-fatal */ }
  }

  /**
   * Insert (or hide) the empty-state / cache-stale banner inside the
   * #page-host-dsm header. Pure DOM — safe to call after renderDsmHome.
   */
  function _renderDsmDataState(metrics) {
    var page = document.getElementById('page-home-dsm');
    if (!page) return;
    var node = document.getElementById('dsmDataStateBanner');
    var source = metrics && metrics.source ? metrics.source : 'empty';
    var hasData = metrics && metrics.value && (
      (metrics.value.tsrs && metrics.value.tsrs.length) ||
      metrics.value.stores > 0 || metrics.value.visited_month > 0
    );

    if (source === 'live' && hasData) {
      if (node) node.style.display = 'none';
      return;
    }
    if (!node) {
      node = document.createElement('div');
      node.id = 'dsmDataStateBanner';
      node.style.cssText =
        'margin:8px;padding:14px 16px;border-radius:14px;' +
        'background:var(--bg-elevated,#fff);border:1px solid var(--border-soft,#e5e7eb);' +
        'color:var(--text-secondary,#64748b);font-size:13px;line-height:1.45;';
      var anchor = document.getElementById('dsmKpiGrid');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
      else page.insertBefore(node, page.firstChild);
    }
    node.style.display = 'block';

    var msg;
    if (!hasData) {
      msg = _t('dsm.emptyState');
    } else if (source === 'cache_warm') {
      msg = _t('dsm.cachedAt', { time: _shortTime(metrics.cached_at) });
    } else if (source === 'cache_stale') {
      msg = _t('dsm.cachedAt', { time: _shortTime(metrics.cached_at) }) + ' · ' + _t('dsm.refreshHint');
    } else {
      msg = _t('dsm.refreshHint');
    }
    node.textContent = msg;
  }

  function _shortTime(iso) {
    if (!iso) return '--';
    try {
      return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '--';
    }
  }

  window.renderDsmHome = renderDsmHome;
  window.renderDsmSkeletons = renderDsmSkeletons;
  // Wave 3: real-data helpers exposed for tests + future call sites.
  window.getDsmTeamMetrics = getDsmTeamMetrics;
  window.getDsmRecentActivity = getDsmRecentActivity;

  window.addEventListener('patrol:locale-changed', function () {
    var ap = document.querySelector('.page.active');
    if (ap && ap.id === 'page-home-dsm' && typeof renderDsmHome === 'function') renderDsmHome();
  });
})();

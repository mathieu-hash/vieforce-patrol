/**
 * DSM home — Phase 4.6 v3: action dashboard + read-only squad visit feed + i18n.
 * Action layout: docs/elite-dashboards-mockup.html · Social: PatrolElite patterns.
 */
(function () {
  'use strict';

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

  async function getMyTsrsWithActivity(dsmId) {
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

  async function getOverdueStoresInScope() {
    return [];
  }

  async function getFeedPostsForUserIds(ids) {
    var feed =
      typeof window.PATROL_MOCK_FEED_POSTS === 'object' && window.PATROL_MOCK_FEED_POSTS
        ? window.PATROL_MOCK_FEED_POSTS
        : [];
    if (ids == null) return feed.slice(0, 25);
    var idset = {};
    for (var i = 0; i < ids.length; i++) idset[String(ids[i])] = true;
    var out = [];
    for (var j = 0; j < feed.length; j++) {
      var p = feed[j];
      var uid = p.user && p.user.id != null ? String(p.user.id) : '';
      if (!uid || !idset[uid]) continue;
      if (p.type === 'achievement') continue;
      out.push(p);
    }
    return out;
  }

  function renderDsmPostSnippet(post, idx) {
    var body = String(post.body || '').replace(/<[^>]+>/g, ' ');
    if (body.length > 220) body = body.slice(0, 217) + '\u2026';
    var nm = post.user && post.user.name ? post.user.name : 'Squad';
    return (
      '<article class="post" data-dsm-post="' +
      idx +
      '">' +
      '<div class="post-head">' +
      '<div class="avatar sm">' +
      _escapeHtml(_initials(nm)) +
      '</div>' +
      '<div class="post-author">' +
      '<div class="post-author-name">' +
      _escapeHtml(nm) +
      '</div>' +
      '<div class="post-author-meta">' +
      _escapeHtml(post.user && (post.user.roleLabel || post.user.role || '')) +
      ' \u00b7 ' +
      _escapeHtml(post.time || '') +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="post-body">' +
      _escapeHtml(body) +
      '</div>' +
      '</article>'
    );
  }

  function renderDsmSquadFeed(posts) {
    var host = document.getElementById('dsmSquadFeed');
    if (!host) return;
    if (!posts.length) {
      renderDsmSquadFeedEmpty(host);
      return;
    }
    var h = '';
    for (var i = 0; i < posts.length; i++) {
      h += renderDsmPostSnippet(posts[i], i);
    }
    host.innerHTML = h;
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

  async function getMyTeamStoreCount(userId) {
    var tsrs = await getMyTsrsWithActivity(userId);
    if (!tsrs.length) return 87;
    return Math.min(140, tsrs.length * 17 + 12);
  }

  async function getStoresVisitedThisMonth(userId) {
    void userId;
    return 47;
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

    try {
      var rows = [];
      if (typeof window.getRecentTeamActivity === 'function') {
        rows = await window.getRecentTeamActivity(session.id, 15);
      }
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
  }

  window.renderDsmHome = renderDsmHome;
  window.renderDsmSkeletons = renderDsmSkeletons;

  window.addEventListener('patrol:locale-changed', function () {
    var ap = document.querySelector('.page.active');
    if (ap && ap.id === 'page-home-dsm' && typeof renderDsmHome === 'function') renderDsmHome();
  });
})();

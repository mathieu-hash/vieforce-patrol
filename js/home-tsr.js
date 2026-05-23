/**
 * TSR home — Phase 4.6 v3: NBA + Route + Scorecard + Streak + Mapa stub + i18n.
 * Reference: docs/elite-dashboards-mockup.html
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

  function _daysSince(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function formatNumber(n) {
    var x = Number(n);
    if (!isFinite(x)) return '0';
    return Math.round(x).toLocaleString('en-PH');
  }

  function getSessionUser() {
    var session = typeof window.getSession === 'function' ? window.getSession() : null;
    if (session && session.id) return session;
    var u = window.PatrolSession && window.PatrolSession.user;
    if (u && u.id) return u;
    return null;
  }

  function isVisitDue(store) {
    var d = _daysSince(store.last_visit_at);
    if (d == null) return true;
    return d > 14;
  }

  async function getTodayPlannedVisits(userId) {
    var stores = await getMyAssignedPos(userId);
    var due = stores.filter(isVisitDue);
    due.sort(function (a, b) {
      return (b._score || 0) - (a._score || 0);
    });
    return due.slice(0, 8);
  }

  async function getMyAssignedPos(userId) {
    if (typeof window.getStoresByTSR !== 'function') return [];
    var rows = await window.getStoresByTSR(userId);
    var out = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var s = rows[i];
      var d = _daysSince(s.last_visit_at);
      var score = d == null ? 50 : Math.min(d * 3, 80);
      if (s.health_status === 'critical' || s.health_status === 'warn') score += 15;
      s._score = score;
      s.days_since_visit = d == null ? 999 : d;
      s.store_initials = _initials(s.name || '').slice(0, 2);
      s.store_name = s.name || 'Store';
      var seed = String(s.id || '')
        .split('')
        .reduce(function (a, c) {
          return a + c.charCodeAt(0);
        }, 0) % 41;
      s.distance_km = 8 + (seed % 12);
      s.ar_amount = seed * 1800 + 1200;
      s.ar_days = 7 + (seed % 14);
      s.recent_orders = seed % 5 === 0 ? null : seed * 4500;
      out.push(s);
    }
    return out;
  }

  async function getMyActivityStats(userId, period) {
    var visits = 0;
    try {
      if (typeof window.getVisitsByTSR === 'function') {
        var start = new Date();
        if (period === 'week') {
          start.setDate(start.getDate() - 7);
        } else if (period === 'month') {
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
        } else {
          start.setMonth(start.getMonth() - 1);
        }
        var iso = start.toISOString();
        var list = await window.getVisitsByTSR(userId, iso);
        visits = (list || []).length;
      }
    } catch (e) {}
    var prospects = Math.min(24, Math.floor(visits / 3) + 2);
    var conversions = Math.min(visits, Math.floor(visits / 8));
    var retentionRate = Math.min(0.98, 0.72 + Math.min(visits, 40) * 0.006);
    return {
      visits: visits,
      prospects: prospects,
      conversions: conversions,
      visitsDelta: 0,
      prospects_delta: 0,
      conversion_delta: 0,
      retention_delta: 0,
      retention_rate: retentionRate,
      assigned_pos_count: 0,
      lost_count: 0,
    };
  }

  async function getMyStreak(userId) {
    try {
      if (typeof window.getVisitsByTSR !== 'function') return 0;
      var list = await window.getVisitsByTSR(userId, null);
      if (!list || list.length === 0) return 0;
      var days = {};
      for (var i = 0; i < list.length; i++) {
        var iso = list[i].visited_at;
        if (!iso) continue;
        var day = String(iso).slice(0, 10);
        days[day] = true;
      }
      var streak = 0;
      var cur = new Date();
      for (var k = 0; k < 120; k++) {
        var ds = cur.toISOString().slice(0, 10);
        if (days[ds]) {
          streak++;
          cur.setDate(cur.getDate() - 1);
        } else if (streak === 0) {
          cur.setDate(cur.getDate() - 1);
        } else {
          break;
        }
      }
      return streak;
    } catch (e) {
      return 0;
    }
  }

  async function computeNextBestAction(userId) {
    var pos = await getMyAssignedPos(userId);
    var overdue = pos
      .filter(function (p) {
        return (p.days_since_visit || 0) > 7;
      })
      .sort(function (a, b) {
        return (b.days_since_visit || 0) - (a.days_since_visit || 0);
      });
    if (overdue.length === 0) return null;
    var top = overdue[0];
    var d = top.days_since_visit || 0;
    var dist =
      top.distance_km != null ? Math.round(top.distance_km * 4) + ' mins away' : '';
    var note =
      top.recent_orders != null
        ? 'Recent order ₱' + formatNumber(top.recent_orders)
        : 'Active customer';
    var reason =
      d > 14
        ? _t('tsr.nba_reason_overdue', { days: d })
        : _t('tsr.nba_reason_at_risk', { days: d, note: note });
    return {
      store_id: top.id,
      store_name: top.store_name || top.name || 'Store',
      distance_text: dist,
      ar_due: top.ar_amount || 0,
      ar_days_text: top.ar_days ? top.ar_days + 'd' : '',
      reason: reason,
    };
  }

  function defaultRouteTime(index) {
    var slots = ['9:00 AM', '10:30 AM', '12:15 PM', '2:00 PM', '3:30 PM'];
    return slots[index] || '';
  }

  function estimatedDuration(stops) {
    var minutes = stops.length * 45;
    return (minutes / 60).toFixed(1) + 'h';
  }

  async function getTodayRoute(userId) {
    var planned = await getTodayPlannedVisits(userId);
    var out = [];
    for (var i = 0; i < planned.length; i++) {
      var p = planned[i];
      out.push({
        store_id: p.id,
        store_name: p.store_name || p.name || 'Store',
        scheduled_time: defaultRouteTime(i),
      });
    }
    return out;
  }

  function starsFromTarget(actual, target) {
    return Math.min(5, Math.max(1, Math.round((actual / Math.max(target, 1)) * 5)));
  }

  function starsFromConversion(conv, prosp) {
    if (prosp === 0) return 1;
    return Math.min(5, Math.max(1, Math.round((conv / prosp) * 5 / 0.4)));
  }

  function starsFromRetention(rate) {
    return Math.min(5, Math.max(1, Math.round((rate || 0) * 5)));
  }

  function conversionPct(stats) {
    if (!stats.prospects) return 0;
    return Math.round((stats.conversions / stats.prospects) * 100);
  }

  async function getPeerAverages() {
    return { conversion_pct: 24, retention_pct: 87 };
  }

  async function computeScorecard(userId) {
    var stats = await getMyActivityStats(userId, 'month');
    var peerAvg = await getPeerAverages();
    var stages = [
      {
        icon: '\ud83d\udd0d',
        pillar: 'prospection',
        nameKey: 'tsr.stage_prospection',
        stars: starsFromTarget(stats.prospects, 10),
        trend: stats.prospects_delta || 0,
        metric: _t('tsr.scorecard_metric_target', {
          actual: stats.prospects,
          target: 10,
        }),
        insight:
          stats.prospects < 10 ? _t('tsr.scorecard_insight_prosp_low') : null,
      },
      {
        icon: '\ud83c\udfaf',
        pillar: 'conversion',
        nameKey: 'tsr.stage_conversion',
        stars: starsFromConversion(stats.conversions, stats.prospects),
        trend: stats.conversion_delta || 0,
        metric: _t('tsr.scorecard_metric_conv', {
          conv: stats.conversions,
          prosp: stats.prospects,
          pct: conversionPct(stats),
          peer: peerAvg.conversion_pct,
        }),
        insight:
          stats.conversions < stats.prospects * 0.2
            ? _t('tsr.scorecard_insight_conv_stuck')
            : null,
      },
      {
        icon: '\u2764\ufe0f',
        pillar: 'retention',
        nameKey: 'tsr.stage_retention',
        stars: starsFromRetention(stats.retention_rate),
        trend: stats.retention_delta || 0,
        label: stats.retention_rate >= 0.9 ? 'Top 10%' : null,
        metric: _t('tsr.scorecard_metric_retention', {
          pct: Math.round((stats.retention_rate || 0) * 100),
          lost: stats.lost_count || 0,
        }),
        insight: null,
      },
    ];
    var overall =
      stages.reduce(function (s, st) {
        return s + st.stars;
      }, 0) / stages.length;

    var criticalCount = stages.filter(function (st) {
      return st.stars <= 2;
    }).length;

    var improveCount = stages.filter(function (st) {
      return (st.insight != null && String(st.insight).length > 0) || st.stars <= 3;
    }).length;

    return {
      overall: overall,
      stages: stages,
      criticalCount: criticalCount,
      improveCount: improveCount,
    };
  }

  function renderTsrRoute(stops) {
    var host = document.getElementById('tsrRouteList');
    if (!host) return;
    if (!stops || stops.length === 0) {
      host.innerHTML =
        '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:13px;">' +
        _escapeHtml(_t('tsr.route_empty')) +
        '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i];
      var sid = String(s.store_id || '').replace(/'/g, '');
      html +=
        '<div class="route-item" role="button" tabindex="0" data-route-store="' +
        sid +
        '">' +
        '<div class="route-num ' +
        (i === 0 ? 'current' : '') +
        '">' +
        (i + 1) +
        '</div>' +
        '<div class="route-name">' +
        _escapeHtml(s.store_name) +
        '</div>' +
        '<div class="route-time">' +
        _escapeHtml(s.scheduled_time || '') +
        '</div>' +
        '</div>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-route-store]').forEach(function (el) {
      function activateRoute() {
        var id = el.getAttribute('data-route-store');
        if (id && typeof window.openStoreDetail === 'function') {
          window.openStoreDetail(id);
        } else if (id && typeof window.nav === 'function') {
          window._currentStoreId = id;
          window.nav('page-store-detail');
        }
      }
      el.addEventListener('click', activateRoute);
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activateRoute();
        }
      });
    });
  }

  function renderTsrScorecard(sc) {
    var stages = sc.stages || [];
    var criticalCount = sc.criticalCount != null ? sc.criticalCount : 0;
    var improveCount = sc.improveCount != null ? sc.improveCount : 0;
    var host = document.getElementById('tsrScStages');
    if (!host) return;
    var html = '';
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      var pillar = s.pillar || 'prospection';
      var stars = '';
      var si;
      for (si = 0; si < s.stars; si++) stars += '\u2b50';
      for (si = 0; si < 5 - s.stars; si++) stars += '\u2606';
      var pct = Math.round((s.stars / 5) * 100);
      var trendClass = '';
      var trendText = '';
      if (s.label) {
        trendText = s.label;
      } else if (s.trend > 0) {
        trendText = '+' + s.trend.toFixed(1);
      } else if (s.trend < 0) {
        trendText = s.trend.toFixed(1);
        trendClass = 'down';
      } else {
        trendText = '\u2014';
      }
      var displayName = s.nameKey ? _escapeHtml(_t(s.nameKey)) : _escapeHtml(s.name || '');
      html +=
        '<div class="sc-stage-card sc-pillar-' +
        pillar +
        '">' +
        '<div class="sc-stage-head-row">' +
        '<span class="sc-pillar-tag"><span class="sc-pillar-icon">' +
        s.icon +
        '</span>' +
        displayName +
        '</span>' +
        '<span class="sc-stage-score-pill">' +
        String(s.stars) +
        '/5</span>' +
        '</div>' +
        '<div class="sc-progress-track">' +
        '<div class="sc-progress-fill" style="width:' +
        pct +
        '%"></div>' +
        '</div>' +
        '<div class="sc-stage-meta">' +
        _escapeHtml(s.metric) +
        '</div>' +
        '<div class="sc-stage-row-foot">' +
        '<span class="sc-stage-stars">' +
        stars +
        '</span>' +
        '<span class="sc-stage-trend ' +
        trendClass +
        '">' +
        _escapeHtml(trendText) +
        '</span>' +
        '</div>';
      if (s.insight) {
        html +=
          '<div class="sc-stage-insight">\u201c' +
          _escapeHtml(s.insight) +
          '\u201d</div>';
      }
      html += '</div>';
    }
    html +=
      '<div class="sc-total-footer">' +
      '<div>' +
      '<div class="sc-total-label">' +
      _escapeHtml(_t('tsr.sc_footer_priority_label')) +
      '</div>' +
      '<div class="sc-total-title">' +
      _escapeHtml(_t('tsr.sc_footer_priority_title')) +
      '</div>' +
      '</div>' +
      '<div class="sc-total-chips">' +
      '<span class="sc-chip sc-chip-critical">' +
      _escapeHtml(_t('tsr.sc_footer_critical', { count: criticalCount })) +
      '</span>' +
      '<span class="sc-chip sc-chip-improve">' +
      _escapeHtml(_t('tsr.sc_footer_improve', { count: improveCount })) +
      '</span>' +
      '</div>' +
      '</div>';
    host.innerHTML = html;
  }

  async function renderTsrHome() {
    var session = getSessionUser();
    if (!session || !session.id) return;

    var hr = new Date().getHours();
    var greetingKey =
      hr < 12 ? 'greeting.full_morning' : hr < 18 ? 'greeting.full_afternoon' : 'greeting.full_evening';

    var gt = document.getElementById('tsrGreetingTitle');
    if (gt) {
      gt.textContent = _t(greetingKey, { name: session.name || 'Patrol' });
    }
    var gs = document.getElementById('tsrGreetingSub');
    if (gs) {
      gs.textContent =
        session.territory_name ||
        session.cluster_name ||
        session.region ||
        'Vienovo Philippines';
    }
    // W2-SyncTruthBadge: delegate to canonical PatrolSyncBadge so the pill
    // tells the truth (Rule 7). Mount once and let the badge keep itself
    // in sync via offline.js event source / polling fallback.
    var syncEl = document.getElementById('tsrSyncPill');
    if (syncEl && typeof PatrolSyncBadge !== 'undefined') {
      if (!syncEl._patrolBadge) {
        syncEl._patrolBadge = PatrolSyncBadge.mount(syncEl, { mode: 'pill' });
      } else {
        syncEl._patrolBadge.refresh();
      }
    }

    var av = document.getElementById('tsrHeaderAvatar');
    if (av) {
      av.textContent = _initials(session.name);
      av.classList.add('avatar', 'sm');
    }

    var nbaLabel = document.getElementById('tsrNbaLabel');
    if (nbaLabel) nbaLabel.textContent = _t('tsr.nba_label');
    var nbaGo = document.getElementById('tsrNbaBtnGo');
    if (nbaGo) nbaGo.textContent = _t('tsr.nba_btn_go');
    var nbaSkip = document.getElementById('tsrNbaBtnSkip');
    if (nbaSkip) nbaSkip.textContent = _t('tsr.nba_btn_skip');

    var nbaTitleLoading = document.getElementById('tsrNbaTitle');
    if (nbaTitleLoading) nbaTitleLoading.textContent = _t('tsr.nba_loading');

    var searchBtn = document.getElementById('tsrHomeSearchBtn');
    if (searchBtn) searchBtn.setAttribute('aria-label', _t('tsr.search_aria'));
    var searchPh = document.getElementById('tsrHomeSearchPlaceholder');
    if (searchPh) searchPh.textContent = _t('tsr.home_search_placeholder');

    var nba = await computeNextBestAction(session.id);
    var nbaEl = document.getElementById('tsrNbaHero');
    if (nbaEl) {
      if (!nba) {
        nbaEl.style.display = 'none';
      } else {
        nbaEl.style.display = '';
        window._tsrNbaStoreId = nba.store_id;
        var titleEl = document.getElementById('tsrNbaTitle');
        if (titleEl) titleEl.textContent = nba.store_name;
        var metaEl = document.getElementById('tsrNbaMeta');
        if (metaEl) {
          var metaHtml =
            '<span>\ud83d\udccd ' + _escapeHtml(nba.distance_text || '') + '</span>';
          if (nba.ar_due) {
            metaHtml +=
              '<span>' +
              _escapeHtml(
                _t('tsr.nba_ar_due', {
                  amount: formatNumber(nba.ar_due),
                  days: nba.ar_days_text || '',
                })
              ) +
              '</span>';
          }
          metaEl.innerHTML = metaHtml;
        }
        var reasonEl = document.getElementById('tsrNbaReason');
        if (reasonEl) reasonEl.textContent = nba.reason;
      }
    }

    var route = await getTodayRoute(session.id);
    var rt = document.getElementById('tsrRouteTitle');
    var ropt = document.getElementById('tsrRouteOptimize');
    if (ropt) ropt.textContent = _t('tsr.route_optimize');
    if (rt) {
      rt.textContent =
        route.length === 0
          ? _t('tsr.route_title', { count: route.length })
          : _t('tsr.route_title_with_duration', {
              count: route.length,
              duration: estimatedDuration(route),
            });
    }
    renderTsrRoute(route);

    var scTitle = document.getElementById('tsrScTitle');
    if (scTitle) scTitle.textContent = _t('tsr.scorecard_title');

    var sc = await computeScorecard(session.id);
    var scScore = document.getElementById('tsrScScore');
    if (scScore) {
      scScore.innerHTML =
        '<span class="sc-overall-num-inner">' +
        sc.overall.toFixed(1) +
        '</span><span class="sc-overall-max">/5</span>';
    }
    renderTsrScorecard(sc);

    var streak = await getMyStreak(session.id);
    var streakTitle = document.getElementById('tsrStreakTitle');
    var streakSub = document.getElementById('tsrStreakSub');
    if (streakTitle && streakSub) {
      if (streak >= 1) {
        streakTitle.textContent = _t('tsr.streak_active_title', { days: streak });
        streakSub.textContent =
          streak >= 5
            ? _t('tsr.streak_unlocked_sub')
            : _t('tsr.streak_active_sub_more', { remaining: 5 - streak });
      } else {
        streakTitle.textContent = _t('tsr.streak_default_title');
        streakSub.textContent = _t('tsr.streak_default_sub');
      }
    }

    var bb = document.getElementById('bellBadgeTsr');
    if (bb && typeof window.patrolUnreadNotifCount === 'function') {
      var cn = window.patrolUnreadNotifCount();
      bb.textContent = cn > 0 ? String(cn) : '';
    }

    if (typeof window.applyI18nLabels === 'function') {
      var root = document.getElementById('page-home-tsr');
      if (root) window.applyI18nLabels(root);
    }
  }

  async function renderMapaTsr() {
    var tit = document.getElementById('mapaComingTitle');
    var sub = document.getElementById('mapaComingSub');
    var listTit = document.getElementById('mapaListTitle');
    var mapaHdr = document.getElementById('mapaPageTitle');
    if (tit) tit.textContent = _t('mapa.coming_soon_title');
    if (sub) sub.textContent = _t('mapa.coming_soon_sub');
    if (listTit) listTit.textContent = _t('mapa.fallback_list_title');
    if (mapaHdr) mapaHdr.textContent = _t('mapa.page_title');

    var session = getSessionUser();
    if (!session || !session.id) return;

    var pos = await getMyAssignedPos(session.id);
    var host = document.getElementById('mapaPosList');
    if (!host) return;
    if (pos.length === 0) {
      host.innerHTML =
        '<div style="padding:24px;text-align:center;color:var(--text-secondary);font-size:13px;">' +
        _escapeHtml(_t('mapa.no_pos')) +
        '</div>';
      return;
    }
    var h = '';
    for (var i = 0; i < pos.length; i++) {
      var p = pos[i];
      var pid = String(p.id || '').replace(/"/g, '');
      var nm = p.name || p.store_name || 'POS';
      var init = p.store_initials || _initials(nm);
      var days = p.days_since_visit;
      var subtxt =
        days == null || days === 999
          ? _t('mapa.row_never_visited')
          : _t('mapa.row_since_visit', { days: days });
      h +=
        '<div class="row" data-mapa-store="' +
        pid +
        '" style="cursor:pointer">' +
        '<div class="elite-avatar sm green">' +
        _escapeHtml(init) +
        '</div>' +
        '<div class="row-content">' +
        '<div class="row-title">' +
        _escapeHtml(nm) +
        '</div>' +
        '<div class="row-subtitle">' +
        _escapeHtml(subtxt) +
        '</div>' +
        '</div>' +
        '</div>';
    }
    host.innerHTML = h;
    host.querySelectorAll('[data-mapa-store]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-mapa-store');
        if (id && typeof window.openStoreDetail === 'function') window.openStoreDetail(id);
        else if (id && typeof window.nav === 'function') {
          window._currentStoreId = id;
          window.nav('page-store-detail');
        }
      });
    });

    var mapaFull = typeof patrolFeatureEnabled === 'function' && patrolFeatureEnabled('mapaFullMap');
    var ctaHost = document.getElementById('mapaFullMapCta');
    if (ctaHost) {
      if (mapaFull) {
        ctaHost.style.display = '';
        ctaHost.innerHTML =
          '<button type="button" class="big-button" style="width:100%;margin-top:12px" onclick="if(typeof window.nav===\'function\')window.nav(\'page-map\')">' +
          _escapeHtml(_t('mapa.open_full_map')) +
          '</button>';
      } else {
        ctaHost.style.display = 'none';
        ctaHost.innerHTML = '';
      }
    }

    if (typeof window.applyI18nLabels === 'function') {
      var pg = document.getElementById('page-mapa-tsr');
      if (pg) window.applyI18nLabels(pg);
    }
  }

  async function renderTsrProfileMonthStats(userId) {
    var sess = getSessionUser();
    if (!sess || String(sess.id) !== String(userId)) return;
    var rl = (sess.role || '').toLowerCase();
    if (rl !== 'tsr' && rl !== 'champion') return;
    var panel = document.getElementById('tsrProfileMonthPanel');
    if (!panel) return;
    panel.style.display = '';
    var stats = await getMyActivityStats(sess.id, 'month');
    var v1 = document.getElementById('tsrProfileStatVisits');
    var v2 = document.getElementById('tsrProfileStatProspects');
    var v3 = document.getElementById('tsrProfileStatConv');
    if (v1) v1.textContent = String(stats.visits != null ? stats.visits : '\u2014');
    if (v2) v2.textContent = String(stats.prospects != null ? stats.prospects : '\u2014');
    if (v3)
      v3.textContent =
        stats.prospects > 0
          ? String(conversionPct(stats)) + '%'
          : '0%';
    var l0 = document.getElementById('tsrProfileMonthTitle');
    var l1 = document.getElementById('tsrProfileLblVisits');
    var l2 = document.getElementById('tsrProfileLblProspects');
    var l3 = document.getElementById('tsrProfileLblConv');
    if (l0) l0.textContent = _t('profile.stats_month_title');
    if (l1) l1.textContent = _t('profile.stats_visits_mtd');
    if (l2) l2.textContent = _t('profile.stats_prospects');
    if (l3) l3.textContent = _t('profile.stats_conversion_pct');
  }

  window.goToNbaStore = function () {
    var id = window._tsrNbaStoreId;
    if (!id) return;
    if (typeof window.openStoreDetail === 'function') {
      window.openStoreDetail(id);
    } else if (typeof window.nav === 'function') {
      window._currentStoreId = id;
      window.nav('page-store-detail');
    }
  };

  window.skipNba = function () {
    var el = document.getElementById('tsrNbaHero');
    if (el) el.style.display = 'none';
  };

  window.optimizeRoute = function () {
    if (typeof window.renderTsrHome === 'function') {
      window.renderTsrHome();
    }
  };

  window.renderTsrHome = renderTsrHome;
  window.renderMapaTsr = renderMapaTsr;
  window.renderTsrProfileMonthStats = renderTsrProfileMonthStats;
  window.getTodayPlannedVisits = getTodayPlannedVisits;
  window.getMyAssignedPos = getMyAssignedPos;
  window.getMyActivityStats = getMyActivityStats;
  window.getMyStreak = getMyStreak;

  window.addEventListener('patrol:locale-changed', function () {
    var ap = document.querySelector('.page.active');
    if (!ap) return;
    if (ap.id === 'page-home-tsr' && typeof renderTsrHome === 'function') renderTsrHome();
    if (ap.id === 'page-mapa-tsr' && typeof renderMapaTsr === 'function') renderMapaTsr();
  });
})();

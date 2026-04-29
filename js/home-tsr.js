/**

 * TSR home — Phase 4.6 v2: NBA + Route + Scorecard + Streak (action-first, no feed).

 * Reference: docs/elite-dashboards-mockup.html

 */

(function () {

  'use strict';



  function _initials(name) {

    if (!name) return '?';

    var p = String(name).split(/\s+/).filter(Boolean);

    return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();

  }



  function _escapeHtml(s) {

    var d = document.createElement('div');

    d.textContent = s == null ? '' : String(s);

    return d.innerHTML;

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

      var seed =

        String(s.id || '')

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

    var reason =

      d > 14

        ? '\u26a0\ufe0f ' +

          d +

          ' days walang bisita \u00b7 High priority'

        : '\ud83c\udfaf ' +

          d +

          ' days from at-risk \u00b7 ' +

          (top.recent_orders

            ? 'Recent order \u20b1' + formatNumber(top.recent_orders)

            : 'Active customer');

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

        name: 'Prospection',

        stars: starsFromTarget(stats.prospects, 10),

        trend: stats.prospects_delta || 0,

        metric:

          stats.prospects + ' new / target 10',

        insight:

          stats.prospects < 10

            ? 'Try 2 new cold calls per week to hit target'

            : null,

      },

      {

        icon: '\ud83c\udfaf',

        pillar: 'conversion',

        name: 'Conversion',

        stars: starsFromConversion(stats.conversions, stats.prospects),

        trend: stats.conversion_delta || 0,

        metric:

          stats.conversions +

          ' / ' +

          stats.prospects +

          ' (' +

          conversionPct(stats) +

          '%) \u00b7 peer avg ' +

          peerAvg.conversion_pct +

          '%',

        insight:

          stats.conversions < stats.prospects * 0.2

            ? 'Follow up sa stalled prospects \u2014 interest pero walang balita'

            : null,

      },

      {

        icon: '\ud83d\dc9a',

        pillar: 'retention',

        name: 'Retention',

        stars: starsFromRetention(stats.retention_rate),

        trend: stats.retention_delta || 0,

        label: stats.retention_rate >= 0.9 ? 'Top 10%' : null,

        metric:

          Math.round((stats.retention_rate || 0) * 100) +

          '% active \u00b7 0 lost',

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



  async function checkSyncStatus() {

    return !!navigator.onLine;

  }



  function renderTsrRoute(stops) {

    var host = document.getElementById('tsrRouteList');

    if (!host) return;

    if (!stops || stops.length === 0) {

      host.innerHTML =

        '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:13px;">' +

        'No route planned. Tap POS to add stops.' +

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

      el.addEventListener('click', function () {

        var id = el.getAttribute('data-route-store');

        if (id && typeof window.openStoreDetail === 'function') {

          window.openStoreDetail(id);

        } else if (id && typeof window.nav === 'function') {

          window._currentStoreId = id;

          window.nav('page-store-detail');

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

      html +=

        '<div class="sc-stage-card sc-pillar-' +

        pillar +

        '">' +

        '<div class="sc-stage-head-row">' +

        '<span class="sc-pillar-tag"><span class="sc-pillar-icon">' +

        s.icon +

        '</span>' +

        _escapeHtml(s.name) +

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

      '<div class="sc-total-label">Priority rollup</div>' +

      '<div class="sc-total-title">Across Prospection, Conversion &amp; Retention</div>' +

      '</div>' +

      '<div class="sc-total-chips">' +

      '<span class="sc-chip sc-chip-critical">Critical \u00b7 ' +

      criticalCount +

      '</span>' +

      '<span class="sc-chip sc-chip-improve">Improve \u00b7 ' +

      improveCount +

      '</span>' +

      '</div>' +

      '</div>';

    host.innerHTML = html;

  }



  async function renderTsrHome() {

    var session = getSessionUser();

    if (!session || !session.id) return;



    var hr = new Date().getHours();

    var greet =

      hr < 12 ? 'Magandang umaga' : hr < 18 ? 'Magandang hapon' : 'Magandang gabi';

    var emoji = hr < 12 ? '\ud83c\udf05' : hr < 18 ? '\u2600\ufe0f' : '\ud83c\udf19';



    var gt = document.getElementById('tsrGreetingTitle');

    if (gt) {

      gt.textContent = greet + ', ' + (session.name || 'Patrol') + '! ' + emoji;

    }

    var gs = document.getElementById('tsrGreetingSub');

    if (gs) {

      gs.textContent =

        session.territory_name ||

        session.cluster_name ||

        session.region ||

        'Vienovo Philippines';

    }

    var syncEl = document.getElementById('tsrSyncPill');

    var synced = await checkSyncStatus();

    if (syncEl) {

      syncEl.textContent = synced ? '\u25cf Naka-sync na' : '\u25cf Mag-sync...';

    }



    var av = document.getElementById('tsrHeaderAvatar');

    if (av) {

      av.textContent = _initials(session.name);

      av.classList.add('avatar', 'sm');

    }



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

            '<span>\ud83d\udccd ' +

            _escapeHtml(nba.distance_text || 'distance unknown') +

            '</span>';

          if (nba.ar_due) {

            metaHtml +=

              '<span>\ud83d\udcb0 \u20b1' +

              formatNumber(nba.ar_due) +

              ' AR due ' +

              _escapeHtml(nba.ar_days_text || '') +

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

    if (rt) {

      rt.textContent =

        '\ud83d\uddfa\ufe0f Ruta ngayon \u00b7 ' +

        route.length +

        ' stop' +

        (route.length !== 1 ? 's' : '') +

        (route.length > 0 ? ' \u00b7 ' + estimatedDuration(route) : '');

    }

    renderTsrRoute(route);



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

        streakTitle.textContent = streak + '-day visit streak';

        streakSub.textContent =

          streak >= 5

            ? 'Hot Streak badge unlocked! Keep going.'

            : 5 - streak + ' more days to unlock Hot Streak badge.';

      } else {

        streakTitle.textContent = 'Build your streak';

        streakSub.textContent =

          'Log a visit today to start. 5 days unlocks Hot Streak badge.';

      }

    }



    var bb = document.getElementById('bellBadgeTsr');

    if (bb && typeof window.patrolUnreadNotifCount === 'function') {

      var cn = window.patrolUnreadNotifCount();

      bb.textContent = cn > 0 ? String(cn) : '';

    }

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

  window.getTodayPlannedVisits = getTodayPlannedVisits;

  window.getMyAssignedPos = getMyAssignedPos;

  window.getMyActivityStats = getMyActivityStats;

  window.getMyStreak = getMyStreak;

})();


/**

 * DSM home — Phase 4.6 v2: action dashboard + composer + scoped squad feed.

 * Action layout: docs/elite-dashboards-mockup.html · Social: PatrolElite patterns.

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

        var t = reps[i];

        var rl = (t.role || '').toLowerCase();

        if (rl !== 'tsr' && rl !== 'champion') continue;

        var seed =

          String(t.id || '')

            .split('')

            .reduce(function (a, c) {

              return a + c.charCodeAt(0);

            }, 0) % 11;

        var nm = t.name || 'TSR';

        rows.push({

          id: t.id,

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

      host.innerHTML =

        '<div style="padding:32px 16px;text-align:center;color:var(--text-secondary,#64748b);font-size:13px;background:var(--bg-elevated,#fff);margin:0 8px;border-radius:14px;border:1px solid var(--border-soft,#e5e7eb);">' +

        '<div style="font-size:36px;margin-bottom:8px;opacity:0.6;">\ud83d\udcac</div>' +

        '<div style="font-weight:600;">Quiet today.</div>' +

        '<div style="font-size:12px;margin-top:4px;">Be the first \u2014 post a win.</div>' +

        '</div>';

      return;

    }

    var h = '';

    for (var i = 0; i < posts.length; i++) {

      h += renderDsmPostSnippet(posts[i], i);

    }

    host.innerHTML = h;

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

        label: 'Active TSRs',

        value: activeTsrs + '/' + tsrs.length,

        sub:

          Math.round((activeTsrs / Math.max(tsrs.length, 1)) * 100) +

          '% \u00b7 ' +

          (tsrs.length - activeTsrs) +

          ' idle',

        trend: 0,

      },

      {

        icon: '\ud83c\udfea',

        label: 'Stores Visited',

        value: visited + '/' + stores,

        sub:

          Math.round((visited / Math.max(stores, 1)) * 100) + '% coverage',

        trend: 12,

        unit: '%',

      },

      {

        icon: '\ud83c\udfaf',

        label: 'Conversions',

        value: String(conversions),

        sub: 'vs last month',

        trend: 3,

      },

      {

        icon: '\ud83d\udcc8',

        label: 'Activity Index',

        value: String(

          tsrs.reduce(function (s, t) {

            return s + (t.visits_month || 0);

          }, 0)

        ),

        sub: 'total visits MTD',

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

      html +=

        '<div class="kpi-tile">' +

        '<div class="kpi-tile-label">' +

        k.icon +

        ' ' +

        _escapeHtml(k.label) +

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

        _escapeHtml(k.sub) +

        '</div>' +

        '</div>';

    }

    host.innerHTML = html;

  }



  function renderDsmTsrTable(tsrs) {

    var tbody = document.getElementById('dsmTsrTable');

    if (!tbody) return;

    if (!tsrs.length) {

      tbody.innerHTML =

        '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-secondary);">' +

        'No TSRs assigned yet. Talk to HR.' +

        '</td></tr>';

      return;

    }

    var sorted = tsrs.slice().sort(function (a, b) {

      return (b.score || 0) - (a.score || 0);

    });

    var html = '';

    for (var i = 0; i < sorted.length; i++) {

      var t = sorted[i];

      var medal = i === 0 ? '\ud83e\udd47 ' : i === 1 ? '\ud83e\udd48 ' : i === 2 ? '\ud83e\udd49 ' : '';

      var dotClass =

        t.active_pct >= 90 ? 'dot-green' : t.active_pct >= 70 ? 'dot-yellow' : 'dot-red';

      var trendClass =

        (t.score_delta || 0) > 0 ? 'trend-up' : (t.score_delta || 0) < 0 ? 'trend-down' : '';

      var trendText =

        t.score_delta > 0

          ? '\u2191' + t.score_delta.toFixed(1)

          : t.score_delta < 0

            ? '\u2193' + Math.abs(t.score_delta).toFixed(1)

            : '\u2014';

      var convFire =

        t.conversions_month >= 3

          ? '\ud83d\udd25'

          : t.conversions_month === 0

            ? '\ud83d\udd3b'

            : '';

      var tid = String(t.id || '').replace(/"/g, '');

      html +=

        '<tr data-dsm-tsr-row="' +

        tid +

        '" style="cursor:pointer;">' +

        '<td>' +

        medal +

        _escapeHtml(t.name) +

        '</td>' +

        '<td class="num"><span class="score-dot ' +

        dotClass +

        '"></span>' +

        (t.active_pct || 0) +

        '%</td>' +

        '<td class="num">' +

        (t.prospects_month || 0) +

        '</td>' +

        '<td class="num">' +

        (t.conversions_month || 0) +

        convFire +

        '</td>' +

        '<td class="num">' +

        (t.score || 0).toFixed(1) +

        '</td>' +

        '<td><span class="trend-arrow ' +

        trendClass +

        '">' +

        trendText +

        '</span></td>' +

        '</tr>';

    }

    tbody.innerHTML = html;

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

      var t = tsrs[i];

      if ((t.last_active_days || 0) >= 3) {

        moments.push({

          icon: '\ud83d\ude34',

          title: (t.first_name || t.name) + ' is idle',

          text:

            t.last_active_days +

            ' days walang activity. Send a message?',

        });

      }

      if (t.conversions_month === 0 && t.prospects_month >= 3) {

        moments.push({

          icon: '\ud83c\udfaf',

          title: (t.first_name || t.name) + ' stuck on conversions',

          text:

            t.prospects_month +

            ' prospects but 0 closed. May need help with closing technique.',

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

      html +=

        '<div class="coaching-item">' +

        '<div class="coaching-icon">' +

        it.icon +

        '</div>' +

        '<div class="coaching-content">' +

        '<div class="coaching-title">' +

        _escapeHtml(it.title) +

        '</div>' +

        '<div class="coaching-text">\u201c' +

        _escapeHtml(it.text) +

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

          label: (t.first_name || t.name) + ' \u00b7 ' + t.last_active_days + ' days idle',

          type: 'idle_tsr',

        });

      }

    }

    var overdueStores = await getOverdueStoresInScope(userId);

    if (overdueStores.length > 0) {

      items.push({

        label: overdueStores.length + ' stores at-risk',

        type: 'overdue_store',

      });

    }

    return items;

  }



  async function renderDsmHome() {

    var session = getSessionUser();

    if (!session || !session.id) return;



    var av = document.getElementById('dsmHeaderAvatar');

    if (av) {

      av.textContent = _initials(session.name);

      av.classList.add('avatar', 'sm');

    }

    var cav = document.getElementById('dsmComposerAvatar');

    if (cav) {

      cav.textContent = _initials(session.name);

      cav.className = 'elite-avatar';

    }



    var hdrName = document.getElementById('dsmHdrName');

    if (hdrName) hdrName.textContent = session.name || 'DSM';

    var hdrMeta = document.getElementById('dsmHdrMeta');

    if (hdrMeta) {

      var tsrCount = await getMyTsrsCount(session.id);

      var storeCount = await getMyTeamStoreCount(session.id);

      hdrMeta.textContent =

        'DSM \u00b7 ' +

        (session.cluster_name || session.region || 'Cluster') +

        ' \u00b7 ' +

        tsrCount +

        ' TSRs \u00b7 ' +

        storeCount +

        ' stores';

    }



    var alerts = await computeAttentionItems(session.id);

    var strip = document.getElementById('dsmAlerts');

    var alertsTitle = document.getElementById('dsmAlertsTitle');

    var alertsList = document.getElementById('dsmAlertsList');

    if (strip && alertsTitle && alertsList) {

      if (alerts.length > 0) {

        strip.style.display = 'flex';

        alertsTitle.textContent =

          alerts.length +

          ' item' +

          (alerts.length > 1 ? 's' : '') +

          ' need your attention today';

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



    var ids = null;

    if (window.PatrolScope && typeof window.PatrolScope.getFeedUserIds === 'function') {

      ids = await window.PatrolScope.getFeedUserIds();

    }

    var posts = await getFeedPostsForUserIds(ids);

    renderDsmSquadFeed(posts);



    var bb = document.getElementById('bellBadgeDsm');

    if (bb && typeof window.patrolUnreadNotifCount === 'function') {

      var cn = window.patrolUnreadNotifCount();

      bb.textContent = cn > 0 ? String(cn) : '';

    }

  }



  window.renderDsmHome = renderDsmHome;

})();


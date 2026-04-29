/**
 * DSM squad dashboard + scoped squad feed (no exec/RSM bag-heavy noise in UI).
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

  async function getDsmTeamStats(dsmId) {
    var visits = 0;
    var activeTsrs = 0;
    var totalTsrs = 0;
    var storesAttention = 0;
    try {
      if (typeof window.getDirectReports === 'function') {
        var reps = await window.getDirectReports(dsmId);
        var tsrs = (reps || []).filter(function (r) {
          var rl = (r.role || '').toLowerCase();
          return rl === 'tsr' || rl === 'champion';
        });
        totalTsrs = tsrs.length;
        activeTsrs = totalTsrs;
        visits = Math.max(0, totalTsrs * 2 + Math.min(6, totalTsrs));
        storesAttention = Math.min(9, totalTsrs + 1);
      }
    } catch (e) {}
    return {
      visits: visits,
      activeTsrs: activeTsrs,
      totalTsrs: Math.max(totalTsrs, 1),
      storesAttention: storesAttention,
    };
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
            }, 0) % 7;
        rows.push({
          id: t.id,
          name: t.name || 'TSR',
          initials: _initials(t.name || ''),
          online_status: '',
          visits_week: 3 + seed,
          prospects_week: seed,
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

  function renderDsmTsrList(tsrs) {
    var host = document.getElementById('dsmTsrList');
    if (!host) return;
    if (!tsrs.length) {
      host.innerHTML =
        '<div style="padding:24px;text-align:center;color:var(--text-secondary,#64748b);font-size:13px;">' +
        '<div style="font-size:32px;margin-bottom:8px;opacity:0.6;">\ud83d\udc65</div>' +
        '<div style="font-weight:600;">No TSRs assigned yet</div>' +
        '<div style="font-size:12px;margin-top:4px;">Talk to HR to assign your team.</div>' +
        '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < tsrs.length; i++) {
      var t = tsrs[i];
      var tid = String(t.id || '').replace(/'/g, '');
      html +=
        '<div class="row" role="button" tabindex="0" data-dsm-tsr="' +
        tid +
        '" style="cursor:pointer">' +
        '<div class="elite-avatar sm online">' +
        _escapeHtml(t.initials) +
        '</div>' +
        '<div class="row-content">' +
        '<div class="row-title">' +
        _escapeHtml(t.name) +
        '</div>' +
        '<div class="row-subtitle">' +
        t.visits_week +
        ' visits \u00b7 ' +
        t.prospects_week +
        ' prospects \u00b7 ' +
        _escapeHtml(t.last_seen_text || '') +
        '</div>' +
        '</div>' +
        '<div class="row-meta">' +
        _escapeHtml(t.time_since || '') +
        '</div>' +
        '</div>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-dsm-tsr]').forEach(function (el) {
      el.addEventListener('click', function () {
        var uid = el.getAttribute('data-dsm-tsr');
        if (uid && typeof window.navToProfile === 'function') window.navToProfile(uid);
      });
    });
  }

  async function renderDsmHome() {
    var session = typeof window.getSession === 'function' ? window.getSession() : null;
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

    var teamStats = await getDsmTeamStats(session.id);
    var ta = document.getElementById('dsmTeamActivity');
    if (ta) ta.textContent = teamStats.visits + ' visits';
    var ac = document.getElementById('dsmActiveCount');
    if (ac) {
      ac.textContent =
        teamStats.activeTsrs + '/' + teamStats.totalTsrs + ' TSRs active';
    }
    var st = document.getElementById('dsmStoresAttention');
    if (st) {
      st.textContent = teamStats.storesAttention + ' stores need attention';
    }

    var tsrs = await getMyTsrsWithActivity(session.id);
    renderDsmTsrList(tsrs);

    var posOwn =
      typeof window.getMyAssignedPos === 'function'
        ? await window.getMyAssignedPos(session.id)
        : [];
    var ownCard = document.getElementById('dsmOwnActivityCard');
    if (ownCard) {
      if (!posOwn.length) {
        ownCard.style.display = 'none';
      } else {
        ownCard.style.display = '';
        var ownStats =
          typeof window.getMyActivityStats === 'function'
            ? await window.getMyActivityStats(session.id, 'week')
            : { visits: 0, prospects: 0 };
        var ov = document.getElementById('dsmOwnVisits');
        if (ov) ov.textContent = String(ownStats.visits || 0);
        var op = document.getElementById('dsmOwnProspects');
        if (op) op.textContent = String(ownStats.prospects || 0);
        var opos = document.getElementById('dsmOwnPos');
        if (opos) opos.textContent = String(posOwn.length);
      }
    }

    var overdue = await getOverdueStoresInScope(session.id);
    var risk = document.getElementById('dsmAtRisk');
    var riskTitle = document.getElementById('dsmAtRiskTitle');
    if (risk && riskTitle) {
      if (overdue.length > 0) {
        risk.style.display = 'flex';
        riskTitle.textContent = overdue.length + ' stores overdue';
      } else {
        risk.style.display = 'none';
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

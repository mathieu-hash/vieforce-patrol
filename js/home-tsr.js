/**
 * TSR task-list home — visits / POS / activity only (no bags, no team feed).
 */
(function () {
  'use strict';

  function _initials(name) {
    if (!name) return '?';
    var p = String(name).split(/\s+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  }

  function _daysSince(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function _formatLastVisit(iso) {
    var d = _daysSince(iso);
    if (d == null) return 'Never visited';
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    return d + ' days ago';
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
      s.store_initials = _initials(s.name || '').slice(0, 2);
      s.store_name = s.name || 'Store';
      s.last_visit_text = _formatLastVisit(s.last_visit_at);
      out.push(s);
    }
    return out;
  }

  async function getMyActivityStats(userId, period) {
    var visits = 0;
    var prospects = 0;
    try {
      if (typeof window.getVisitsByTSR === 'function') {
        var start = new Date();
        if (period === 'week') {
          start.setDate(start.getDate() - 7);
        } else {
          start.setMonth(start.getMonth() - 1);
        }
        var iso = start.toISOString();
        var list = await window.getVisitsByTSR(userId, iso);
        visits = (list || []).length;
      }
    } catch (e) {}
    prospects = Math.min(12, Math.floor(visits / 4));
    var conversions = Math.min(visits, Math.floor(visits / 10));
    return {
      visits: visits,
      prospects: prospects,
      conversions: conversions,
      visitsDelta: 0,
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

  function renderTsrTodayList(visits) {
    var host = document.getElementById('tsrTodayList');
    if (!host) return;

    if (!visits || visits.length === 0) {
      host.innerHTML =
        '<div style="padding:24px;text-align:center;color:var(--text-secondary,#64748b);font-size:13px;">' +
        '<div style="font-size:32px;margin-bottom:8px;opacity:0.6;">&#10003;</div>' +
        '<div style="font-weight:600;">All clear today.</div>' +
        '<div style="font-size:12px;margin-top:4px;">Tap POS to plan a route.</div>' +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < visits.length; i++) {
      var v = visits[i];
      var sid = String(v.id || '').replace(/'/g, '');
      html +=
        '<div class="list-row phase4-list-row" role="button" tabindex="0" data-tsr-store="' +
        sid +
        '">' +
        '<div class="avatar-tiny">' +
        _initials(v.store_name) +
        '</div>' +
        '<div class="list-row-main">' +
        '<div class="list-row-title">' +
        String(v.store_name || '') +
        '</div>' +
        '<div class="list-row-sub">' +
        String(v.last_visit_text || '') +
        '</div>' +
        '</div>' +
        '</div>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-tsr-store]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-tsr-store');
        if (id && typeof window.openStoreDetail === 'function') {
          window.openStoreDetail(id);
        } else if (id && typeof window.nav === 'function') {
          window._currentStoreId = id;
          window.nav('page-store-detail');
        }
      });
    });
  }

  function renderTsrPosList(pos) {
    var host = document.getElementById('tsrPosList');
    if (!host) return;

    if (!pos || pos.length === 0) {
      host.innerHTML =
        '<div style="padding:16px;text-align:center;color:var(--text-secondary,#64748b);font-size:13px;">' +
        'No POS assigned yet. Talk to your DSM.' +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < pos.length; i++) {
      var p = pos[i];
      var sid = String(p.id || '').replace(/'/g, '');
      html +=
        '<div class="list-row phase4-list-row" role="button" data-tsr-pos="' +
        sid +
        '">' +
        '<div class="avatar-tiny" style="background:linear-gradient(135deg,#97D700,#00B847);">' +
        _initials(p.name) +
        '</div>' +
        '<div class="list-row-main">' +
        '<div class="list-row-title">' +
        String(p.name || '') +
        '</div>' +
        '<div class="list-row-sub">' +
        String(p.last_visit_text || '') +
        '</div>' +
        '</div>' +
        '</div>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-tsr-pos]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-tsr-pos');
        if (id && typeof window.openStoreDetail === 'function') {
          window.openStoreDetail(id);
        }
      });
    });
  }

  async function renderTsrHome() {
    var session = typeof window.getSession === 'function' ? window.getSession() : null;
    if (!session || !session.id) return;

    var hr = new Date().getHours();
    var greet = hr < 12 ? 'Magandang umaga' : hr < 18 ? 'Magandang hapon' : 'Magandang gabi';

    var gEl = document.getElementById('tsrGreeting');
    if (gEl) gEl.textContent = greet;
    var nEl = document.getElementById('tsrName');
    if (nEl) nEl.textContent = session.name || 'Patrol';

    var av = document.getElementById('tsrHeaderAvatar');
    if (av) {
      av.textContent = _initials(session.name);
      av.classList.add('avatar', 'sm');
    }

    var todayVisits = await getTodayPlannedVisits(session.id);
    var planEl = document.getElementById('tsrTodayPlan');
    if (planEl) {
      planEl.textContent = '\ud83c\udfaf ' + todayVisits.length + ' visits planned today';
    }

    renderTsrTodayList(todayVisits.slice(0, 5));

    var stats = await getMyActivityStats(session.id, 'week');
    var vEl = document.getElementById('tsrVisits');
    if (vEl) vEl.textContent = String(stats.visits || 0);
    var pEl = document.getElementById('tsrProspects');
    if (pEl) pEl.textContent = String(stats.prospects || 0);
    var cEl = document.getElementById('tsrConversions');
    if (cEl) cEl.textContent = String(stats.conversions || 0);
    var vd = document.getElementById('tsrVisitsDelta');
    if (vd) {
      vd.textContent =
        stats.visitsDelta > 0
          ? '\u25b2 +' + stats.visitsDelta + ' vs LW'
          : stats.visitsDelta < 0
            ? '\u25bc ' + stats.visitsDelta + ' vs LW'
            : '\u2014 vs LW';
    }

    var pos = await getMyAssignedPos(session.id);
    renderTsrPosList(pos.slice(0, 4));

    var streak = await getMyStreak(session.id);
    var streakCard = document.getElementById('tsrStreakCard');
    var streakVal = document.getElementById('tsrStreakValue');
    if (streakCard && streakVal) {
      if (streak >= 1) {
        streakCard.style.display = 'block';
        streakVal.textContent = streak + '-day visit streak';
      } else {
        streakCard.style.display = 'none';
      }
    }

    var bb = document.getElementById('bellBadgeTsr');
    if (bb && typeof window.patrolUnreadNotifCount === 'function') {
      var cn = window.patrolUnreadNotifCount();
      bb.textContent = cn > 0 ? String(cn) : '';
    }
  }

  window.renderTsrHome = renderTsrHome;
  window.getTodayPlannedVisits = getTodayPlannedVisits;
  window.getMyAssignedPos = getMyAssignedPos;
  window.getMyActivityStats = getMyActivityStats;
  window.getMyStreak = getMyStreak;
})();

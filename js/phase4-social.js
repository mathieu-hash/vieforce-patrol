/**
 * VieForce Patrol — Phase 4 social (profile, notifications, leaderboard, search).
 * TODO Phase 5+: wire notifications, achievements persistence, reactions/comments backend.
 */
(function () {
  'use strict';

  var LS_NOTIF_READ = 'patrol_phase4_notifs_read_v1';
  var LS_SEARCH_RECENT = 'patrol_phase4_search_recent_v1';

  window._patrolProfileUserId = null;

  /** Deterministic pseudo-random 0..1 from string id */
  function _seed(id) {
    var s = String(id || '');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  window.ALL_BADGES = [
    { id: 'first10k', icon: '🏆', name: 'First 10K', desc: '10,000 bags' },
    { id: 'hotstreak', icon: '🔥', name: 'Hot Streak', desc: '5 days in a row' },
    { id: 'sniper', icon: '🎯', name: 'Sniper', desc: '10 prospects' },
    { id: 'diamond', icon: '💎', name: 'Diamond', desc: '100K MTD' },
    { id: 'speedster', icon: '⚡', name: 'Speedster', desc: '5 visits/day' },
    { id: 'champion', icon: '👑', name: 'Champion', desc: '#1 leaderboard' },
  ];

  var _MOCK_NOTIFS_DATA = [
    {
      id: 'n1',
      section: 'new',
      type: 'achievement',
      icon: '🏆',
      iconClass: 'gold',
      body:
        '<strong>Achievement unlocked:</strong> First 100 bags milestone for Sao Feeds Trading!',
      time: 'Just now',
      unread: true,
    },
    {
      id: 'n2',
      section: 'new',
      type: 'mention',
      icon: '💬',
      iconClass: '',
      body:
        '<strong>Mathieu Guillaume</strong> mentioned you: &quot;Great work this week, @edfrey!&quot;',
      time: '2m ago',
      unread: true,
    },
    {
      id: 'n3',
      section: 'new',
      type: 'alert',
      icon: '🚨',
      iconClass: 'red',
      body:
        '<strong>Cavalier Agrivet AR</strong> aging passed 60 days. ₱245,000 outstanding.',
      time: '10m ago',
      unread: true,
    },
    {
      id: 'n4',
      section: 'earlier',
      type: 'win',
      icon: '✅',
      iconClass: 'green',
      body: '<strong>Team Cebu South</strong> hit weekly visit target.',
      time: 'Earlier today',
      unread: false,
    },
    {
      id: 'n5',
      section: 'earlier',
      type: 'mention',
      icon: '💬',
      iconClass: '',
      body: '<strong>Jefrey Gatchalian</strong> tagged you in a win post.',
      time: '3h ago',
      unread: false,
    },
  ];

  window.MOCK_NOTIFS =
    typeof patrolFeatureEnabled === 'function' && !patrolFeatureEnabled('phase4Social')
      ? []
      : _MOCK_NOTIFS_DATA.slice();

  function _getReadSet() {
    try {
      var raw = localStorage.getItem(LS_NOTIF_READ);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function _saveReadSet(arr) {
    try {
      localStorage.setItem(LS_NOTIF_READ, JSON.stringify(arr));
    } catch (e) {}
  }

  function _notifEffectiveUnread(n) {
    var rs = _getReadSet();
    return n.unread && rs.indexOf(n.id) === -1;
  }

  function patrolUnreadNotifCount() {
    var n = 0;
    for (var i = 0; i < window.MOCK_NOTIFS.length; i++) {
      if (_notifEffectiveUnread(window.MOCK_NOTIFS[i])) n++;
    }
    return n;
  }

  function updateBellBadges() {
    var c = patrolUnreadNotifCount();
    var els = document.querySelectorAll('.patrol-bell-badge');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.textContent = c > 0 ? String(c) : '';
      el.classList.toggle('patrol-bell-hide', c === 0);
    }
  }

  // Delegates to canonical PatrolEscape.escapeHtml (js/_util/escape.js).
  function _escapeHtml(s) {
    return (typeof PatrolEscape !== 'undefined') ? PatrolEscape.escapeHtml(s) : (s == null ? '' : String(s));
  }

  function _initials(name) {
    if (!name) return '?';
    var p = String(name).split(/\s+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  }

  /** Role hint for mock overlay users */
  function _normRole(r) {
    return String(r || 'tsr').toLowerCase();
  }

  /**
   * Merge session + PATROL_MOCK_USER_REGISTRY (from activity-feed.js).
   */
  function getUserById(userId) {
    var sid = String(userId || '');
    var sess = typeof window.getSession === 'function' ? window.getSession() : null;
    if (sess && String(sess.id) === sid) {
      var rl = _normRole(sess.role);
      var tier = rl === 'ceo' || rl === 'exec' || rl === 'evp' ? 'elite' : '';
      return {
        id: sess.id,
        name: sess.name || 'Patrol user',
        initials: _initials(sess.name),
        role: rl,
        roleLabel: (sess.role || '').toUpperCase() + (sess.territory ? ' · ' + sess.territory : ''),
        tier: tier,
        territory: sess.territory || sess.district || '',
        phone: sess.phone || '',
        unlocked: ['first10k', 'hotstreak', 'diamond'].slice(0, _seed(sid) > 0.5 ? 3 : 2),
      };
    }
    var reg = window.PATROL_MOCK_USER_REGISTRY || {};
    if (reg[sid]) return reg[sid];
    return null;
  }

  function _mockStatsForRole(roleLc) {
    if (roleLc === 'dsm') {
      return [
        ['52,109', 'Bags MTD'],
        ['7', 'Stores'],
        ['23', 'Visits MTD'],
      ];
    }
    if (roleLc === 'rsm') {
      return [
        ['82,341', 'Bags MTD'],
        ['8', 'DSMs'],
        ['34', 'Visits MTD'],
      ];
    }
    return [
      ['338K', 'Bags MTD'],
      ['9', 'Reports'],
      ['127', 'Visits MTD'],
    ];
  }

  function renderBadges(container, unlockedIds) {
    if (!container) return;
    var set = {};
    for (var i = 0; i < (unlockedIds || []).length; i++) set[unlockedIds[i]] = true;
    var html = '';
    for (var b = 0; b < window.ALL_BADGES.length; b++) {
      var bd = window.ALL_BADGES[b];
      var ok = !!set[bd.id];
      html +=
        '<div class="badge-tile' +
        (ok ? ' unlocked' : ' locked') +
        '">' +
        '<span class="badge-tile-icon">' +
        _escapeHtml(bd.icon) +
        '</span>' +
        '<span class="badge-tile-name">' +
        _escapeHtml(bd.name) +
        '</span>' +
        '<span class="badge-tile-desc">' +
        _escapeHtml(bd.desc) +
        '</span></div>';
    }
    container.innerHTML = html;
  }

  function checkUnlocked(user) {
    var unlocked = [];
    if (!user) return unlocked;
    var bags = user.bags_mtd || 0;
    if (bags >= 10000) unlocked.push('first10k');
    if ((user.streak_days || 0) >= 5) unlocked.push('hotstreak');
    if ((user.prospects_converted || 0) >= 10) unlocked.push('sniper');
    if (bags >= 100000) unlocked.push('diamond');
    if ((user.avg_visits_per_day || 0) >= 5) unlocked.push('speedster');
    if (user.rank === 1) unlocked.push('champion');
    return unlocked;
  }

  function _deriveSyntheticUser(u) {
    var bags = u.bags_mtd || 0;
    return {
      bags_mtd: bags,
      streak_days: Math.floor(_seed(u.id + 'st') * 10),
      prospects_converted: Math.floor(_seed(u.id + 'pr') * 15),
      avg_visits_per_day: 3 + _seed(u.id + 'vd') * 4,
      rank: u.rank || 99,
    };
  }

  function renderUserActivity(userId) {
    var el = document.getElementById('profileActivity');
    if (!el) return;
    var posts = typeof window.getPatrolFeedPostsForUser === 'function'
      ? window.getPatrolFeedPostsForUser(userId)
      : [];
    if (!posts.length) {
      el.innerHTML =
        '<div class="phase4-muted-hint">Walang recent posts (mock feed).</div>';
      return;
    }
    var h = '';
    for (var i = 0; i < Math.min(3, posts.length); i++) {
      var p = posts[i];
      h +=
        '<div class="phase4-mini-post"><strong>' +
        _escapeHtml(p.snippetTitle) +
        '</strong> · ' +
        _escapeHtml(p.time) +
        '</div>';
    }
    el.innerHTML = h;
  }

  async function loadProfile(userId) {
    var uid = userId || (window.getSession() && window.getSession().id);
    var u = getUserById(uid);
    if (!u) {
      var ph = document.getElementById('profileName');
      if (ph) ph.textContent = 'Unknown user';
      return;
    }

    var rl = _normRole(u.role);
    var statPairs = _mockStatsForRole(rl);

    var pc = document.querySelector('#page-profile .profile-cover');
    if (pc) {
      pc.classList.toggle('elite', u.tier === 'elite');
    }

    var pn = document.getElementById('profileName');
    if (pn) pn.textContent = u.name;
    var phn = document.getElementById('profileHeaderName');
    if (phn) phn.textContent = u.name;

    var pt = document.getElementById('profileTitle');
    if (pt) {
      pt.innerHTML =
        _escapeHtml(u.roleLabel || u.role || '') +
        ' · 🌍 Vienovo Philippines · 🟢 Online';
    }

    var av = document.getElementById('profileAvatar');
    if (av) {
      av.textContent = u.initials || _initials(u.name);
      av.classList.remove('elite-ring');
      if (u.tier === 'elite') av.classList.add('elite-ring');
    }

    var eb = document.getElementById('profileEliteBadge');
    if (eb) {
      eb.innerHTML =
        u.tier === 'elite'
          ? '<span class="elite-tier-badge">🏅 Elite Tier</span>'
          : '';
    }

    try {
      if (typeof window.sapFetch === 'function') {
        var res = await window.sapFetch('/api/sap/sales/all?period=MTD');
        var bags = res && res.kpis && (res.kpis.bags != null ? res.kpis.bags : res.kpis.volume_bags);
        var n = Number(bags);
        if (isFinite(n) && n > 0) {
          statPairs[0][0] = n >= 100000 ? Math.round(n / 1000) + 'K' : n.toLocaleString('en-PH');
          statPairs[0][1] = 'Bags MTD';
        }
      }
    } catch (e) {}

    var s1 = document.getElementById('profileStat1Val');
    var s2 = document.getElementById('profileStat2Val');
    var s3 = document.getElementById('profileStat3Val');
    var l1 = document.getElementById('profileStat1Label');
    var l2 = document.getElementById('profileStat2Label');
    var l3 = document.getElementById('profileStat3Label');
    if (s1) s1.textContent = statPairs[0][0];
    if (s2) s2.textContent = statPairs[1][0];
    if (s3) s3.textContent = statPairs[2][0];
    if (l1) l1.textContent = statPairs[0][1];
    if (l2) l2.textContent = statPairs[1][1];
    if (l3) l3.textContent = statPairs[2][1];

    var legacyStores = document.getElementById('stat-stores');
    var legacyVisits = document.getElementById('stat-visits');
    var legacyFarms = document.getElementById('stat-farms');
    if (legacyStores) legacyStores.textContent = statPairs[1][0];
    if (legacyVisits) legacyVisits.textContent = statPairs[2][0];
    if (legacyFarms) legacyFarms.textContent = '--';
    var pss = document.getElementById('profile-settings-stat-stores');
    var psf = document.getElementById('profile-settings-stat-farms');
    var psv = document.getElementById('profile-settings-stat-visits');
    if (pss) pss.textContent = statPairs[1][0];
    if (psf) psf.textContent = '--';
    if (psv) psv.textContent = statPairs[2][0];

    var syn = {
      id: uid,
      bags_mtd: parseFloat(String(statPairs[0][0]).replace(/,/g, '')) || 0,
      streak_days: Math.floor(_seed(uid + 'x') * 10),
      prospects_converted: Math.floor(_seed(uid + 'y') * 12),
      avg_visits_per_day: 4 + _seed(uid + 'z') * 3,
      rank: 2,
    };
    var unlocked = checkUnlocked(syn);
    if (!unlocked.length && u.unlocked && u.unlocked.length) {
      /* map emoji labels from feed — skip */
    }
    renderBadges(document.getElementById('profileBadges'), unlocked.length ? unlocked : ['first10k', 'hotstreak']);

    var sess = typeof window.getSession === 'function' ? window.getSession() : null;
    var own = sess && String(sess.id) === String(uid);

    var tsPanel = document.getElementById('tsrProfileMonthPanel');
    if (tsPanel) {
      tsPanel.style.display =
        own && (rl === 'tsr' || rl === 'champion') ? '' : 'none';
    }
    try {
      if (
        own &&
        (rl === 'tsr' || rl === 'champion') &&
        typeof window.renderTsrProfileMonthStats === 'function'
      ) {
        await window.renderTsrProfileMonthStats(uid);
      }
    } catch (eProfileTs) {}

    var pa = document.getElementById('profileActions');
    if (pa) {
      pa.innerHTML = own
        ? '<button type="button" class="prof-btn prof-btn-primary" onclick="patrolPhase4EditProfile()">Edit profile</button>' +
          '<button type="button" class="prof-btn" onclick="patrolPhase4Logout()">Logout</button>'
        : '<button type="button" class="prof-btn prof-btn-primary" onclick="patrolPhase4FollowStub()">+ Follow</button>' +
          '<button type="button" class="prof-btn" onclick="patrolPhase4MessageStub()">💬 Message</button>' +
          '<button type="button" class="prof-btn" onclick="patrolPhase4MoreStub()">⋯</button>';
    }

    var setBlk = document.getElementById('profileSettingsOwn');
    if (setBlk) setBlk.style.display = own ? '' : 'none';

    renderUserActivity(uid);
  }

  window.patrolPhase4EditProfile = function () {
    alert('Edit profile — TODO Phase 5 (SAP / HR master)');
  };
  window.patrolPhase4Logout = function () {
    if (typeof window.logout === 'function') window.logout();
  };
  window.patrolPhase4FollowStub = function () {
    alert('Follow — TODO Phase 5 backend');
  };
  window.patrolPhase4MessageStub = function () {
    alert('Message — TODO Phase 5');
  };
  window.patrolPhase4MoreStub = function () {
    var settings = document.getElementById('profileSettingsOwn');
    var active = document.querySelector('.page.active');
    var aid = active ? active.id : '';
    if (settings && aid === 'page-profile' && settings.offsetParent !== null) {
      try {
        settings.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_e) {
        settings.scrollIntoView(true);
      }
      return;
    }
    if (typeof window.openMoreSheet === 'function') {
      window.openMoreSheet();
      return;
    }
    var btn = document.getElementById('btn-logout');
    if (btn && typeof btn.scrollIntoView === 'function') {
      try {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_e2) {
        btn.scrollIntoView(true);
      }
    }
  };

  function navToProfile(userId) {
    window._patrolProfileUserId = userId;
    if (typeof window.nav === 'function') window.nav('page-profile');
    setTimeout(function () {
      loadProfile(userId);
    }, 0);
  }

  function navToSearch() {
    if (typeof window.nav === 'function') window.nav('page-search');
    setTimeout(function () {
      var inp = document.getElementById('searchInput');
      if (inp) {
        inp.focus();
        renderSearchEmpty();
      }
    }, 50);
  }

  function navToNotifs() {
    if (typeof window.nav === 'function') window.nav('page-notifs');
    renderNotifs(window._patrolNotifFilter || 'all');
    setTimeout(function () {
      var rs = _getReadSet();
      for (var i = 0; i < window.MOCK_NOTIFS.length; i++) {
        if (rs.indexOf(window.MOCK_NOTIFS[i].id) === -1) rs.push(window.MOCK_NOTIFS[i].id);
      }
      _saveReadSet(rs);
      updateBellBadges();
      renderNotifs(window._patrolNotifFilter || 'all');
    }, 650);
  }

  function _notifRowHtml(n) {
    var unread = _notifEffectiveUnread(n);
    var ic = n.iconClass ? ' notif-icon ' + n.iconClass : ' notif-icon';
    return (
      '<div class="notif-row' +
      (unread ? ' unread' : '') +
      '" data-notif-id="' +
      _escapeHtml(n.id) +
      '">' +
      '<div class="' +
      ic.trim() +
      '">' +
      _escapeHtml(n.icon) +
      '</div>' +
      '<div><div class="notif-content">' +
      n.body +
      '</div><div class="notif-time">' +
      _escapeHtml(n.time) +
      '</div></div></div>'
    );
  }

  function renderNotifs(filter) {
    window._patrolNotifFilter = filter || 'all';
    var newEl = document.getElementById('notifsNew');
    var earlyEl = document.getElementById('notifsEarlier');
    if (!newEl || !earlyEl) return;

    function ok(n) {
      if (filter === 'all') return true;
      if (filter === 'mentions') return n.type === 'mention';
      if (filter === 'wins') return n.type === 'achievement' || n.type === 'win';
      if (filter === 'alerts') return n.type === 'alert';
      return true;
    }

    var nh = '';
    var eh = '';
    for (var i = 0; i < window.MOCK_NOTIFS.length; i++) {
      var n = window.MOCK_NOTIFS[i];
      if (!ok(n)) continue;
      if (n.section === 'new') nh += _notifRowHtml(n);
      else eh += _notifRowHtml(n);
    }
    newEl.innerHTML = nh || '<div class="phase4-muted-hint">Walang items.</div>';
    earlyEl.innerHTML = eh || '<div class="phase4-muted-hint">Walang mas maaga.</div>';
  }

  function _bindNotifTabs() {
    var bar = document.querySelector('#page-notifs .phase4-tab-bar');
    if (!bar || bar.getAttribute('data-bound') === '1') return;
    bar.setAttribute('data-bound', '1');
    bar.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('.tab') : null;
      if (!t) return;
      var f = t.getAttribute('data-filter') || 'all';
      var tabs = bar.querySelectorAll('.tab');
      for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
      t.classList.add('active');
      renderNotifs(f);
    });

    var root = document.getElementById('notifsNew');
    var root2 = document.getElementById('notifsEarlier');
    function clickRow(ev) {
      var row = ev.target.closest('.notif-row');
      if (!row) return;
      var id = row.getAttribute('data-notif-id');
      var rs = _getReadSet();
      if (id && rs.indexOf(id) === -1) {
        rs.push(id);
        _saveReadSet(rs);
        updateBellBadges();
        renderNotifs(window._patrolNotifFilter || 'all');
      }
    }
    if (root) root.addEventListener('click', clickRow);
    if (root2) root2.addEventListener('click', clickRow);
  }

  var _leaderPeriod = 'month';

  /** Activity-only synthetic stats for TSR/Champion (no SAP bags). */
  function _deriveActivitySynth(sessId) {
    var id = String(sessId || 'me');
    return {
      _id: id,
      visits_mtd: Math.floor(8 + _seed(id + 'vm') * 25),
      streak_days: Math.floor(_seed(id + 'st') * 12),
      prospects_converted: Math.floor(_seed(id + 'pr') * 10),
      avg_visits_per_day: 2 + _seed(id + 'vd') * 4,
    };
  }

  /**
   * Unlock rules aligned with PatrolScope.badgeCatalog() IDs (TSR path — no bag thresholds).
   */
  function checkUnlockedPatrolScope(syn) {
    var unlocked = [];
    if (!syn || !window.PatrolScope || typeof window.PatrolScope.badgeCatalog !== 'function') {
      return unlocked;
    }
    var catalog = window.PatrolScope.badgeCatalog();
    for (var i = 0; i < catalog.length; i++) {
      var b = catalog[i];
      var ok = false;
      switch (b.id) {
        case 'first-visits':
          ok = (syn.visits_mtd || 0) >= 10;
          break;
        case 'streak-5':
          ok = (syn.streak_days || 0) >= 5;
          break;
        case 'sniper':
          ok = (syn.prospects_converted || 0) >= 5;
          break;
        case 'speedster':
          ok = (syn.avg_visits_per_day || 0) >= 5;
          break;
        case 'territory':
          ok = (syn.visits_mtd || 0) >= 15 && _seed(String(syn._id || '') + 'tr') > 0.35;
          break;
        case 'team-activity':
          ok = (syn.team_tsrs_active || 0) >= 1 && (syn.team_tsrs_total || 0) > 0;
          break;
        case 'pos-coverage':
          ok = (syn.pos_coverage_pct || 0) >= 0.9;
          break;
        case 'region-growth':
          ok = (syn.region_mom_pct || 0) > 0;
          break;
        case 'first-10k':
          ok = (syn.bags_mtd || 0) >= 10000;
          break;
        case 'diamond':
          ok = (syn.bags_mtd || 0) >= 100000;
          break;
        default:
          ok = false;
      }
      if (ok) unlocked.push(b.id);
    }
    return unlocked;
  }

  function renderBadgesPatrolCatalog(container, unlockedIds) {
    if (!container || !window.PatrolScope || typeof window.PatrolScope.badgeCatalog !== 'function') {
      return;
    }
    var catalog = window.PatrolScope.badgeCatalog();
    var set = {};
    for (var ui = 0; ui < (unlockedIds || []).length; ui++) set[unlockedIds[ui]] = true;
    var html = '';
    for (var b = 0; b < catalog.length; b++) {
      var bd = catalog[b];
      var ok = !!set[bd.id];
      html +=
        '<div class="badge-tile' +
        (ok ? ' unlocked' : ' locked') +
        '">' +
        '<span class="badge-tile-icon">' +
        _escapeHtml(bd.icon) +
        '</span>' +
        '<span class="badge-tile-name">' +
        _escapeHtml(bd.name) +
        '</span>' +
        '<span class="badge-tile-desc">' +
        _escapeHtml(bd.desc) +
        '</span></div>';
    }
    container.innerHTML = html;
  }

  function restoreLeaderboardRankedLayout() {
    var page = document.getElementById('page-leader');
    if (!page) return;
    var tabBar = page.querySelector('.phase4-tab-bar');
    if (tabBar) tabBar.style.display = '';
    var podiumSec = page.querySelector('.podium-section');
    if (podiumSec) podiumSec.style.display = '';
    var labels = page.querySelectorAll('.app-content > .section-label.phase4-section');
    if (labels[0]) labels[0].style.display = '';
    if (labels[1]) labels[1].textContent = 'Your achievements';
    var rankingsList = document.getElementById('rankingsList');
    if (rankingsList) rankingsList.style.display = '';
    var slot = document.getElementById('leaderTsStatsSlot');
    if (slot) {
      slot.style.display = 'none';
      slot.innerHTML = '';
    }
    var searchLab = page.querySelector('#leaderSearchTap span:last-child');
    if (searchLab) searchLab.textContent = 'Search leaderboard';
  }

  function renderLeaderboardTsFallback() {
    var page = document.getElementById('page-leader');
    if (!page) return;
    var tabBar = page.querySelector('.phase4-tab-bar');
    if (tabBar) tabBar.style.display = 'none';
    var podiumSec = page.querySelector('.podium-section');
    if (podiumSec) podiumSec.style.display = 'none';
    var labels = page.querySelectorAll('.app-content > .section-label.phase4-section');
    if (labels[0]) labels[0].style.display = 'none';
    if (labels[1]) labels[1].textContent = 'My achievements';
    var rankingsList = document.getElementById('rankingsList');
    if (rankingsList) rankingsList.style.display = 'none';

    var searchLab = page.querySelector('#leaderSearchTap span:last-child');
    if (searchLab) searchLab.textContent = 'My activity';

    var ac = page.querySelector('.app-content');
    if (!ac) return;
    var slot = document.getElementById('leaderTsStatsSlot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'leaderTsStatsSlot';
      ac.insertBefore(slot, ac.firstChild);
    }
    slot.style.display = 'block';

    var sess = typeof window.getSession === 'function' ? window.getSession() : null;
    var syn = _deriveActivitySynth(sess && sess.id);
    var visits = syn.visits_mtd;
    var prospects = syn.prospects_converted;
    var conv = Math.min(prospects, Math.floor(1 + _seed(String(sess && sess.id) + 'cv') * 3));

    slot.innerHTML =
      '<div class="velocity-card" style="margin:0 12px 12px;">' +
      '<div style="font-weight:800;font-size:14px;font-family:Manrope,sans-serif;margin-bottom:14px;">📊 My stats this month</div>' +
      '<div class="kpi-strip" style="margin:0;padding:0;border:none;box-shadow:none;background:transparent;">' +
      '<div class="kpi">' +
      '<div class="kpi-value">' +
      visits +
      '</div>' +
      '<div class="kpi-label">Visits</div>' +
      '<div class="kpi-delta flat">activity</div>' +
      '</div>' +
      '<div class="kpi">' +
      '<div class="kpi-value">' +
      prospects +
      '</div>' +
      '<div class="kpi-label">Prospects</div>' +
      '<div class="kpi-delta flat">added</div>' +
      '</div>' +
      '<div class="kpi">' +
      '<div class="kpi-value">' +
      conv +
      '</div>' +
      '<div class="kpi-label">Conversions</div>' +
      '<div class="kpi-delta up">▲</div>' +
      '</div>' +
      '</div>' +
      '<p class="phase4-muted-hint" style="padding:12px 0 0;margin:0;font-size:12px;">No peer rankings — focus on your territory.</p>' +
      '</div>';

    var unlocked = checkUnlockedPatrolScope(syn);
    renderBadgesPatrolCatalog(document.getElementById('ownBadges'), unlocked);

    var pod = document.getElementById('podium');
    if (pod) {
      pod.innerHTML =
        '<div class="phase4-muted-hint" style="padding:16px;">Leaderboard rankings are for managers.</div>';
    }
  }

  async function buildLeaderboardRows(period) {
    var session = typeof window.getSession === 'function' ? window.getSession() : null;
    var totalBags = 120000;
    var periodParam = 'MTD';
    if (period === 'ytd') periodParam = 'YTD';
    if (period === 'today') periodParam = 'MTD';

    try {
      if (typeof window.sapFetch === 'function') {
        var res = await window.sapFetch('/api/sap/sales/all?period=' + encodeURIComponent(periodParam));
        var bags = res && res.kpis && (res.kpis.bags != null ? res.kpis.bags : res.kpis.volume_bags);
        var n = Number(bags);
        if (isFinite(n) && n > 0) totalBags = n;
      }
    } catch (e) {}

    if (period === 'today') {
      totalBags = Math.round(totalBags * (0.06 + _seed('today-period-scale') * 0.14));
    }

    var roster = [];
    function rosterAdd(row) {
      if (!row || !row.id) return;
      var sid = String(row.id);
      for (var ri = 0; ri < roster.length; ri++) {
        if (String(roster[ri].id) === sid) return;
      }
      roster.push(row);
    }
    if (session) {
      rosterAdd({
        id: String(session.id),
        name: session.name || 'Me',
        role: (session.role || '').toUpperCase(),
      });
    }

    try {
      if (session && typeof getDirectReports === 'function') {
        var reps = await getDirectReports(session.id, session.role);
        for (var i = 0; i < (reps || []).length; i++) {
          var m = reps[i];
          rosterAdd({
            id: String(m.id),
            name: m.name || 'Rep',
            role: (m.role || 'tsr').toUpperCase(),
          });
        }
      }
    } catch (e) {}

    if (roster.length < 4) {
      var reg = window.PATROL_MOCK_USER_REGISTRY || {};
      for (var k in reg) {
        if (!Object.prototype.hasOwnProperty.call(reg, k)) continue;
        if (roster.some(function (r) { return String(r.id) === String(k); })) continue;
        roster.push({
          id: String(k),
          name: reg[k].name,
          role: String(reg[k].role || 'tsr').toUpperCase(),
        });
        if (roster.length >= 8) break;
      }
    }

    var weights = [];
    var sum = 0;
    for (var w = 0; w < roster.length; w++) {
      var wt = 0.5 + _seed(roster[w].id + 'bag');
      weights.push(wt);
      sum += wt;
    }

    var rows = [];
    for (var r = 0; r < roster.length; r++) {
      var share = sum > 0 ? weights[r] / sum : 1 / roster.length;
      var bags = Math.max(1, Math.round(totalBags * share));
      var delta = Math.round((_seed(roster[r].id + 'delta') - 0.5) * 20);
      rows.push({
        id: roster[r].id,
        name: roster[r].name,
        initials: _initials(roster[r].name),
        role: roster[r].role,
        bags: bags,
        delta: delta,
        first_name: String(roster[r].name || '').split(/\s+/)[0] || roster[r].name,
      });
    }

    rows.sort(function (a, b) {
      return b.bags - a.bags;
    });
    for (var rk = 0; rk < rows.length; rk++) {
      rows[rk].rank = rk + 1;
    }

    return rows;
  }

  /** HQ alignment: never rank RSM + DSM (or Exec + managers) on one mixed podium. */
  function assignLeaderTier(row) {
    var lr = _normRole(row.role);
    if (lr === 'exec' || lr === 'ceo' || lr === 'director' || lr === 'evp' || lr === 'president' || lr === 'admin') {
      return 'executive';
    }
    if (lr === 'rsm') return 'regional';
    if (lr === 'dsm') return 'district';
    return 'field';
  }

  function partitionRowsByLeaderTier(rows) {
    var buckets = { executive: [], regional: [], district: [], field: [] };
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var k = assignLeaderTier(row);
      buckets[k].push(row);
    }
    var keys = ['executive', 'regional', 'district', 'field'];
    for (var ki = 0; ki < keys.length; ki++) {
      var key = keys[ki];
      buckets[key].sort(function (a, b) {
        return b.bags - a.bags;
      });
      for (var j = 0; j < buckets[key].length; j++) {
        buckets[key][j].tierRank = j + 1;
      }
    }
    return buckets;
  }

  function countNonEmptyLeaderTiers(parts) {
    var n = 0;
    if (parts.executive.length) n++;
    if (parts.regional.length) n++;
    if (parts.district.length) n++;
    if (parts.field.length) n++;
    return n;
  }

  /** When ≥2 tiers have people, render separate podiums (no mixed RSM/DSM top-3). */
  function shouldUseTieredLeaderLayout(parts) {
    return countNonEmptyLeaderTiers(parts) >= 2;
  }

  function buildPodiumMarkup(top3) {
    if (!top3 || top3.length === 0) return '';
    if (top3.length === 1) {
      var only = top3[0];
      return (
        '<div style="display:flex;flex-direction:column;align-items:center;padding:16px;gap:10px;">' +
        '<div class="podium-crown">\ud83d\udc51</div>' +
        '<div class="avatar lg elite-ring" style="background:linear-gradient(135deg,#FFC72C,#FA9E1B);">' +
        _escapeHtml(only.initials) +
        '</div>' +
        '<div class="podium-rank gold">1</div>' +
        '<div class="podium-name" style="font-weight:800;">' +
        _escapeHtml(only.first_name) +
        '</div>' +
        '<div class="podium-stat gold">' +
        only.bags.toLocaleString('en-PH') +
        ' bags \ud83d\udd25</div></div>'
      );
    }
    if (top3.length === 2) {
      var first = top3[0];
      var second = top3[1];
      return (
        '<div class="podium" style="display:flex;justify-content:center;gap:20px;align-items:flex-end;padding:12px 8px;">' +
        '<div class="podium-spot" style="text-align:center;max-width:42%;">' +
        '<div class="avatar lg silver-ring">' +
        _escapeHtml(second.initials) +
        '</div>' +
        '<div class="podium-rank silver">2</div>' +
        '<div class="podium-name">' +
        _escapeHtml(second.first_name) +
        '</div>' +
        '<div class="podium-stat">' +
        second.bags.toLocaleString('en-PH') +
        ' bags</div></div>' +
        '<div class="podium-spot first" style="text-align:center;max-width:42%;">' +
        '<div class="podium-crown">\ud83d\udc51</div>' +
        '<div class="avatar lg elite-ring" style="background:linear-gradient(135deg,#FFC72C,#FA9E1B);">' +
        _escapeHtml(first.initials) +
        '</div>' +
        '<div class="podium-rank gold">1</div>' +
        '<div class="podium-name" style="font-weight:800;">' +
        _escapeHtml(first.first_name) +
        '</div>' +
        '<div class="podium-stat gold">' +
        first.bags.toLocaleString('en-PH') +
        ' bags \ud83d\udd25</div></div></div>'
      );
    }
    var sec = top3[1];
    var fst = top3[0];
    var thd = top3[2];
    return (
      '<div class="podium-spot">' +
      '<div class="avatar lg silver-ring">' +
      _escapeHtml(sec.initials) +
      '</div>' +
      '<div class="podium-rank silver">2</div>' +
      '<div class="podium-name">' +
      _escapeHtml(sec.first_name) +
      '</div>' +
      '<div class="podium-stat">' +
      sec.bags.toLocaleString('en-PH') +
      ' bags</div></div>' +
      '<div class="podium-spot first">' +
      '<div class="podium-crown">👑</div>' +
      '<div class="avatar lg elite-ring" style="background:linear-gradient(135deg,#FFC72C,#FA9E1B);">' +
      _escapeHtml(fst.initials) +
      '</div>' +
      '<div class="podium-rank gold">1</div>' +
      '<div class="podium-name" style="font-weight:800;">' +
      _escapeHtml(fst.first_name) +
      '</div>' +
      '<div class="podium-stat gold">' +
      fst.bags.toLocaleString('en-PH') +
      ' bags 🔥</div></div>' +
      '<div class="podium-spot">' +
      '<div class="avatar lg bronze-ring">' +
      _escapeHtml(thd.initials) +
      '</div>' +
      '<div class="podium-rank bronze">3</div>' +
      '<div class="podium-name">' +
      _escapeHtml(thd.first_name) +
      '</div>' +
      '<div class="podium-stat">' +
      thd.bags.toLocaleString('en-PH') +
      ' bags</div></div>'
    );
  }

  function renderPodiumStacked(parts) {
    var pod = document.getElementById('podium');
    if (!pod) return;
    pod.classList.add('podium--stacked');
    var tiers = [
      { key: 'executive', label: 'Executive' },
      { key: 'regional', label: 'Regional (RSM)' },
      { key: 'district', label: 'District (DSM)' },
      { key: 'field', label: 'Field (TSR)' }
    ];
    var html = '';
    var ti;
    for (ti = 0; ti < tiers.length; ti++) {
      var tk = tiers[ti].key;
      var tierRows = parts[tk] || [];
      if (tierRows.length === 0) continue;
      var label = tiers[ti].label;
      html +=
        '<div class="leaderboard-tier-block">' +
        '<div class="section-label phase4-section leaderboard-tier-title">' +
        _escapeHtml(label) +
        '</div>' +
        '<div class="podium">' +
        buildPodiumMarkup(tierRows.slice(0, Math.min(3, tierRows.length))) +
        '</div></div>';
    }
    pod.innerHTML =
      html ||
      '<div class="phase4-muted-hint" style="padding:28px 16px;">No team ranked yet</div>';
  }

  function renderPodium(top3) {
    var pod = document.getElementById('podium');
    if (!pod) return;
    pod.classList.remove('podium--stacked');
    if (!top3 || top3.length === 0) {
      pod.innerHTML =
        '<div class="phase4-muted-hint" style="padding:28px 16px;">No team ranked yet</div>';
      return;
    }
    pod.innerHTML = buildPodiumMarkup(top3);
  }

  /**
   * Filipino hiya rule (CLAUDE.md §0 Rule 8 + §15.2): never expose ranks 4..N
   * publicly. Only admin-class roles (the same allowlist as
   * js/auth.js#canAccessUserAdmin — ceo, admin, evp, marketing) see the full
   * leaderboard tail; everyone else sees podium top-3 + their own row.
   */
  var LEADERBOARD_FULL_ROLES = ['ceo', 'admin', 'evp', 'marketing'];

  function _shouldShowFullLeaderboard(role) {
    var r = String(role || '').toLowerCase();
    for (var i = 0; i < LEADERBOARD_FULL_ROLES.length; i++) {
      if (LEADERBOARD_FULL_ROLES[i] === r) return true;
    }
    return false;
  }

  /**
   * Translation helper that falls back to a literal when window.t is not
   * loaded (e.g. in unit tests).
   */
  function _lbT(key, fallback, vars) {
    try {
      if (typeof window !== 'undefined' && typeof window.t === 'function') {
        var v = window.t(key, vars || {});
        if (v && v !== key) return v;
      }
    } catch (e) {}
    var out = fallback || '';
    if (vars) {
      for (var k in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, k)) {
          out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
        }
      }
    }
    return out;
  }

  /**
   * Single source of truth for the visibility gate. Given an already-sorted
   * rank list (desc by score), a viewer's id + role, plus the per-row
   * `rank`-key to read (e.g. `rank` global or `tierRank` per tier), returns:
   *   - rowsToRender   — the rows the renderer should iterate (excluding the
   *                      podium top 3; podium is rendered separately upstream)
   *   - ownRow         — the viewer's own row if it must be appended as a
   *                      separate "Ikaw: #N" entry (i.e. viewer is outside
   *                      top 3 AND not in rowsToRender)
   *   - hiddenCount    — how many rows are being suppressed (admin hint only)
   *   - showFull       — whether the viewer sees the full tail
   */
  function _buildVisibleRanks(sortedRows, viewerId, viewerRole, rankKey) {
    rankKey = rankKey || 'rank';
    var rows = sortedRows || [];
    var showFull = _shouldShowFullLeaderboard(viewerRole);
    var tail = rows.slice(3); // ranks 4..N
    var vid = viewerId == null ? null : String(viewerId);
    if (showFull) {
      return { rowsToRender: tail, ownRow: null, hiddenCount: 0, showFull: true };
    }
    // Non-admin: hide the tail. Surface the viewer's own row only if they
    // are outside the podium (top 3).
    var ownRow = null;
    if (vid) {
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].id) === vid) {
          var rk = rows[i][rankKey];
          if (typeof rk !== 'number') rk = i + 1;
          if (rk > 3) ownRow = rows[i];
          break;
        }
      }
    }
    return {
      rowsToRender: [],
      ownRow: ownRow,
      hiddenCount: tail.length,
      showFull: false,
    };
  }

  function _rankRowHtml(u, rank, opts) {
    opts = opts || {};
    var deltaText = u.delta > 0 ? '+' + u.delta : String(u.delta);
    var deltaColor = u.delta >= 0 ? 'var(--success)' : 'var(--danger)';
    var arrow = u.delta >= 0 ? '▲' : '▼';
    var subtitle = _escapeHtml(u.role) + ' · ' + u.bags.toLocaleString('en-PH') + ' bags';
    var nameHtml = _escapeHtml(u.name);
    var rowBg = '';
    if (opts.isOwnRow) {
      nameHtml += ' <span style="font-size:11px;color:var(--accent);font-weight:700">(' +
        _escapeHtml(_lbT('leaderboard.yourRank', 'You')) +
        ')</span>';
      if (opts.encourage) {
        subtitle += ' · ' + _escapeHtml(_lbT('leaderboard.keepGoing', 'Keep going! 💪'));
      }
      rowBg = 'background:rgba(0,166,206,0.06);';
    }
    return (
      '<div class="row" onclick="patrolNavToProfileSafe(\'' +
      String(u.id).replace(/'/g, "\\'") +
      '\')" style="cursor:pointer;' + rowBg + '">' +
      '<div style="width:24px;text-align:center;font-size:14px;font-weight:800;color:var(--text-secondary);font-family:Manrope,sans-serif">' +
      rank +
      '</div>' +
      '<div class="avatar">' +
      _escapeHtml(u.initials) +
      '</div>' +
      '<div class="row-content">' +
      '<div class="row-title">' +
      nameHtml +
      '</div>' +
      '<div class="row-subtitle">' +
      subtitle +
      '</div></div>' +
      '<div style="font-size:11px;color:' +
      deltaColor +
      ';font-weight:800;font-family:Manrope,sans-serif;white-space:nowrap">' +
      arrow +
      ' ' +
      _escapeHtml(deltaText) +
      '</div></div>'
    );
  }

  function renderRankingsRest(sorted, session) {
    var list = document.getElementById('rankingsList');
    if (!list) return;
    var sess = session || (typeof window.getSession === 'function' ? window.getSession() : null);
    var viewerId = sess && sess.id ? String(sess.id) : null;
    var viewerRole = sess ? sess.role : '';
    var view = _buildVisibleRanks(sorted || [], viewerId, viewerRole, 'rank');

    var html = '';
    for (var i = 0; i < view.rowsToRender.length; i++) {
      var u = view.rowsToRender[i];
      var rank = (typeof u.rank === 'number') ? u.rank : (i + 4);
      var isOwn = viewerId && String(u.id) === viewerId;
      html += _rankRowHtml(u, rank, { isOwnRow: isOwn });
    }

    if (view.ownRow) {
      var own = view.ownRow;
      var ownRank = (typeof own.rank === 'number') ? own.rank : null;
      html +=
        '<div style="border-top:2px dashed #E4E6EB;margin:4px 0"></div>' +
        _rankRowHtml(own, ownRank == null ? '?' : ownRank, { isOwnRow: true, encourage: true });
    }

    if (view.showFull && view.hiddenCount === 0 && html === '') {
      // Admin viewing an empty tail.
      list.innerHTML = '<div class="phase4-muted-hint">Walang iba pang ranking.</div>';
      return;
    }

    if (!view.showFull && view.hiddenCount > 0 && !view.ownRow && html === '') {
      // Non-admin viewer is inside the podium and there is no tail to show.
      list.innerHTML = '';
      return;
    }

    if (view.showFull && view.hiddenCount > 0 && view.rowsToRender.length === view.hiddenCount) {
      // Admin "+N more" hint is implicit — they see them all already.
    }

    list.innerHTML = html || '<div class="phase4-muted-hint">Walang iba pang ranking.</div>';
  }

  function renderRankingsTiered(parts, session) {
    var list = document.getElementById('rankingsList');
    if (!list) return;
    var sess = session || (typeof window.getSession === 'function' ? window.getSession() : null);
    var viewerId = sess && sess.id ? String(sess.id) : null;
    var viewerRole = sess ? sess.role : '';
    var showFull = _shouldShowFullLeaderboard(viewerRole);

    var tiers = [
      { key: 'executive', label: 'Executive' },
      { key: 'regional', label: 'Regional (RSM)' },
      { key: 'district', label: 'District (DSM)' },
      { key: 'field', label: 'Field (TSR)' }
    ];
    var html = '';
    for (var ti = 0; ti < tiers.length; ti++) {
      var tierRows = parts[tiers[ti].key] || [];
      if (tierRows.length === 0) continue;
      var view = _buildVisibleRanks(tierRows, viewerId, viewerRole, 'tierRank');
      // Skip the tier header entirely if there's nothing past the podium for
      // this viewer — the podium already shows the top 3.
      if (view.rowsToRender.length === 0 && !view.ownRow) continue;

      html +=
        '<div class="leaderboard-tier-rank-hdr section-label phase4-section leaderboard-tier-title">' +
        _escapeHtml(tiers[ti].label) +
        ' · rankings</div>';

      for (var i = 0; i < view.rowsToRender.length; i++) {
        var u = view.rowsToRender[i];
        var rank = (typeof u.tierRank === 'number') ? u.tierRank : (i + 4);
        var isOwn = viewerId && String(u.id) === viewerId;
        html += _rankRowHtml(u, rank, { isOwnRow: isOwn });
      }

      if (view.ownRow) {
        var own = view.ownRow;
        var ownRank = (typeof own.tierRank === 'number') ? own.tierRank : null;
        html +=
          '<div style="border-top:2px dashed #E4E6EB;margin:4px 0"></div>' +
          _rankRowHtml(own, ownRank == null ? '?' : ownRank, { isOwnRow: true, encourage: true });
      }
    }
    list.innerHTML = html || '<div class="phase4-muted-hint">Walang iba pang ranking.</div>';
    // Suppress unused-var warning in environments where showFull isn't used
    // beyond the buildVisibleRanks calls above.
    void showFull;
  }

  window.patrolNavToProfileSafe = function (id) {
    navToProfile(id);
  };

  async function refreshLeaderboardPage() {
    var ps = window.PatrolScope;
    if (ps && typeof ps.canSeeLeaderboard === 'function' && !ps.canSeeLeaderboard()) {
      renderLeaderboardTsFallback();
      return;
    }

    restoreLeaderboardRankedLayout();

    var rows = await buildLeaderboardRows(_leaderPeriod);
    var sess = typeof window.getSession === 'function' ? window.getSession() : null;
    var parts = partitionRowsByLeaderTier(rows);
    var tiered = shouldUseTieredLeaderLayout(parts);
    if (tiered) {
      renderPodiumStacked(parts);
      renderRankingsTiered(parts, sess);
    } else {
      renderPodium(rows.slice(0, Math.min(3, rows.length)));
      renderRankingsRest(rows, sess);
    }

    var me = rows.filter(function (r) {
      return sess && String(r.id) === String(sess.id);
    })[0];
    var syn = me ? _deriveSyntheticUser(me) : { bags_mtd: 0, streak_days: 0, prospects_converted: 0, avg_visits_per_day: 0, rank: 99 };
    if (me) syn.rank = me.rank;
    if (tiered && me && sess) {
      var tk = assignLeaderTier(me);
      var inTier = (parts[tk] || []).filter(function (r) {
        return String(r.id) === String(sess.id);
      })[0];
      if (inTier) syn.rank = inTier.tierRank;
    }
    var unlocked = checkUnlocked(syn);
    renderBadges(document.getElementById('ownBadges'), unlocked);
  }

  function _bindLeaderTabs() {
    var bar = document.querySelector('#page-leader .phase4-tab-bar');
    if (!bar || bar.getAttribute('data-bound') === '1') return;
    bar.setAttribute('data-bound', '1');
    bar.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('.tab') : null;
      if (!t) return;
      var p = t.getAttribute('data-period') || 'month';
      _leaderPeriod = p;
      var tabs = bar.querySelectorAll('.tab');
      for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
      t.classList.add('active');
      refreshLeaderboardPage();
    });

    var ls = document.getElementById('leaderSearchTap');
    if (ls) ls.addEventListener('click', navToSearch);
  }

  /* ─── Search ─────────────────────────────────────────────── */

  function _recentLoad() {
    try {
      var raw = localStorage.getItem(LS_SEARCH_RECENT);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function _recentSave(q) {
    if (!q || q.length < 2) return;
    var arr = _recentLoad().filter(function (x) {
      return x !== q;
    });
    arr.unshift(q);
    arr = arr.slice(0, 8);
    try {
      localStorage.setItem(LS_SEARCH_RECENT, JSON.stringify(arr));
    } catch (e) {}
  }

  function searchUsers(q) {
    var ql = q.toLowerCase();
    var out = [];
    var sess = typeof window.getSession === 'function' ? window.getSession() : null;
    var reg = window.PATROL_MOCK_USER_REGISTRY || {};
    function tryAdd(o) {
      if (!o || !o.name) return;
      if (String(o.name).toLowerCase().indexOf(ql) === -1) return;
      out.push({
        kind: 'user',
        id: o.id,
        title: o.name,
        sub: o.roleLabel || o.role || '',
      });
    }
    if (sess && sess.name && String(sess.name).toLowerCase().indexOf(ql) !== -1) {
      tryAdd(getUserById(sess.id));
    }
    for (var k in reg) {
      if (!Object.prototype.hasOwnProperty.call(reg, k)) continue;
      tryAdd(getUserById(k));
    }
    return out;
  }

  function searchStores(q) {
    var ql = q.toLowerCase();
    var fixtures = [
      { id: 'st1', name: 'Sao Feeds Trading', sub: 'Distributor · Cebu' },
      { id: 'st2', name: 'Cavalier Agrivet AR', sub: 'Retail · AR risk' },
      { id: 'st3', name: 'Power Hog Feed Depot', sub: 'Retail · Lapu-Lapu' },
    ];
    var out = [];
    for (var i = 0; i < fixtures.length; i++) {
      if (fixtures[i].name.toLowerCase().indexOf(ql) !== -1) {
        out.push({ kind: 'store', id: fixtures[i].id, title: fixtures[i].name, sub: fixtures[i].sub });
      }
    }
    return out;
  }

  function searchPosts(q) {
    var ql = q.toLowerCase();
    var out = [];
    var feed = typeof window.PATROL_MOCK_FEED_POSTS === 'object' && window.PATROL_MOCK_FEED_POSTS
      ? window.PATROL_MOCK_FEED_POSTS
      : [];
    for (var i = 0; i < feed.length; i++) {
      var body = (feed[i].body || '').replace(/<[^>]+>/g, ' ').toLowerCase();
      if (body.indexOf(ql) !== -1) {
        out.push({
          kind: 'post',
          id: 'p' + i,
          title: 'Post · ' + (feed[i].user && feed[i].user.name ? feed[i].user.name : 'Feed'),
          sub: (feed[i].body || '').replace(/<[^>]+>/g, '').slice(0, 80),
        });
      }
    }
    return out;
  }

  function renderSearchResults(results) {
    var host = document.getElementById('searchResults');
    if (!host) return;
    if (!results.length) {
      host.innerHTML = '<div class="phase4-muted-hint">Walang result.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      html +=
        '<div class="row list-card" style="margin:4px 12px;cursor:pointer;border-radius:12px" data-skind="' +
        r.kind +
        '" data-sid="' +
        _escapeHtml(r.id) +
        '">' +
        '<div class="row-content"><div class="row-title">' +
        _escapeHtml(r.title) +
        '</div><div class="row-subtitle">' +
        _escapeHtml(r.sub) +
        '</div></div></div>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-skind]').forEach(function (row) {
      row.addEventListener('click', function () {
        var k = row.getAttribute('data-skind');
        var id = row.getAttribute('data-sid');
        _recentSave(document.getElementById('searchInput').value.trim());
        if (k === 'user') navToProfile(id);
        else if (k === 'store') {
          if (typeof window.nav === 'function') window.nav('page-stores');
        } else {
          if (typeof window.nav === 'function') window.nav('page-dashboard');
        }
      });
    });
  }

  function renderSearchEmpty() {
    var host = document.getElementById('searchResults');
    if (!host) return;
    var recent = _recentLoad();
    var recHtml = '';
    for (var i = 0; i < recent.length; i++) {
      recHtml +=
        '<div class="row"><div class="row-content"><div class="row-title">' +
        _escapeHtml(recent[i]) +
        '</div></div></div>';
    }
    var people = [];
    var sess = typeof window.getSession === 'function' ? window.getSession() : null;
    if (sess) people.push(getUserById(sess.id));
    var reg = window.PATROL_MOCK_USER_REGISTRY || {};
    for (var k in reg) {
      if (!Object.prototype.hasOwnProperty.call(reg, k)) continue;
      people.push(reg[k]);
      if (people.length >= 5) break;
    }
    var pHtml = '';
    for (var p = 0; p < people.length; p++) {
      if (!people[p]) continue;
      pHtml +=
        '<div class="row" style="cursor:pointer" onclick="patrolNavToProfileSafe(\'' +
        String(people[p].id).replace(/'/g, "\\'") +
        '\')">' +
        '<div class="avatar">' +
        _escapeHtml(people[p].initials) +
        '</div>' +
        '<div class="row-content"><div class="row-title">' +
        _escapeHtml(people[p].name) +
        '</div><div class="row-subtitle">' +
        _escapeHtml(people[p].roleLabel || people[p].role || '') +
        '</div></div></div>';
    }

    host.innerHTML =
      '<div class="section-label phase4-section">Recent searches</div>' +
      '<div class="list-card" style="margin:0 12px 12px">' +
      (recHtml || '<div class="phase4-muted-hint" style="padding:12px">Walang recent.</div>') +
      '</div>' +
      '<div class="section-label phase4-section">People</div>' +
      '<div class="list-card" style="margin:0 12px 12px">' +
      pHtml +
      '</div>' +
      '<div class="section-label phase4-section">Top customers</div>' +
      '<div class="list-card" style="margin:0 12px">' +
      '<div class="row" onclick="patrolPhase4StoreStub()"><div class="row-content"><div class="row-title">Sao Feeds Trading</div>' +
      '<div class="row-subtitle">11,725 bags MTD</div></div></div>' +
      '<div class="row" onclick="patrolPhase4StoreStub()"><div class="row-content"><div class="row-title">Cavalier Agrivet</div>' +
      '<div class="row-subtitle">Visit streak · Cebu</div></div></div>' +
      '</div>';
  }

  window.patrolPhase4StoreStub = function () {
    if (typeof window.nav === 'function') window.nav('page-stores');
  };

  window.onSearchInput = function (value) {
    var q = String(value || '').trim();
    if (!q || q.length < 2) {
      renderSearchEmpty();
      return;
    }
    var results = searchUsers(q).concat(searchStores(q)).concat(searchPosts(q));
    renderSearchResults(results);
  };

  /* ─── Feed chrome ─────────────────────────────────────────── */

  function injectFeedChrome(slot) {
    var mount = document.getElementById('feed-mount-' + slot);
    if (!mount) return;
    var page = mount.closest('.page');
    if (!page || page.querySelector('.feed-top-chrome')) return;

    var sess = typeof window.getSession === 'function' ? window.getSession() : null;
    var initials = sess && sess.name ? _initials(sess.name) : '?';

    var bar = document.createElement('div');
    bar.className = 'feed-top-chrome';
    bar.innerHTML =
      '<div class="feed-top-search" id="feedSearchTap-' +
      slot +
      '" role="button" tabindex="0"><span style="font-size:14px">🔍</span> Search Patrol</div>' +
      '<div class="patrol-bell-wrap">' +
      '<button type="button" class="icon-btn patrol-icon-lg" id="feedBell-' +
      slot +
      '" aria-label="Notifications">🔔</button>' +
      '<span class="patrol-bell-badge patrol-bell-hide" id="feedBellBadge-' +
      slot +
      '"></span></div>' +
      '<button type="button" class="avatar feed-me-avatar" id="feedMeAvatar-' +
      slot +
      '" aria-label="Profile">' +
      _escapeHtml(initials) +
      '</button>';

    var tb = page.querySelector('.top-bar');
    if (tb) tb.after(bar);
    else mount.parentNode.insertBefore(bar, mount);

    document.getElementById('feedSearchTap-' + slot).addEventListener('click', navToSearch);
    document.getElementById('feedBell-' + slot).addEventListener('click', navToNotifs);
    document.getElementById('feedMeAvatar-' + slot).addEventListener('click', function () {
      if (sess) navToProfile(sess.id);
    });

    updateBellBadges();
  }

  function hookProfileNavFromBottomNav() {
    var navItems = document.querySelectorAll('.bottom-nav .nav-item[data-page="page-profile"]');
    for (var i = 0; i < navItems.length; i++) {
      if (navItems[i].getAttribute('data-phase4-hook') === '1') continue;
      navItems[i].setAttribute('data-phase4-hook', '1');
      navItems[i].addEventListener(
        'click',
        function () {
          var sess = typeof window.getSession === 'function' ? window.getSession() : null;
          window._patrolProfileUserId = sess ? sess.id : null;
          setTimeout(function () {
            if (typeof window.loadPatrolProfile === 'function') window.loadPatrolProfile(window._patrolProfileUserId);
          }, 0);
        },
        true
      );
    }
  }

  function initPhase4Social() {
    updateBellBadges();
    _bindNotifTabs();
    _bindLeaderTabs();
    hookProfileNavFromBottomNav();

    injectFeedChrome('tsr');
    injectFeedChrome('dsm');
    injectFeedChrome('rsm');

    var ob = typeof MutationObserver !== 'undefined' ? new MutationObserver(function () {
      hookProfileNavFromBottomNav();
      updateBellBadges();
    }) : null;
    if (ob && document.getElementById('bottom-nav')) {
      ob.observe(document.getElementById('bottom-nav'), { childList: true, subtree: true });
    }
  }

  window.navToProfile = navToProfile;
  window.navToSearch = navToSearch;
  window.navToNotifs = navToNotifs;
  window.loadPatrolProfile = loadProfile;
  window.refreshLeaderboardPage = refreshLeaderboardPage;
  window.renderSearchEmpty = renderSearchEmpty;
  window.initPhase4Social = initPhase4Social;
  window.updateBellBadges = updateBellBadges;

  // Exposed for unit tests + cross-module use (e.g. champion.js / scorecard.js
  // can share the same Filipino-hiya gate).
  window.PatrolLeaderboard = {
    shouldShowFull: _shouldShowFullLeaderboard,
    buildVisibleRanks: _buildVisibleRanks,
    fullRoles: LEADERBOARD_FULL_ROLES.slice(),
  };

  window.renderPatrolNotifs = function () {
    renderNotifs(window._patrolNotifFilter || 'all');
    updateBellBadges();
  };

  window.patrolLeaderHdrProfile = function () {
    var sess = typeof window.getSession === 'function' ? window.getSession() : null;
    if (sess && sess.id && typeof navToProfile === 'function') navToProfile(sess.id);
  };

  window.addEventListener('patrol:locale-changed', function () {
    var ap = document.querySelector('.page.active');
    if (ap && ap.id === 'page-profile') {
      if (typeof window.applyI18nLabels === 'function') window.applyI18nLabels(document.getElementById('page-profile') || document.body);
      var uid = window._patrolProfileUserId;
      var sess = typeof window.getSession === 'function' ? window.getSession() : null;
      if (!uid && sess) uid = sess.id;
      if (typeof window.loadPatrolProfile === 'function') window.loadPatrolProfile(uid);
    }
  });
})();

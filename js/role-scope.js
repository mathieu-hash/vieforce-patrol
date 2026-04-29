/**
 * Patrol — Role-aware scope helpers (UI layer only).
 * Server-side enforcement stays in api/_lib/scope.js.
 */
(function () {
  'use strict';

  function currentUser() {
    if (window.PatrolSession && window.PatrolSession.user) {
      return window.PatrolSession.user;
    }
    if (typeof window.getSession === 'function') {
      var s = window.getSession();
      if (s && s.id) {
        return {
          id: s.id,
          name: s.name,
          role: s.role,
          territory: s.territory,
          district: s.district,
        };
      }
    }
    return null;
  }

  function role() {
    var u = currentUser();
    return u && u.role ? String(u.role).toLowerCase() : 'unknown';
  }

  function isTsr() {
    return role() === 'tsr';
  }

  function isChampion() {
    return role() === 'champion';
  }

  function isDsm() {
    return role() === 'dsm';
  }

  function isRsm() {
    return role() === 'rsm';
  }

  function isExec() {
    var r = role();
    return ['exec', 'ceo', 'director', 'evp', 'president'].indexOf(r) !== -1;
  }

  function isManager() {
    return isDsm() || isRsm() || isExec();
  }

  function canSeeBags() {
    return !isTsr() && !isChampion();
  }

  function canSeeLeaderboard() {
    return !isTsr() && !isChampion();
  }

  function canSeeKpiStrip() {
    return isRsm() || isExec();
  }

  function canSeeStories() {
    return isRsm() || isExec();
  }

  /** Pinned / company-wide exec posts in the rich feed — RSM + Exec only (not DSM squad home). */
  function canSeeExecPosts() {
    return isRsm() || isExec();
  }

  function canSeeBagAchievements() {
    return canSeeBags();
  }

  /**
   * IDs whose posts may appear in scoped feeds. Null = unrestricted (exec-wide mock).
   */
  async function getFeedUserIds() {
    var u = currentUser();
    if (!u || !u.id) return [];

    if (isTsr()) {
      return [u.id];
    }
    if (typeof window.getDirectReports !== 'function') {
      return [u.id];
    }

    if (isDsm()) {
      var tsrs = await window.getDirectReports(u.id);
      var ids = [u.id];
      for (var i = 0; i < (tsrs || []).length; i++) {
        var rl = (tsrs[i].role || '').toLowerCase();
        if (rl === 'tsr' || rl === 'champion') ids.push(tsrs[i].id);
      }
      return ids;
    }

    if (isRsm()) {
      var dsms = await window.getDirectReports(u.id, 'rsm');
      var out = [u.id];
      for (var di = 0; di < (dsms || []).length; di++) {
        var d = dsms[di];
        out.push(d.id);
        var tsrs2 = await window.getDirectReports(d.id, 'dsm');
        for (var ti = 0; ti < (tsrs2 || []).length; ti++) {
          out.push(tsrs2[ti].id);
        }
      }
      return out;
    }

    if (isExec()) {
      return null;
    }

    return [u.id];
  }

  function homePageId() {
    if (isTsr() || isChampion()) return 'page-home-tsr';
    if (isDsm()) return 'page-home-dsm';
    if (isRsm() || isExec()) return 'page-rsm-home';
    if (role() === 'admin') return 'page-dashboard';
    return 'page-home';
  }

  function badgeCatalog() {
    var tsrBadges = [
      { id: 'first-visits', icon: '\ud83d\udc63', name: 'First Steps', desc: '10 visits logged' },
      { id: 'streak-5', icon: '\ud83d\udd25', name: 'Hot Streak', desc: '5 days in a row' },
      { id: 'sniper', icon: '\ud83c\udfaf', name: 'Sniper', desc: '5 prospects converted' },
      { id: 'speedster', icon: '\u26a1', name: 'Speedster', desc: '5 visits in one day' },
      { id: 'territory', icon: '\ud83d\uddfa\ufe0f', name: 'Territory', desc: 'All assigned POS visited' },
    ];
    var dsmBadges = tsrBadges.concat([
      { id: 'team-activity', icon: '\ud83d\udc65', name: 'Squad Lead', desc: 'All TSRs active this week' },
      { id: 'pos-coverage', icon: '\ud83c\udfea', name: 'Coverage', desc: '90%+ POS visited monthly' },
    ]);
    var rsmBadges = dsmBadges.concat([
      { id: 'region-growth', icon: '\ud83d\udcc8', name: 'Region Builder', desc: 'Region MoM growth' },
    ]);
    var execBadges = rsmBadges.concat([
      { id: 'first-10k', icon: '\ud83c\udfc6', name: 'First 10K', desc: '10,000 bags milestone' },
      { id: 'diamond', icon: '\ud83d\udc8e', name: 'Diamond', desc: '100K MTD' },
    ]);

    if (isTsr() || isChampion()) return tsrBadges;
    if (isDsm()) return dsmBadges;
    if (isRsm()) return rsmBadges;
    return execBadges;
  }

  window.PatrolScope = {
    role: role,
    currentUser: currentUser,
    isTsr: isTsr,
    isChampion: isChampion,
    isDsm: isDsm,
    isRsm: isRsm,
    isExec: isExec,
    isManager: isManager,
    canSeeBags: canSeeBags,
    canSeeLeaderboard: canSeeLeaderboard,
    canSeeKpiStrip: canSeeKpiStrip,
    canSeeStories: canSeeStories,
    canSeeExecPosts: canSeeExecPosts,
    canSeeBagAchievements: canSeeBagAchievements,
    getFeedUserIds: getFeedUserIds,
    homePageId: homePageId,
    badgeCatalog: badgeCatalog,
  };
})();

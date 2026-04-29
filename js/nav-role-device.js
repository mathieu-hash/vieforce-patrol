// ============================================================
// Role + Device Aware Bottom Nav (Day 1)
//
// TSR / Champion: we DO NOT touch the bottom-nav DOM — the existing
//   4-tab layout (Bahay / Tindahan / Mapa / Profile) ships exactly as
//   before. Rule 1 for this file: no regressions to the field-worker
//   experience.
//
// DSM mobile (<900px): Home / Stores / Visit / Sales / Leaders (Phase 3)
// RSM mobile (<900px): same — Region lives in More sheet when opened from overflow patterns
// Exec-like roles (exec/ceo/evp) on mobile: soft prompt to open HQ.
//   Admin is NOT redirected (they need the Patrol admin panel).
// Desktop any role: current nav stays — this script is a no-op.
//
// Depends on globals from auth.js (getSession, logout) and the inline
// app.html bootstrapper (nav(pageId)). Both are loaded before this
// file.
// ============================================================

(function () {
  'use strict';

  var HQ_URL = 'https://vieforce-hq.vercel.app';
  var MOBILE_BREAKPOINT = 900;
  // CEO uses Patrol manager dashboard (same as DSM shell on mobile). Only exec/evp go to HQ splash.
  var EXEC_ROLES = ['exec', 'evp'];
  var OBSERVER_FLAG = 'patrol_observer_mode';
  var SPLASH_SECONDS = 3;

  // page: must match an id on an existing .page section. Use existing
  // page IDs where we have them so nav()'s active-state logic keeps
  // working without config changes.
  var NAV_CONFIGS = {
    // TSR / Champion: null => leave existing bottom-nav DOM alone
    tsr:      null,
    champion: null,

    dsm: {
      mobile: [
        { id: 'home',   icon: '\ud83c\udfe0', label: 'Home',    page: 'page-dashboard' },
        { id: 'stores', icon: '\ud83c\udfea', label: 'Stores',  page: 'page-stores', badge: 'stores' },
        { id: 'visit',  icon: '\ud83d\udcdd', label: 'Visit',   page: 'page-visits' },
        { id: 'sales',  icon: '\ud83d\udcca', label: 'Sales',   page: 'pg-sales' },
        { id: 'leaders', icon: '\ud83c\udfc6', label: 'Leaders', page: 'page-leader' }
      ]
    },

    rsm: {
      mobile: [
        { id: 'home',    icon: '\ud83c\udfe0', label: 'Home',    page: 'page-rsm-home' },
        { id: 'stores',  icon: '\ud83c\udfea', label: 'Stores',  page: 'page-stores', badge: 'stores' },
        { id: 'visit',   icon: '\ud83d\udcdd', label: 'Visit',   page: 'page-visits' },
        { id: 'sales',   icon: '\ud83d\udcca', label: 'Sales',   page: 'pg-sales' },
        { id: 'leaders', icon: '\ud83c\udfc6', label: 'Leaders', page: 'page-leader' }
      ]
    }
  };

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function getRole(session) {
    return (session && session.role ? session.role : 'tsr').toLowerCase();
  }

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // navTo — alias for the inline nav() so new onclick handlers have a
  // stable name, independent of app.html internals.
  function navTo(pageId) {
    if (typeof window.nav === 'function') return window.nav(pageId);
    // Fallback — defensive only; inline script always defines nav()
    var target = document.getElementById(pageId);
    if (!target) return;
    var all = document.querySelectorAll('.page');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    target.classList.add('active');
    window.scrollTo(0, 0);
  }

  function renderNav() {
    var session = (typeof window.getSession === 'function') ? window.getSession() : null;
    if (!session) return;

    var role = getRole(session);

    // Keep body class in sync so role-aware CSS can target things
    var b = document.body;
    b.classList.remove('role-tsr','role-champion','role-dsm','role-rsm','role-exec','role-ceo','role-evp','role-admin');
    b.classList.add('role-' + role);

    // Exec-like roles: full-screen splash → auto-redirect to HQ in 3s,
    // with an escape link to "observer mode" (banner + visit controls
    // disabled + no bottom nav). Fires on both mobile and desktop —
    // HQ is the canonical exec experience. Admin is NOT included.
    if (EXEC_ROLES.indexOf(role) !== -1) {
      handleExecRoute();
      return; // never render field-user nav for execs
    }

    // Desktop: leave everything alone.
    if (!isMobile()) return;

    // CEO: same 5-tab manager nav as DSM (HQ splash no longer applies to CEO).
    var navRole = role === 'ceo' ? 'dsm' : role;
    var config = NAV_CONFIGS[navRole];
    if (!config || !config.mobile) return; // TSR / champion / unknown → no override

    var navEl = document.getElementById('bottom-nav');
    if (!navEl) return;

    var items = config.mobile;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var onclickAttr;
      if (it.action === 'openMoreSheet') {
        onclickAttr = 'openMoreSheet()';
      } else {
        onclickAttr = "navTo('" + escAttr(it.page) + "')";
      }
      var dataPage = it.page ? ' data-page="' + escAttr(it.page) + '"' : '';
      var badgePart =
        it.badge === 'stores'
          ? '<span class="nav-badge" aria-hidden="true" style="display:none">0</span>'
          : '';
      html += '<button type="button" class="nav-item" data-nav="' + escAttr(it.id) + '"' + dataPage +
        ' onclick="' + onclickAttr + '">' +
        '<span class="nav-pip" aria-hidden="true"></span>' +
        '<span class="nav-ico">' + it.icon + '</span>' +
        '<span class="nav-lbl">' + it.label + '</span>' +
        badgePart +
        '</button>';
    }
    navEl.innerHTML = html;

    // Mark active based on currently visible page
    var activePage = document.querySelector('.page.active');
    if (activePage) updateNavActive(activePage.id);
  }

  // ── Exec splash + observer mode ──────────────────────────────────
  function handleExecRoute() {
    if (sessionStorage.getItem(OBSERVER_FLAG) === '1') {
      enableObserverMode();
    } else {
      showExecRedirectSplash();
    }
  }

  function redirectToHq() {
    // Clear any splash timer before navigating so the interval doesn't
    // re-fire during the redirect.
    var splash = document.getElementById('exec-splash');
    if (splash && splash._timerId) clearInterval(splash._timerId);
    window.location.href = HQ_URL;
  }

  function showExecRedirectSplash() {
    if (document.getElementById('exec-splash')) return; // idempotent

    var splash = document.createElement('div');
    splash.id = 'exec-splash';
    splash.innerHTML =
      '<div class="splash-content">' +
        '<div class="splash-icon">\ud83d\udc54</div>' +
        '<div class="splash-title">EVP Dashboard is on HQ</div>' +
        '<div class="splash-countdown" id="splash-count">' + SPLASH_SECONDS + '</div>' +
        '<div class="splash-sub">Redirecting\u2026</div>' +
        '<button type="button" class="splash-escape">Continue to Patrol (observer mode)</button>' +
      '</div>';
    document.body.appendChild(splash);

    // Escape link MUST stop propagation — otherwise the outer click
    // handler (tap-anywhere redirects) also fires and sends them away.
    var escapeBtn = splash.querySelector('.splash-escape');
    escapeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      enterObserverMode();
    });

    // Tap anywhere else on the splash → immediate redirect.
    splash.addEventListener('click', function () { redirectToHq(); });

    var count = SPLASH_SECONDS;
    var timerId = setInterval(function () {
      count--;
      var el = document.getElementById('splash-count');
      if (el) el.textContent = count;
      if (count <= 0) {
        clearInterval(timerId);
        redirectToHq();
      }
    }, 1000);
    splash._timerId = timerId;
  }

  function enterObserverMode() {
    sessionStorage.setItem(OBSERVER_FLAG, '1');
    var splash = document.getElementById('exec-splash');
    if (splash) {
      if (splash._timerId) clearInterval(splash._timerId);
      splash.remove();
    }
    enableObserverMode();
  }

  function enableObserverMode() {
    if (document.body.classList.contains('observer-mode')) return; // idempotent
    document.body.classList.add('observer-mode');

    // Banner
    var banner = document.createElement('div');
    banner.id = 'observer-banner';
    banner.innerHTML =
      '<span class="observer-banner-label">\ud83d\udc41\ufe0f Observer Mode \u00b7 You\u2019re viewing Patrol as a field user</span>' +
      '<a id="observer-back-hq" class="observer-banner-link">\ud83c\udfe0 Back to HQ</a>';
    document.body.prepend(banner);
    document.getElementById('observer-back-hq').addEventListener('click', redirectToHq);

    // Disable visit-submission affordances
    disableVisitControls();

    // Hide bottom nav — exec doesn't need field-worker nav here
    var nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = 'none';
  }

  function disableVisitControls() {
    // FAB is the primary "+ Log visit" entry; extra selectors cover
    // any button explicitly marked by data-attr or class.
    var sel = '#fab-btn, [data-action="log-visit"], .btn-log-visit';
    var targets = document.querySelectorAll(sel);
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if ('disabled' in t) t.disabled = true;
      t.setAttribute('aria-disabled', 'true');
      t.title = 'Disabled in observer mode';
    }
  }

  function updateNavActive(pageId) {
    var btns = document.querySelectorAll('#bottom-nav .nav-item');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.remove('active');
      if (btns[i].dataset && btns[i].dataset.page === pageId) {
        btns[i].classList.add('active');
      }
    }
  }

  // ── More bottom sheet (DSM / RSM) ────────────────────────────────
  function openMoreSheet() {
    var items = [
      { icon: '\ud83d\udc64', label: 'Profile', page: 'page-profile' },
      { icon: '\ud83d\udcb0', label: 'AR', page: 'pg-ar' },
      { icon: '\ud83d\udc65', label: 'Team', page: 'page-team' },
      { icon: '\ud83d\uddfa\ufe0f', label: 'Map', page: 'page-map' },
      { icon: '\ud83c\udf0d', label: 'Region', page: 'pg-region' },
      { icon: '\ud83e\udde0', label: 'Customer Insights', page: 'pg-insights' },
      { icon: '\ud83d\udce6', label: 'Inventory', page: 'pg-inventory' },
      { icon: '\ud83d\udd17', label: 'Open HQ Desktop', action: 'openHq' },
      { icon: '\ud83d\udeaa', label: 'Logout', action: 'logout' }
    ];

    var sheet = document.getElementById('more-sheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'more-sheet';
      sheet.className = 'more-sheet';
      document.body.appendChild(sheet);
    }

    var itemHtml = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var onclickAttr;
      if (it.action === 'openHq') {
        // open-in-new-tab, close sheet
        onclickAttr = "window.open('" + HQ_URL + "','_blank');closeMoreSheet()";
      } else if (it.action === 'logout') {
        onclickAttr = 'closeMoreSheet();if(typeof logout===\'function\')logout()';
      } else {
        onclickAttr = "navTo('" + escAttr(it.page) + "');closeMoreSheet()";
      }
      itemHtml += '<div class="more-sheet-item" onclick="' + onclickAttr + '">' +
        '<span class="more-sheet-ico">' + it.icon + '</span>' +
        '<span>' + it.label + '</span>' +
      '</div>';
    }

    sheet.innerHTML =
      '<div class="more-sheet-backdrop" onclick="closeMoreSheet()"></div>' +
      '<div class="more-sheet-panel" role="dialog" aria-label="More menu">' +
        '<div class="more-sheet-handle"></div>' +
        '<div class="more-sheet-title">More</div>' +
        '<div class="more-sheet-items">' + itemHtml + '</div>' +
      '</div>';

    sheet.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeMoreSheet() {
    var sheet = document.getElementById('more-sheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ── Init / resize ────────────────────────────────────────────────
  var _resizeTimer;
  function onResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(renderNav, 150);
  }

  // Expose
  window.renderNav = renderNav;
  window.updateNavActive = updateNavActive;
  window.navTo = navTo;
  window.openMoreSheet = openMoreSheet;
  window.closeMoreSheet = closeMoreSheet;
  window.enterObserverMode = enterObserverMode;
  window.enableObserverMode = enableObserverMode;
  window.showExecRedirectSplash = showExecRedirectSplash;

  // Defer one tick so the inline app.html bootstrapper (Team-tab inject,
  // homeNav rewire) runs first, then our final role-aware layout takes
  // over. On DOMContentLoaded for early-load safety.
  function kickoff() { setTimeout(renderNav, 0); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kickoff);
  } else {
    kickoff();
  }
  window.addEventListener('resize', onResize);
})();

// ============================================================
// Role + Device Aware Bottom Nav (Day 1)
//
  // TSR / Champion on mobile: emoji tab strip from NAV_CONFIGS. On desktop width (≥900px),
  // we keep app.html’s default bar (Home / Stores / Map / Profile / More) — no regressions
// for field workers on small phones + wide layouts for pure TSR sessions.
//
  // DSM / RSM / CEO: Home / Stores / Sales / Map / More on all viewports
//   (wide Chrome or "Request Desktop Site" used to skip this and keep the TSR strip — fixed.)
// TSR / champion desktop: default 5-tab bar from app.html unchanged.
// Exec-like roles (exec/evp): HQ splash; CEO uses RSM shell above.
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
    tsr: {
      mobile: [
        { id: 'home',     icon: '\ud83c\udfe0', labelKey: 'nav.home',    label: 'Home',    page: 'page-home-tsr' },
        { id: 'stores',   icon: '\ud83c\udfea', labelKey: 'nav.pos',    label: 'POS',     page: 'page-stores', badge: 'stores' },
        { id: 'mapa',     icon: '\ud83d\uddfa\ufe0f', labelKey: 'nav.mapa', label: 'Mapa', page: 'page-mapa-tsr' },
        { id: 'profile',  icon: '\ud83d\udc64', labelKey: 'nav.me',      label: 'Me',      page: 'page-profile' },
        { id: 'more',     icon: '\u22ef',      labelKey: 'nav.more',     label: 'More',    action: 'openMoreSheet' },
      ],
    },
    champion: {
      mobile: [
        { id: 'home',     icon: '\ud83c\udfe0', labelKey: 'nav.home',    label: 'Home',    page: 'page-home-tsr' },
        { id: 'stores',   icon: '\ud83c\udfea', labelKey: 'nav.pos',    label: 'POS',     page: 'page-stores', badge: 'stores' },
        { id: 'mapa',     icon: '\ud83d\uddfa\ufe0f', labelKey: 'nav.mapa', label: 'Mapa', page: 'page-mapa-tsr' },
        { id: 'profile',  icon: '\ud83d\udc64', labelKey: 'nav.me',      label: 'Me',      page: 'page-profile' },
        { id: 'more',     icon: '\u22ef',      labelKey: 'nav.more',     label: 'More',    action: 'openMoreSheet' },
      ],
    },

    dsm: {
      mobile: [
        { id: 'home',   icon: '\ud83c\udfe0', labelKey: 'nav.home', label: 'Home',    page: 'page-home-dsm' },
        { id: 'stores', icon: '\ud83c\udfea', labelKey: 'nav.stores', label: 'Stores',  page: 'page-stores', badge: 'stores' },
        { id: 'sales',  icon: '\ud83d\udcca', labelKey: 'nav.sales', label: 'Sales',   page: 'pg-sales' },
        { id: 'map',    icon: '\ud83d\uddfa\ufe0f', labelKey: 'nav.mapa', label: 'Mapa', page: 'page-map' },
        { id: 'more',   icon: '\u22ef',       labelKey: 'nav.more', label: 'More',    action: 'openMoreSheet' }
      ]
    },

    rsm: {
      mobile: [
        { id: 'home',    icon: '\ud83c\udfe0', labelKey: 'nav.home', label: 'Home',    page: 'page-rsm-home' },
        { id: 'stores',  icon: '\ud83c\udfea', labelKey: 'nav.stores', label: 'Stores',  page: 'page-stores', badge: 'stores' },
        { id: 'sales',   icon: '\ud83d\udcca', labelKey: 'nav.sales', label: 'Sales',   page: 'pg-sales' },
        { id: 'map',     icon: '\ud83d\uddfa\ufe0f', labelKey: 'nav.mapa', label: 'Mapa', page: 'page-map' },
        { id: 'more',    icon: '\u22ef',       labelKey: 'nav.more', label: 'More',    action: 'openMoreSheet' }
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

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

    // CEO: RSM-style shell (Region feed + Leaders), not DSM dashboard.
    var navRole = role === 'ceo' ? 'rsm' : role;
    var config = NAV_CONFIGS[navRole];
    if (!config || !config.mobile) return; // admin / unknown → no override

    // Desktop (≥900px): keep the default bottom bar from app.html for TSR + champion only.
    // DSM / RSM / CEO must get Home · Stores · Sales · Mapa · More on every viewport —
    // otherwise wide Chrome / "Request Desktop Site" / tablet landscape leaves the old TSR strip
    // (Map instead of Sales/Leaders) and feels like tabs are "missing".
    if (!isMobile() && navRole !== 'dsm' && navRole !== 'rsm') return;

    var navEl = document.getElementById('bottom-nav');
    if (!navEl) return;

    var items = config.mobile;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var attrs = '';
      var onclick = '';
      if (it.action === 'openMoreSheet') {
        attrs = ' data-action="more-sheet"';
        onclick = " onclick=\"if(typeof window.openMoreSheet==='function')window.openMoreSheet();\"";
      } else if (it.page) {
        attrs = ' data-page="' + escAttr(it.page) + '"';
      }
      var badgePart =
        it.badge === 'stores'
          ? '<span class="nav-badge" aria-hidden="true" style="display:none">0</span>'
          : '';
      var lbl =
        typeof window.t === 'function' && it.labelKey
          ? window.t(it.labelKey)
          : it.label;
      html += '<button type="button" class="nav-item" data-nav="' + escAttr(it.id) + '"' + attrs + onclick + '>' +
        '<span class="nav-pip" aria-hidden="true"></span>' +
        '<span class="nav-ico">' + it.icon + '</span>' +
        '<span class="nav-lbl">' + String(lbl).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
        badgePart +
        '</button>';
    }
    navEl.innerHTML = html;

    // Mark active based on currently visible page
    var activePage = document.querySelector('.page.active');
    if (activePage) updateNavActive(activePage.id);
    try {
      var ap = document.querySelector('.page.active');
      document.body.setAttribute('data-patrol-active-page', ap ? ap.id : '');
    } catch (eSync) {}
  }

  // ── Exec splash + observer mode ──────────────────────────────────
  function handleExecRoute() {
    enableObserverMode();
  }

  function redirectToHq() {
    // Clear any splash timer before navigating so the interval doesn't
    // re-fire during the redirect.
    var splash = document.getElementById('exec-splash');
    if (splash && splash._timerId) clearInterval(splash._timerId);
    if (typeof window.toast === 'function') {
      window.toast('HQ access is temporarily on hold.');
    } else if (typeof window.alert === 'function') {
      window.alert('HQ access is temporarily on hold.');
    }
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

  /**
   * DSM/RSM/CEO 6-tab bar can exceed viewport width (long i18n labels, badges).
   * overflow-x:auto lets users pan — but WebViews often start scrolled to x=0, so
   * Visit/Sales/Leaders look "missing" until they discover horizontal scroll.
   * After every active-tab change, center the active button in the strip so the
   * current tab is always visible (mitigates the recurring "can't see those tabs" report).
   */
  function scrollActiveBottomNavTabIntoView() {
    var bar = document.getElementById('bottom-nav');
    if (!bar) return;
    var activeBtn = bar.querySelector('.nav-item.active');
    if (!activeBtn || typeof activeBtn.scrollIntoView !== 'function') return;
    try {
      activeBtn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
    } catch (_e) {}
  }

  function updateNavActive(pageId) {
    var btns = document.querySelectorAll('#bottom-nav .nav-item');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.remove('active');
      var dp = btns[i].getAttribute('data-page');
      if (dp && dp === pageId) {
        btns[i].classList.add('active');
      }
    }
    scrollActiveBottomNavTabIntoView();
  }

  // ── More bottom sheet (DSM / RSM) ────────────────────────────────
  function openMoreSheet() {
    var items = [
      { icon: '\ud83d\udc64', labelKey: 'nav.sheet_profile', label: 'Profile', page: 'page-profile' },
      { icon: '\ud83d\udcdd', labelKey: 'nav.sheet_visits', label: 'Log Visit', action: 'logVisit' },
      { icon: '\ud83d\udc65', labelKey: 'nav.sheet_team', label: 'Team', page: 'page-team' },
      { icon: '\ud83d\uddfa\ufe0f', labelKey: 'nav.sheet_map', label: 'Map', page: 'page-map' },
      { icon: '\ud83d\udeaa', labelKey: 'nav.sheet_logout', label: 'Logout', action: 'logout' }
    ];

    var sheet = document.getElementById('more-sheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'more-sheet';
      sheet.className = 'more-sheet';
      document.body.appendChild(sheet);
    }

    var itemHtml = '';
    var moreTitle = typeof window.t === 'function' ? window.t('nav.more') : 'More';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var onclickAttr;
      if (it.action === 'logVisit') {
        onclickAttr = "closeMoreSheet();if(typeof window.openVisitFlow==='function')window.openVisitFlow();else if(typeof window.nav==='function')window.nav('page-stores')";
      } else if (it.action === 'logout') {
        onclickAttr = 'closeMoreSheet();if(typeof logout===\'function\')logout()';
      } else {
        onclickAttr = "navTo('" + escAttr(it.page) + "');closeMoreSheet()";
      }
      var lbl =
        typeof window.t === 'function' && it.labelKey
          ? window.t(it.labelKey)
          : it.label;
      itemHtml += '<div class="more-sheet-item" onclick="' + onclickAttr + '">' +
        '<span class="more-sheet-ico">' + it.icon + '</span>' +
        '<span>' + escHtml(lbl) + '</span>' +
      '</div>';
    }

    sheet.innerHTML =
      '<div class="more-sheet-backdrop" onclick="closeMoreSheet()"></div>' +
      '<div class="more-sheet-panel" role="dialog" aria-label="' + escAttr(moreTitle) + '">' +
        '<div class="more-sheet-handle"></div>' +
        '<div class="more-sheet-title">' + escHtml(moreTitle) + '</div>' +
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

  window.addEventListener('patrol:locale-changed', function () {
    setTimeout(renderNav, 0);
  });
})();

// UX Polish Module — Action sheet, Onboarding, Empty states
// Phase F: TSR-friendly features for low-tech Filipino field workers

// ============================================================
// F.1 — LONG-PRESS ACTION SHEET
// 500ms touch hold on store rows shows quick actions
// ============================================================

var _longPressTimer = null;
var _longPressStoreId = null;
var _longPressTouchMoved = false;

function initLongPress() {
  // Delegate from store list container
  var listEl = document.getElementById('storesList') || document.getElementById('store-list');
  if (!listEl) return;

  listEl.addEventListener('touchstart', function(e) {
    var row = e.target.closest('.store-row');
    if (!row) return;
    _longPressTouchMoved = false;
    _longPressStoreId = row.getAttribute('data-store-id');
    _longPressTimer = setTimeout(function() {
      if (!_longPressTouchMoved && _longPressStoreId) {
        e.preventDefault();
        _showActionSheet(_longPressStoreId);
      }
    }, 500);
  }, { passive: false });

  listEl.addEventListener('touchmove', function() {
    _longPressTouchMoved = true;
    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
  });

  listEl.addEventListener('touchend', function() {
    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
  });

  listEl.addEventListener('touchcancel', function() {
    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
  });

  // Desktop: right-click
  listEl.addEventListener('contextmenu', function(e) {
    var row = e.target.closest('.store-row');
    if (!row) return;
    e.preventDefault();
    var storeId = row.getAttribute('data-store-id');
    if (storeId) _showActionSheet(storeId);
  });
}

function _showActionSheet(storeId) {
  // Find store data from cache
  var store = null;
  if (typeof _storeCache !== 'undefined') {
    for (var i = 0; i < _storeCache.length; i++) {
      if (_storeCache[i].id === storeId) { store = _storeCache[i]; break; }
    }
  }

  var overlay = document.getElementById('action-sheet-overlay');
  var sheet = document.getElementById('action-sheet');
  var title = document.getElementById('action-sheet-title');

  if (!overlay || !sheet) return;

  title.textContent = store ? store.name : 'Store';

  // Store reference for actions
  sheet.setAttribute('data-store-id', storeId);
  sheet.setAttribute('data-store-phone', (store && store.phone) || '');
  sheet.setAttribute('data-store-lat', (store && store.lat) || '');
  sheet.setAttribute('data-store-lng', (store && store.lng) || '');

  overlay.classList.add('visible');

  // Haptic feedback if available
  if (navigator.vibrate) navigator.vibrate(30);
}

function closeActionSheet() {
  var overlay = document.getElementById('action-sheet-overlay');
  if (overlay) overlay.classList.remove('visible');
}

function actionSheetCall() {
  var sheet = document.getElementById('action-sheet');
  var phone = sheet.getAttribute('data-store-phone');
  closeActionSheet();
  if (phone) {
    window.location.href = 'tel:' + phone;
  }
}

function actionSheetDirections() {
  var sheet = document.getElementById('action-sheet');
  var lat = sheet.getAttribute('data-store-lat');
  var lng = sheet.getAttribute('data-store-lng');
  closeActionSheet();
  if (lat && lng) {
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng, '_blank');
  }
}

function actionSheetMarkVisited() {
  var sheet = document.getElementById('action-sheet');
  var storeId = sheet.getAttribute('data-store-id');
  closeActionSheet();
  if (storeId) {
    // Open visit wizard for this store
    var store = null;
    if (typeof _storeCache !== 'undefined') {
      for (var i = 0; i < _storeCache.length; i++) {
        if (_storeCache[i].id === storeId) { store = _storeCache[i]; break; }
      }
    }
    if (store && typeof openVisitWizard === 'function') {
      openVisitWizard(storeId, store.name);
    }
  }
}

// ============================================================
// F.2 — ONBOARDING WALKTHROUGH (first login only)
// 3 screens, full-screen overlay, skip button, localStorage flag
// ============================================================

function checkOnboarding() {
  if (localStorage.getItem('patrol_onboarding_done') === '1') return;

  var overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  overlay.style.display = 'flex';
  _showOnboardingScreen(1);
}

var _onboardingScreen = 1;

function _showOnboardingScreen(n) {
  _onboardingScreen = n;
  for (var i = 1; i <= 3; i++) {
    var scr = document.getElementById('onboard-screen-' + i);
    if (scr) scr.style.display = (i === n) ? 'flex' : 'none';
  }
  // Update dots
  var dots = document.querySelectorAll('.onboard-dot');
  for (var j = 0; j < dots.length; j++) {
    dots[j].className = 'onboard-dot' + (j === n - 1 ? ' active' : '');
  }
}

function onboardingNext() {
  if (_onboardingScreen < 3) {
    _showOnboardingScreen(_onboardingScreen + 1);
  } else {
    onboardingDone();
  }
}

function onboardingDone() {
  localStorage.setItem('patrol_onboarding_done', '1');
  var overlay = document.getElementById('onboarding-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(function() { overlay.style.display = 'none'; overlay.style.opacity = '1'; }, 300);
  }
}

// ============================================================
// F.3 — EMPTY STATE (called from stores.js when list is empty)
// Already wired in renderStoreList() — this provides the HTML
// ============================================================

function getEmptyStoreStateHTML() {
  return '<div style="text-align:center;padding:48px 24px">' +
    '<div style="font-size:64px;margin-bottom:16px">\ud83c\udfea</div>' +
    '<div style="font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:8px">' +
      'Wala pang tindahan sa listahan mo' +
    '</div>' +
    '<div style="font-size:14px;color:var(--text-secondary);line-height:1.5">' +
      'Makipag-ugnayan sa iyong DSM para ma-assign ang mga tindahan sa iyo.' +
    '</div>' +
    '<div style="margin-top:20px">' +
      '<button class="big-button" style="width:auto;display:inline-flex;padding:14px 28px" onclick="openChatbotStore()">' +
        '+ Mag-register ng bagong tindahan' +
      '</button>' +
    '</div>' +
  '</div>';
}

// ============================================================
// F.4 — SYNC DATA USAGE TOAST
// Shows once per session after first successful Supabase sync
// Reassures TSRs they're not burning data
// ============================================================

var _syncToastShown = false;

function _wrapSyncWithToast() {
  if (typeof syncPending !== 'function') return;
  var _origSync = syncPending;
  syncPending = function () {
    return _origSync.apply(this, arguments).then(function (results) {
      if (!_syncToastShown && (results.visits > 0 || results.stores > 0)) {
        _syncToastShown = true;
        var total = results.visits + results.stores;
        var est = total * 2; // ~2KB per record estimate
        var toast = document.createElement('div');
        toast.className = 'data-usage-toast';
        toast.textContent = '\u2705 Na-sync na! Ginamit: ~' + est + 'KB lang (' + total + ' record' + (total > 1 ? 's' : '') + ')';
        document.body.appendChild(toast);
        setTimeout(function () { toast.classList.add('visible'); }, 50);
        setTimeout(function () {
          toast.classList.remove('visible');
          setTimeout(function () { toast.remove(); }, 400);
        }, 4000);
      }
      return results;
    });
  };
}

// ============================================================
// INIT — call from app.html after page load
// ============================================================

function initUXPolish() {
  initLongPress();
  checkOnboarding();
  _wrapSyncWithToast();
}

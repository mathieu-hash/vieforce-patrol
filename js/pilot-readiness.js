// Pilot readiness helpers: GPS/camera setup, sync visibility, and support diagnostics.

(function () {
  'use strict';

  var READY_KEY = 'patrol_readiness_done';
  var CAMERA_KEY = 'patrol_camera_test_ok';
  var SHEET_ID = 'pilot-readiness-sheet';
  var SUPPORT_ID = 'pilot-support-sheet';

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s == null ? '' : String(s)));
    return d.innerHTML;
  }

  function injectStyles() {
    if ($('pilot-readiness-style')) return;
    var style = document.createElement('style');
    style.id = 'pilot-readiness-style';
    style.textContent =
      '.pilot-sheet{position:fixed;inset:0;z-index:6200;display:none;align-items:flex-end;background:rgba(0,0,0,.38)}' +
      '.pilot-sheet.visible{display:flex}' +
      '.pilot-panel{width:100%;max-width:520px;margin:0 auto;background:var(--bg,#fff);border-radius:18px 18px 0 0;box-shadow:0 -8px 32px rgba(0,0,0,.2);padding:18px 16px 22px;max-height:86vh;overflow:auto}' +
      '.pilot-handle{width:42px;height:4px;border-radius:3px;background:#d8dee8;margin:0 auto 14px}' +
      '.pilot-title{font-size:18px;font-weight:800;color:var(--text-primary,#111);margin-bottom:4px}' +
      '.pilot-sub{font-size:13px;line-height:1.45;color:var(--text-secondary,#666);margin-bottom:14px}' +
      '.pilot-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid rgba(120,130,150,.18)}' +
      '.pilot-row-main{min-width:0}.pilot-row-title{font-size:14px;font-weight:800;color:var(--text-primary,#111)}' +
      '.pilot-row-sub{font-size:12px;color:var(--text-secondary,#666);line-height:1.35;margin-top:3px}' +
      '.pilot-chip{font-size:11px;font-weight:800;border-radius:999px;padding:5px 9px;white-space:nowrap;background:#eef2f7;color:#4a5568;border:0}' +
      '.pilot-chip.ok{background:#e7f7ed;color:#157347}.pilot-chip.warn{background:#fff4d8;color:#8a5b00}.pilot-chip.err{background:#ffe5ed;color:#b4235a}' +
      '.pilot-btn-row{display:flex;gap:8px;margin-top:14px}.pilot-btn{border:0;border-radius:10px;padding:12px 14px;font-weight:800;font-size:13px;cursor:pointer;min-height:46px}' +
      '.pilot-btn.primary{background:var(--accent,#00A6CE);color:#fff;flex:1}.pilot-btn.secondary{background:#fff;color:var(--text-primary,#111);border:1px solid #d9e1ea;flex:1}' +
      '.pilot-card{margin:0 12px 12px;padding:14px;border:1px solid rgba(120,130,150,.18);border-radius:12px;background:var(--card-bg,#fff)}' +
      '.pilot-card-title{font-size:13px;font-weight:800;color:var(--text-primary,#111);margin-bottom:6px}.pilot-card-sub{font-size:12px;color:var(--text-secondary,#666);line-height:1.4;margin-bottom:10px}' +
      '.pilot-status-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px}.pilot-status-cell{background:#f7fafc;border-radius:10px;padding:10px 8px;text-align:center}' +
      '.pilot-status-val{font-size:20px;font-weight:900;color:var(--accent-dark,#004d71)}.pilot-status-lbl{font-size:10px;text-transform:uppercase;color:#718096;font-weight:800}' +
      '.pilot-diag{font:11px/1.5 ui-monospace,Consolas,monospace;background:#0b1220;color:#e6edf7;border-radius:10px;padding:12px;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto}';
    document.head.appendChild(style);
  }

  async function syncBreakdown() {
    var out = { visits: 0, stores: 0, farms: 0, pending: 0 };
    try {
      if (window.offlineDb) {
        out.visits = window.offlineDb.pendingVisits ? await window.offlineDb.pendingVisits.count() : 0;
        out.stores = window.offlineDb.pendingStores ? await window.offlineDb.pendingStores.count() : 0;
        out.farms = window.offlineDb.pendingFarms ? await window.offlineDb.pendingFarms.count() : 0;
        out.pending = out.visits + out.stores + out.farms;
        return out;
      }
      if (typeof getSyncStatus === 'function') {
        var st = await getSyncStatus();
        out.pending = st.pending || 0;
      }
    } catch (_) {}
    return out;
  }

  function sheetShell(id, inner) {
    var el = $(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'pilot-sheet';
      el.addEventListener('click', function (ev) {
        if (ev.target === el) closeSheet(id);
      });
      document.body.appendChild(el);
    }
    el.innerHTML = '<div class="pilot-panel" onclick="event.stopPropagation()">' + inner + '</div>';
    return el;
  }

  function openSheet(id) {
    var el = $(id);
    if (el) el.classList.add('visible');
  }

  function closeSheet(id) {
    var el = $(id);
    if (el) el.classList.remove('visible');
  }

  async function readinessRows() {
    var gpsState = typeof getGpsReadyState === 'function'
      ? getGpsReadyState()
      : { ready: false, cached: null, supported: !!navigator.geolocation };
    var perm = typeof getGpsPermissionState === 'function' ? await getGpsPermissionState() : 'unknown';
    var cameraOk = false;
    try { cameraOk = localStorage.getItem(CAMERA_KEY) === '1'; } catch (_) {}
    var sync = await syncBreakdown();

    var gpsClass = gpsState.ready ? 'ok' : (perm === 'denied' ? 'err' : 'warn');
    var gpsText = gpsState.ready ? 'Ready' : (perm === 'denied' ? 'Blocked' : 'Needs test');
    var gpsSub = gpsState.ready && gpsState.cached
      ? 'Last GPS: ' + Number(gpsState.cached.lat).toFixed(4) + ', ' + Number(gpsState.cached.lng).toFixed(4)
      : (perm === 'denied' ? 'Enable Location for this site in browser settings.' : 'Tap Test GPS once while outside or near a window.');

    return '' +
      '<div class="pilot-row">' +
        '<div class="pilot-row-main"><div class="pilot-row-title">GPS access</div><div class="pilot-row-sub" id="pilot-gps-sub">' + esc(gpsSub) + '</div></div>' +
        '<button type="button" class="pilot-chip ' + gpsClass + '" onclick="patrolTestGps()">' + esc(gpsText) + '</button>' +
      '</div>' +
      '<div class="pilot-row">' +
        '<div class="pilot-row-main"><div class="pilot-row-title">Camera</div><div class="pilot-row-sub" id="pilot-camera-sub">' + (cameraOk ? 'Camera test passed on this phone.' : 'Tap Test Camera once. Cancel is okay if you are only checking the prompt.') + '</div></div>' +
        '<button type="button" class="pilot-chip ' + (cameraOk ? 'ok' : 'warn') + '" onclick="patrolTestCamera()">' + (cameraOk ? 'Ready' : 'Test') + '</button>' +
      '</div>' +
      '<div class="pilot-row">' +
        '<div class="pilot-row-main"><div class="pilot-row-title">Offline sync</div><div class="pilot-row-sub">Visits ' + sync.visits + ' / stores ' + sync.stores + ' / farms ' + sync.farms + '</div></div>' +
        '<span class="pilot-chip ' + (sync.pending ? 'warn' : 'ok') + '">' + (sync.pending ? sync.pending + ' pending' : 'Clear') + '</span>' +
      '</div>';
  }

  async function renderReadinessSheet() {
    injectStyles();
    var inner =
      '<div class="pilot-handle"></div>' +
      '<div class="pilot-title">Field test setup</div>' +
      '<div class="pilot-sub">Do this once before the first customer visit. It keeps GPS, camera, and offline sync predictable in the field.</div>' +
      '<div id="pilot-readiness-rows">' + await readinessRows() + '</div>' +
      '<div class="pilot-btn-row">' +
        '<button type="button" class="pilot-btn secondary" onclick="patrolOpenSupportPanel()">Support</button>' +
        '<button type="button" class="pilot-btn primary" onclick="patrolFinishReadiness()">Ready</button>' +
      '</div>';
    sheetShell(SHEET_ID, inner);
  }

  async function refreshReadinessRows() {
    var rows = $('pilot-readiness-rows');
    if (rows) rows.innerHTML = await readinessRows();
    updateProfilePilotCard();
  }

  window.patrolTestGps = async function () {
    var sub = $('pilot-gps-sub');
    if (sub) sub.textContent = 'Getting GPS...';
    var pos = typeof primeGps === 'function'
      ? await primeGps({ timeout: 15000, allowCached: false })
      : (typeof getCurrentPosition === 'function' ? await getCurrentPosition({ timeout: 15000 }) : null);
    if (sub) {
      sub.textContent = pos
        ? 'GPS ready: ' + Number(pos.lat).toFixed(4) + ', ' + Number(pos.lng).toFixed(4) + ' accuracy ' + Math.round(pos.accuracy || 0) + 'm'
        : 'GPS not available. Check browser Location permission and try outside.';
    }
    await refreshReadinessRows();
    return pos;
  };

  window.patrolTestCamera = async function () {
    var sub = $('pilot-camera-sub');
    if (sub) sub.textContent = 'Opening camera...';
    try {
      var blob = typeof capturePhoto === 'function' ? await capturePhoto() : null;
      if (blob) {
        try { localStorage.setItem(CAMERA_KEY, '1'); } catch (_) {}
        if (sub) sub.textContent = 'Camera ready. Photo test captured.';
      } else if (sub) {
        sub.textContent = 'Camera prompt opened. Capture was cancelled.';
      }
    } catch (err) {
      if (sub) sub.textContent = 'Camera failed: ' + ((err && err.message) || String(err));
    }
    await refreshReadinessRows();
  };

  window.patrolFinishReadiness = function () {
    try { localStorage.setItem(READY_KEY, '1'); } catch (_) {}
    closeSheet(SHEET_ID);
  };

  window.patrolOpenReadiness = async function () {
    await renderReadinessSheet();
    openSheet(SHEET_ID);
  };

  async function diagnosticText() {
    var s = typeof getSession === 'function' ? getSession() : null;
    var sync = await syncBreakdown();
    var gps = typeof getGpsReadyState === 'function' ? getGpsReadyState() : {};
    var perm = typeof getGpsPermissionState === 'function' ? await getGpsPermissionState() : 'unknown';
    return [
      'VieForce Patrol diagnostics',
      'Time: ' + new Date().toISOString(),
      'Version: ' + ((window.CONFIG && CONFIG.VERSION) || 'unknown'),
      'URL: ' + location.href,
      'Online: ' + (navigator.onLine ? 'yes' : 'no'),
      'User: ' + (s ? (s.name + ' / ' + s.role + ' / ' + s.id) : 'none'),
      'GPS permission: ' + perm,
      'GPS ready: ' + (gps.ready ? 'yes' : 'no'),
      'GPS cached: ' + (gps.cached ? (gps.cached.lat + ',' + gps.cached.lng + ' acc=' + gps.cached.accuracy) : 'none'),
      'Pending visits: ' + sync.visits,
      'Pending stores: ' + sync.stores,
      'Pending farms: ' + sync.farms
    ].join('\n');
  }

  window.patrolOpenSupportPanel = async function () {
    injectStyles();
    var text = await diagnosticText();
    var inner =
      '<div class="pilot-handle"></div>' +
      '<div class="pilot-title">Support check</div>' +
      '<div class="pilot-sub">Use this when a tester says GPS, camera, login, or sync feels wrong.</div>' +
      '<div class="pilot-diag" id="pilot-diag-text">' + esc(text) + '</div>' +
      '<div class="pilot-btn-row">' +
        '<button type="button" class="pilot-btn secondary" onclick="patrolOpenReadiness()">Setup</button>' +
        '<button type="button" class="pilot-btn secondary" onclick="patrolCopyDiagnostics()">Copy</button>' +
        '<button type="button" class="pilot-btn primary" onclick="patrolCloseSupportPanel()">Close</button>' +
      '</div>';
    sheetShell(SUPPORT_ID, inner);
    openSheet(SUPPORT_ID);
  };

  window.patrolCloseSupportPanel = function () {
    closeSheet(SUPPORT_ID);
  };

  window.patrolCopyDiagnostics = async function () {
    var text = await diagnosticText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch (_) {}
    var box = $('pilot-diag-text');
    if (box) box.textContent = text + '\n\nCopied if clipboard permission is available.';
  };

  async function updateProfilePilotCard() {
    var card = $('pilot-profile-card');
    if (!card) return;
    var gps = typeof getGpsReadyState === 'function' ? getGpsReadyState() : {};
    var sync = await syncBreakdown();
    var cameraOk = false;
    try { cameraOk = localStorage.getItem(CAMERA_KEY) === '1'; } catch (_) {}
    var gpsVal = $('pilot-profile-gps');
    var camVal = $('pilot-profile-camera');
    var syncVal = $('pilot-profile-sync');
    if (gpsVal) gpsVal.textContent = gps.ready ? 'OK' : 'Test';
    if (camVal) camVal.textContent = cameraOk ? 'OK' : 'Test';
    if (syncVal) syncVal.textContent = sync.pending ? String(sync.pending) : '0';
  }

  function injectProfileCard() {
    if ($('pilot-profile-card')) return;
    var host = $('profileSettingsOwn');
    if (!host) return;
    var card = document.createElement('div');
    card.id = 'pilot-profile-card';
    card.className = 'pilot-card';
    card.innerHTML =
      '<div class="pilot-card-title">Field readiness</div>' +
      '<div class="pilot-card-sub">Quick checks for GPS, camera, and pending sync before visits.</div>' +
      '<div class="pilot-status-grid">' +
        '<div class="pilot-status-cell"><div class="pilot-status-val" id="pilot-profile-gps">--</div><div class="pilot-status-lbl">GPS</div></div>' +
        '<div class="pilot-status-cell"><div class="pilot-status-val" id="pilot-profile-camera">--</div><div class="pilot-status-lbl">Camera</div></div>' +
        '<div class="pilot-status-cell"><div class="pilot-status-val" id="pilot-profile-sync">--</div><div class="pilot-status-lbl">Pending</div></div>' +
      '</div>' +
      '<div class="pilot-btn-row">' +
        '<button type="button" class="pilot-btn secondary" onclick="patrolOpenSupportPanel()">Support</button>' +
        '<button type="button" class="pilot-btn primary" onclick="patrolOpenReadiness()">Check phone</button>' +
      '</div>';
    var langCard = $('patrol-lang-settings-card');
    if (langCard && langCard.parentNode === host) {
      host.insertBefore(card, langCard);
    } else {
      host.insertBefore(card, host.firstChild);
    }
    updateProfilePilotCard();
  }

  async function maybeShowReadiness() {
    try {
      if (window.__PATROL_E2E) return;
      if (localStorage.getItem(READY_KEY) === '1') return;
      if (!getSession || !getSession()) return;
      if (localStorage.getItem('patrol_onboarding_done') !== '1') return;
    } catch (_) {
      return;
    }
    setTimeout(function () { window.patrolOpenReadiness(); }, 800);
  }

  window.patrolMaybeShowReadiness = maybeShowReadiness;
  window.patrolUpdatePilotCard = updateProfilePilotCard;

  function init() {
    injectStyles();
    injectProfileCard();
    maybeShowReadiness();
    setInterval(updateProfilePilotCard, 15000);
    window.addEventListener('online', updateProfilePilotCard);
    window.addEventListener('offline', updateProfilePilotCard);
    if (typeof primeGps === 'function') {
      try {
        if (localStorage.getItem('patrol_gps_ready') === '1') {
          primeGps({ timeout: 6000, allowCached: true });
        }
      } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

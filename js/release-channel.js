/**
 * Beta / release channel UI — runs after config.js.
 * Set CONFIG.RELEASE_CHANNEL to 'stable' to turn this off.
 */
(function () {
  'use strict';
  var C = window.CONFIG || {};
  var ch = String(C.RELEASE_CHANNEL || 'stable').toLowerCase();
  if (ch !== 'beta') return;

  document.documentElement.setAttribute('data-release', 'beta');

  var ver = C.VERSION ? String(C.VERSION) : '';
  var suffix = ' (Beta)';
  if (document.title && document.title.indexOf('(Beta)') === -1) {
    document.title = document.title.replace(/\s*$/, '') + suffix;
  }

  var css =
    '#patrol-beta-bar{' +
    'box-sizing:border-box;width:100%;margin:0;padding:8px 36px 8px 12px;' +
    'font-family:Montserrat,system-ui,sans-serif;font-size:12px;font-weight:600;' +
    'line-height:1.4;text-align:center;background:linear-gradient(90deg,#f6ad55,#ed8936);' +
    'color:#1a202c;border-bottom:1px solid rgba(0,0,0,0.08);' +
    'position:sticky;top:0;z-index:999999;display:flex;align-items:center;' +
    'justify-content:center;gap:8px;flex-wrap:wrap;' +
    '}' +
    '#patrol-beta-bar .patrol-beta-tag{' +
    'font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:11px;' +
    'background:rgba(0,0,0,.12);padding:2px 8px;border-radius:4px;' +
    '}' +
    '#patrol-beta-bar button{' +
    'position:absolute;right:8px;top:50%;transform:translateY(-50%);' +
    'border:none;background:transparent;color:#1a202c;font-size:18px;' +
    'line-height:1;cursor:pointer;padding:4px 8px;border-radius:4px;' +
    'opacity:.75;font-weight:700;' +
    '}' +
    '#patrol-beta-bar button:hover{opacity:1;background:rgba(255,255,255,.25);}';

  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var dismissed = false;
  try {
    dismissed = sessionStorage.getItem('patrol_beta_banner_dismiss') === '1';
  } catch (_e) {}

  if (!dismissed) {
    var bar = document.createElement('div');
    bar.id = 'patrol-beta-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Beta program notice');
    var msg = document.createElement('span');
    msg.innerHTML =
      '<span class="patrol-beta-tag">Beta</span> ' +
      '<span>Internal testing build' +
      (ver ? ' · v' + escapeHtml(ver) : '') +
      ' · Not for external rollout.</span>';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Hide beta notice');
    btn.appendChild(document.createTextNode('\u00d7'));
    btn.addEventListener('click', function () {
      bar.remove();
      try {
        sessionStorage.setItem('patrol_beta_banner_dismiss', '1');
      } catch (_e2) {}
    });

    bar.appendChild(msg);
    bar.appendChild(btn);

    if (document.body) {
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  var foot = document.querySelector('.login-footer');
  if (foot && ver) {
    foot.textContent = 'v' + ver + ' (beta) — Vienovo Philippines Inc.';
  }

  // Delegates to canonical PatrolEscape.escapeHtml (js/_util/escape.js).
  function escapeHtml(s) {
    return (typeof PatrolEscape !== 'undefined') ? PatrolEscape.escapeHtml(s) : String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();

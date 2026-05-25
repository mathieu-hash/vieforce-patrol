// js/_util/error-reporter.js
// Thin error-collector for VieForce Patrol beta channel.
//
// Why custom and not Sentry browser SDK?
//   - Sentry SDK = ~50-70KB. CLAUDE.md Rule 2 caps app bundle at <500KB.
//   - DSN field exists in config.js for future Sentry migration; until then
//     this collector POSTs to /api/log-error (Vercel function, see api/log-error.js).
//
// What it does (gated on CONFIG.RELEASE_CHANNEL === 'beta'):
//   - Captures `window.onerror` (uncaught exceptions)
//   - Captures `unhandledrejection` (promise failures)
//   - Mirrors `console.error` calls (does NOT replace the original)
//   - Tags user_id + role + version + url in every payload
//   - Rate-limits to 20 events/session to protect data budget
//   - Buffers + best-effort POST (silent failure; never blocks UI)
//
// Usage: load after config.js, anywhere in the shell. No init call needed.
(function (root) {
  'use strict';

  var C = root.CONFIG || {};
  var channel = String(C.RELEASE_CHANNEL || 'stable').toLowerCase();
  if (channel !== 'beta') return; // stable channel = no reporter

  var MAX_EVENTS_PER_SESSION = 20;
  var ENDPOINT = '/api/log-error';
  var sent = 0;

  function _currentUser() {
    try {
      var raw = localStorage.getItem('patrol_user');
      if (!raw) return null;
      var u = JSON.parse(raw);
      return { id: u && u.id, role: u && u.role, email: u && u.email };
    } catch (_e) { return null; }
  }

  function _basePayload() {
    var u = _currentUser();
    return {
      ts: new Date().toISOString(),
      version: C.VERSION || '',
      channel: channel,
      url: (typeof location !== 'undefined') ? String(location.pathname + location.search) : '',
      ua: (typeof navigator !== 'undefined') ? String(navigator.userAgent).slice(0, 200) : '',
      user_id: u && u.id,
      role: u && u.role,
      sentry_dsn_configured: !!C.SENTRY_DSN
    };
  }

  function _report(kind, detail) {
    if (sent >= MAX_EVENTS_PER_SESSION) return;
    sent++;
    var payload = _basePayload();
    payload.kind = kind;
    payload.detail = detail;
    try {
      // Use sendBeacon when available (survives page unload, off the critical path).
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () { /* silent */ });
      }
    } catch (_e) { /* never block UI on telemetry */ }
  }

  // 1. Uncaught JS exceptions
  root.addEventListener('error', function (ev) {
    _report('uncaught', {
      message: ev && ev.message,
      source: ev && ev.filename,
      line: ev && ev.lineno,
      col: ev && ev.colno,
      stack: ev && ev.error && ev.error.stack ? String(ev.error.stack).slice(0, 2000) : null
    });
  });

  // 2. Unhandled promise rejections
  root.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    _report('promise', {
      message: (r && r.message) || String(r),
      stack: (r && r.stack) ? String(r.stack).slice(0, 2000) : null
    });
  });

  // 3. Mirror console.error (do NOT replace — devs still see it in DevTools)
  var origErr = console.error;
  console.error = function () {
    try {
      var args = Array.prototype.slice.call(arguments).map(function (a) {
        if (a instanceof Error) return { message: a.message, stack: String(a.stack || '').slice(0, 2000) };
        if (typeof a === 'object') { try { return JSON.parse(JSON.stringify(a)); } catch (_e) { return String(a); } }
        return String(a);
      });
      _report('console.error', { args: args });
    } catch (_e) { /* swallow */ }
    return origErr.apply(console, arguments);
  };

  // Expose a tiny manual capture API for explicit calls.
  root.PatrolErrorReporter = {
    capture: function (msg, extra) { _report('manual', { message: String(msg), extra: extra || null }); },
    isEnabled: function () { return true; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

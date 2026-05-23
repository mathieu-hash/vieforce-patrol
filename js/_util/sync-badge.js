// js/_util/sync-badge.js
// Single source of truth for rendering the sync state badge.
// Consumes getSyncState() from js/offline.js (W2-RetryClassify contract).
//
// CLAUDE.md Rule 7 (TSR sync status truth — pilot non-negotiable):
//   The badge MUST NEVER show green "Naka-sync na ✓" while navigator.onLine
//   is false. Pre-Wave-2 code did exactly that in 3 places:
//     - js/home-tsr.js:466-468  (tsrSyncPill)
//     - js/stores.js:610-612    (tindahanSyncPill)
//     - js/visits.js:526-530    (global-sync-bar via enhancedSyncStatus)
//   All 3 derived "synced" from navigator.onLine instead of the real queue
//   state. Audit D O2 + O6, Audit A top-must-fix #2.
//
// Contract (from W2-RetryClassify):
//   getSyncState() -> {
//     onLine: boolean,
//     pending: number,
//     syncing: boolean,
//     quarantined: number,
//     lastError: { message, classification, at } | null,
//   }
//   offline.on('state', listener)  -- optional event source
//
// Until W2-RetryClassify lands the full contract, we degrade gracefully:
//   - If getSyncState() is missing, we synthesise from getSyncStatus() +
//     navigator.onLine (legacy shape).
//   - If offline.on() is missing, we fall back to 1s polling.

(function (root) {
  'use strict';

  // ─── State derivation (pure, no DOM, no globals) ────────────────────────
  // Render-priority order (top wins):
  //   1) quarantined > 0  → red (override everything; admin attention required)
  //   2) onLine === false → orange offline (with or without pending)
  //   3) syncing === true → blue/syncing
  //   4) pending > 0      → orange next-attempt
  //   5) default          → green synced
  //
  // CRITICAL: state 5 (green) is reachable ONLY when onLine && pending===0
  //           && !syncing && quarantined===0. This is the Rule-7 guard.
  function deriveBadgeView(state, t) {
    var s = state || {};
    var pending = Number(s.pending) || 0;
    var quarantined = Number(s.quarantined) || 0;
    var onLine = !!s.onLine;
    var syncing = !!s.syncing;

    var _t = typeof t === 'function' ? t : function (k, v) {
      // No-i18n fallback (used in tests or pre-i18n boot)
      if (v && typeof v.n !== 'undefined') return k + ' ' + v.n;
      return k;
    };

    // 1) Quarantine — admin-required, beats everything else.
    if (quarantined > 0) {
      return {
        kind: 'quarantined',
        className: 'sync-badge sync-quarantined',
        barClassName: 'sync-bar sync-error',
        label: _t('sync.quarantined', { n: quarantined }),
        ariaLive: 'assertive',
        pending: pending,
        quarantined: quarantined,
      };
    }

    // 2) Offline (with or without pending).
    if (!onLine) {
      if (pending > 0) {
        return {
          kind: 'offlinePending',
          className: 'sync-badge sync-offline',
          barClassName: 'sync-bar sync-offline',
          label: _t('sync.offlinePending', { n: pending }),
          ariaLive: 'polite',
          pending: pending,
          quarantined: 0,
        };
      }
      return {
        kind: 'offline',
        className: 'sync-badge sync-offline',
        barClassName: 'sync-bar sync-offline',
        label: _t('sync.offline'),
        ariaLive: 'polite',
        pending: 0,
        quarantined: 0,
      };
    }

    // 3) Currently syncing.
    if (syncing) {
      return {
        kind: 'syncing',
        className: 'sync-badge sync-syncing',
        barClassName: 'sync-bar sync-working',
        label: _t('sync.syncing'),
        ariaLive: 'polite',
        pending: pending,
        quarantined: 0,
      };
    }

    // 4) Online but pending records queued (waiting for next attempt).
    if (pending > 0) {
      return {
        kind: 'nextAttempt',
        className: 'sync-badge sync-pending',
        barClassName: 'sync-bar sync-working',
        label: _t('sync.nextAttempt'),
        ariaLive: 'polite',
        pending: pending,
        quarantined: 0,
      };
    }

    // 5) All clear — green tick. Only path that shows "Synced ✓".
    return {
      kind: 'synced',
      className: 'sync-badge sync-ok',
      barClassName: 'sync-bar sync-ok',
      label: _t('sync.synced'),
      ariaLive: 'polite',
      pending: 0,
      quarantined: 0,
    };
  }

  // ─── State source ───────────────────────────────────────────────────────
  // Read from window.offlineSyncState (W2-RetryClassify export) if present,
  // else synthesise from the legacy getSyncStatus()+navigator.onLine pair.
  function readState() {
    if (typeof root.getSyncState === 'function') {
      try { return root.getSyncState(); } catch (_e) { /* fall through */ }
    }
    // Legacy synthesis.
    var pending = 0;
    var quarantined = 0;
    if (root._lastSyncSummary && typeof root._lastSyncSummary.ejected === 'number') {
      quarantined = root._lastSyncSummary.ejected;
    }
    // getSyncStatus is async; surfacing async into the legacy renderer is
    // costly so we read a cached value if the host exposes one. Otherwise
    // the host (sync-badge consumer) should call update() with an
    // explicit state object.
    if (root._patrolSyncCache && typeof root._patrolSyncCache.pending === 'number') {
      pending = root._patrolSyncCache.pending;
      if (typeof root._patrolSyncCache.quarantined === 'number') {
        quarantined = root._patrolSyncCache.quarantined;
      }
    }
    var onLine = (typeof navigator !== 'undefined') ? !!navigator.onLine : true;
    return {
      onLine: onLine,
      pending: pending,
      syncing: !!root._syncInProgress,
      quarantined: quarantined,
      lastError: null,
    };
  }

  // Async version — consults Dexie for an authoritative pending count if
  // available. Used by the polling fallback so the badge stays truthful
  // even when the W2-RetryClassify event source isn't wired yet.
  function readStateAsync() {
    if (typeof root.getSyncState === 'function') {
      try {
        var v = root.getSyncState();
        // Allow getSyncState to return either a sync object or a Promise.
        return Promise.resolve(v);
      } catch (_e) { /* fall through */ }
    }
    if (typeof root.getSyncStatus === 'function') {
      try {
        return Promise.resolve(root.getSyncStatus()).then(function (legacy) {
          var onLine = (typeof navigator !== 'undefined') ? !!navigator.onLine : true;
          return {
            onLine: onLine,
            pending: (legacy && legacy.pending) || 0,
            syncing: !!root._syncInProgress,
            quarantined: (legacy && legacy.ejected) || 0,
            lastError: null,
          };
        });
      } catch (_e) { /* fall through */ }
    }
    return Promise.resolve(readState());
  }

  // ─── DOM application ────────────────────────────────────────────────────
  // Applies a derived view to a DOM target. Two modes:
  //   - target.dataset.syncBadgeMode === 'bar' → expects {icon,text} children
  //     (#sync-bar-icon, #sync-bar-text) — global-sync-bar layout
  //   - default                                → pill / single-text node
  function applyToDom(target, view) {
    if (!target) return;
    if (target.dataset && target.dataset.syncBadgeMode === 'bar') {
      // Bar mode — preserve children, only update className + inner text.
      target.className = view.barClassName;
      var doc = target.ownerDocument || (typeof document !== 'undefined' ? document : null);
      var iconEl = doc && doc.getElementById ? doc.getElementById('sync-bar-icon') : null;
      var textEl = doc && doc.getElementById ? doc.getElementById('sync-bar-text') : null;
      if (iconEl) iconEl.textContent = iconForKind(view.kind);
      if (textEl) textEl.textContent = stripLeadingGlyph(view.label);
      if (typeof target.setAttribute === 'function') {
        target.setAttribute('aria-live', view.ariaLive);
      }
      return;
    }
    // Pill mode — single text node with full label (glyph included).
    target.textContent = view.label;
    target.className = mergeClassNames(target.className, view.className);
    if (typeof target.setAttribute === 'function') {
      target.setAttribute('aria-live', view.ariaLive);
    }
  }

  function iconForKind(kind) {
    if (kind === 'synced') return '✓✓';            // ✓✓
    if (kind === 'syncing') return '↻';                 // ↻
    if (kind === 'nextAttempt') return '○';             // ○
    if (kind === 'offline') return '○';                 // ○
    if (kind === 'offlinePending') return '○';          // ○
    if (kind === 'quarantined') return '✗';             // ✗
    return '';
  }

  function stripLeadingGlyph(label) {
    // Locale strings include a leading glyph (●/○/✕) for pill rendering.
    // In bar mode the icon span carries the glyph separately, so strip
    // it from the text to avoid double-rendering.
    if (typeof label !== 'string') return label;
    return label.replace(/^[●○✗✓↻]+\s*/, '');
  }

  function mergeClassNames(existing, next) {
    // Replace any prior sync-* classes; preserve the rest.
    var existingClasses = String(existing || '').split(/\s+/).filter(function (c) {
      return c && c.indexOf('sync-') !== 0;
    });
    var nextClasses = String(next || '').split(/\s+/).filter(Boolean);
    return existingClasses.concat(nextClasses).join(' ').trim();
  }

  // ─── Mount API ──────────────────────────────────────────────────────────
  // mount(target, options?) → { unmount, refresh }
  //   target  — DOM node (pill or #global-sync-bar)
  //   options.mode      — 'pill' (default) | 'bar'
  //   options.pollMs    — fallback polling interval (default 1000)
  //   options.t         — i18n lookup (defaults to window.t)
  function mount(target, options) {
    if (!target) {
      return { unmount: function () {}, refresh: function () {} };
    }
    var opts = options || {};
    var mode = opts.mode || (target.id === 'global-sync-bar' ? 'bar' : 'pill');
    var pollMs = typeof opts.pollMs === 'number' ? opts.pollMs : 1000;
    var tFn = typeof opts.t === 'function' ? opts.t : (typeof root.t === 'function' ? root.t : null);

    if (target.dataset) target.dataset.syncBadgeMode = mode;

    var disposed = false;
    var pollId = null;
    var stateListener = null;
    var winOnline = null;
    var winOffline = null;

    function render() {
      if (disposed) return;
      readStateAsync().then(function (state) {
        if (disposed) return;
        var view = deriveBadgeView(state, tFn || root.t);
        applyToDom(target, view);
      }).catch(function () {
        // Last-ditch — never throw out of the badge.
        var view = deriveBadgeView(readState(), tFn || root.t);
        applyToDom(target, view);
      });
    }

    // Subscribe to the event source if available; else poll.
    var src = (root.offline && typeof root.offline.on === 'function') ? root.offline : null;
    if (!src && root.offlineSyncState && typeof root.offlineSyncState.on === 'function') {
      src = root.offlineSyncState;
    }
    if (src) {
      stateListener = function () { render(); };
      try { src.on('state', stateListener); } catch (_e) { src = null; }
    }
    if (!src && pollMs > 0) {
      pollId = setInterval(render, pollMs);
    }

    // Browser online/offline events flip state instantly — render eagerly
    // so the user sees the truth without waiting for the next poll tick.
    if (typeof root.addEventListener === 'function') {
      winOnline = function () { render(); };
      winOffline = function () { render(); };
      root.addEventListener('online', winOnline);
      root.addEventListener('offline', winOffline);
    }

    // Initial paint.
    render();

    return {
      unmount: function () {
        disposed = true;
        if (pollId) { clearInterval(pollId); pollId = null; }
        if (src && stateListener && typeof src.off === 'function') {
          try { src.off('state', stateListener); } catch (_e) {}
        }
        if (typeof root.removeEventListener === 'function') {
          if (winOnline) root.removeEventListener('online', winOnline);
          if (winOffline) root.removeEventListener('offline', winOffline);
        }
      },
      refresh: render,
    };
  }

  // ─── Public surface ─────────────────────────────────────────────────────
  var api = {
    mount: mount,
    deriveBadgeView: deriveBadgeView,
    applyToDom: applyToDom,
    readState: readState,
    readStateAsync: readStateAsync,
  };
  root.PatrolSyncBadge = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

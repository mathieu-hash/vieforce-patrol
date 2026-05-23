// Unit tests for js/_util/sync-badge.js — the single source of truth for
// rendering sync state (W2-SyncTruthBadge / CLAUDE.md Rule 7).
//
// The badge is THE only place that paints sync state. The contract under
// test is the 6-state matrix derived from getSyncState():
//   { onLine, pending, syncing, quarantined, lastError }
// → exactly one of { synced, syncing, nextAttempt, offlinePending,
//                    offline, quarantined } views.
//
// Critical guard (Rule 7 / Audit D O6 / Audit A top-must-fix #2):
//   When navigator.onLine === false, the badge MUST NOT show green
//   "Naka-sync na ✓" — even if pending === 0.

const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveBadgeView, mount, applyToDom } = require('../../js/_util/sync-badge.js');

// Identity i18n for predictable strings: returns key + arg suffix.
function fakeT(key, vars) {
  if (vars && typeof vars.n !== 'undefined') return key + ':' + vars.n;
  return key;
}

// ─── 6-state matrix ──────────────────────────────────────────────────────

test('state 1: onLine + pending=0 + !syncing + quarantined=0 → green synced', () => {
  const v = deriveBadgeView({
    onLine: true, pending: 0, syncing: false, quarantined: 0, lastError: null
  }, fakeT);
  assert.equal(v.kind, 'synced');
  assert.equal(v.label, 'sync.synced');
  assert.match(v.className, /sync-ok/);
});

test('state 2: onLine + syncing=true → blue syncing label', () => {
  const v = deriveBadgeView({
    onLine: true, pending: 2, syncing: true, quarantined: 0, lastError: null
  }, fakeT);
  assert.equal(v.kind, 'syncing');
  assert.equal(v.label, 'sync.syncing');
  assert.match(v.className, /sync-syncing/);
});

test('state 3: onLine + pending>0 + !syncing → orange next-attempt', () => {
  const v = deriveBadgeView({
    onLine: true, pending: 3, syncing: false, quarantined: 0, lastError: null
  }, fakeT);
  assert.equal(v.kind, 'nextAttempt');
  assert.equal(v.label, 'sync.nextAttempt');
  assert.match(v.className, /sync-pending/);
});

test('state 4: !onLine + pending>0 → orange offline+pending with count', () => {
  const v = deriveBadgeView({
    onLine: false, pending: 2, syncing: false, quarantined: 0, lastError: null
  }, fakeT);
  assert.equal(v.kind, 'offlinePending');
  assert.equal(v.label, 'sync.offlinePending:2');
  assert.match(v.className, /sync-offline/);
});

test('state 5: !onLine + pending=0 → grey offline (NEVER green — Rule 7)', () => {
  const v = deriveBadgeView({
    onLine: false, pending: 0, syncing: false, quarantined: 0, lastError: null
  }, fakeT);
  assert.equal(v.kind, 'offline');
  assert.equal(v.label, 'sync.offline');
  assert.match(v.className, /sync-offline/);
  // The pilot-blocking invariant — proves the badge can never lie green offline.
  assert.notEqual(v.kind, 'synced');
  assert.doesNotMatch(v.className, /sync-ok/);
});

test('state 6: quarantined>0 → red regardless of other fields', () => {
  // Even when otherwise "all clear" (onLine + pending=0 + !syncing),
  // quarantined records must dominate the badge — admin attention required.
  const v = deriveBadgeView({
    onLine: true, pending: 0, syncing: false, quarantined: 1, lastError: null
  }, fakeT);
  assert.equal(v.kind, 'quarantined');
  assert.equal(v.label, 'sync.quarantined:1');
  assert.match(v.className, /sync-quarantined/);
});

// ─── Quarantine dominance (state 6 priority) ─────────────────────────────

test('quarantined>0 beats offline state (red, not orange)', () => {
  const v = deriveBadgeView({
    onLine: false, pending: 2, syncing: false, quarantined: 3, lastError: null
  }, fakeT);
  assert.equal(v.kind, 'quarantined');
  assert.equal(v.label, 'sync.quarantined:3');
});

test('quarantined>0 beats syncing state (red, not blue)', () => {
  const v = deriveBadgeView({
    onLine: true, pending: 5, syncing: true, quarantined: 1, lastError: null
  }, fakeT);
  assert.equal(v.kind, 'quarantined');
});

// ─── Transition: online+clear → online+pending → offline+pending ─────────

test('walks correctly through states: synced → nextAttempt → offlinePending', () => {
  let v = deriveBadgeView({ onLine: true, pending: 0, syncing: false, quarantined: 0 }, fakeT);
  assert.equal(v.kind, 'synced');

  v = deriveBadgeView({ onLine: true, pending: 1, syncing: false, quarantined: 0 }, fakeT);
  assert.equal(v.kind, 'nextAttempt');

  v = deriveBadgeView({ onLine: true, pending: 1, syncing: true, quarantined: 0 }, fakeT);
  assert.equal(v.kind, 'syncing');

  // Then sync finishes, pending falls to 0:
  v = deriveBadgeView({ onLine: true, pending: 0, syncing: false, quarantined: 0 }, fakeT);
  assert.equal(v.kind, 'synced');
});

test('going offline while pending=2 immediately shows offlinePending', () => {
  // Simulates: TSR has 2 queued visits, online, badge=nextAttempt → cellular
  // drops, state flips to {onLine:false, pending:2}; badge must NOT show
  // green "synced", nor stuck on "syncing", but the truthful offline+pending.
  const before = deriveBadgeView({
    onLine: true, pending: 2, syncing: false, quarantined: 0
  }, fakeT);
  assert.equal(before.kind, 'nextAttempt');

  const after = deriveBadgeView({
    onLine: false, pending: 2, syncing: false, quarantined: 0
  }, fakeT);
  assert.equal(after.kind, 'offlinePending');
  assert.equal(after.label, 'sync.offlinePending:2');
});

// ─── Defensive defaults ──────────────────────────────────────────────────

test('null/undefined state → safe fallback (treats as offline)', () => {
  const v = deriveBadgeView(null, fakeT);
  // Empty state → all numeric fields 0, onLine falsy → offline.
  assert.equal(v.kind, 'offline');
});

test('missing i18n function → returns key as label', () => {
  const v = deriveBadgeView(
    { onLine: true, pending: 0, syncing: false, quarantined: 0 },
    null
  );
  assert.equal(v.label, 'sync.synced');
});

// ─── DOM application (minimal stub — no jsdom available in CI) ───────────

function makeStubEl(opts) {
  opts = opts || {};
  const el = {
    id: opts.id || '',
    textContent: '',
    className: opts.className || '',
    dataset: {},
    _attrs: {},
    ownerDocument: null,
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
  };
  return el;
}

test('applyToDom pill mode: writes label to textContent + sets sync-* class', () => {
  const el = makeStubEl({ id: 'tsrSyncPill', className: 'tsr-sync-pill' });
  const v = deriveBadgeView({
    onLine: false, pending: 0, syncing: false, quarantined: 0
  }, fakeT);
  applyToDom(el, v);
  assert.equal(el.textContent, 'sync.offline');
  assert.match(el.className, /sync-offline/);
  assert.match(el.className, /tsr-sync-pill/); // pre-existing class preserved
});

test('applyToDom pill mode: replaces old sync-* class on state change', () => {
  const el = makeStubEl({ id: 'tsrSyncPill', className: 'tsr-sync-pill sync-syncing' });
  const v = deriveBadgeView({
    onLine: true, pending: 0, syncing: false, quarantined: 0
  }, fakeT);
  applyToDom(el, v);
  // Old sync-syncing must be stripped; new sync-ok must be present.
  assert.match(el.className, /sync-ok/);
  assert.doesNotMatch(el.className, /sync-syncing/);
});

test('applyToDom: undefined target is a no-op (no throw)', () => {
  const v = deriveBadgeView({ onLine: true, pending: 0, syncing: false, quarantined: 0 }, fakeT);
  // Should not throw.
  applyToDom(null, v);
  applyToDom(undefined, v);
});

// ─── mount() returns an unmount() that cleans up ─────────────────────────

test('mount() returns object with unmount() and refresh()', () => {
  // We can't fully exercise mount() without a DOM, but the API surface
  // must exist and unmount must be safe to call on a stub.
  const el = makeStubEl({ id: 'tsrSyncPill' });
  // Stub a minimal "document" + "window" for mount() to read globals.
  // mount() reads navigator.onLine via root.navigator; in node-test root
  // (globalThis) lacks navigator, so we feed one in.
  const prevNavigator = globalThis.navigator;
  const prevAddEvent = globalThis.addEventListener;
  globalThis.navigator = { onLine: true };
  globalThis.addEventListener = function () {};
  globalThis.removeEventListener = function () {};
  try {
    const handle = mount(el, { pollMs: 0 }); // pollMs=0 → no interval
    assert.equal(typeof handle.unmount, 'function');
    assert.equal(typeof handle.refresh, 'function');
    handle.unmount();
  } finally {
    if (prevNavigator === undefined) delete globalThis.navigator;
    else globalThis.navigator = prevNavigator;
    if (prevAddEvent === undefined) delete globalThis.addEventListener;
    else globalThis.addEventListener = prevAddEvent;
  }
});

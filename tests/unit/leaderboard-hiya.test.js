/**
 * Leaderboard hiya rule — CLAUDE.md §0 Rule 8 + §15.2.
 *
 * Audit B P0 finding C6 / Audit A top-must-fix #5: js/phase4-social.js
 * `renderRankingsRest` and `renderRankingsTiered` must cap rendered ranks to
 * top 3 + the viewer's own row for non-admin roles. Only the admin allowlist
 * (ceo, admin, evp, marketing — matching js/auth.js#canAccessUserAdmin) sees
 * the full leaderboard tail.
 *
 * These tests exercise the gate helpers exposed on window.PatrolLeaderboard.
 * Rendering integration is covered by Playwright e2e — this file pins the
 * core visibility decision so a future refactor can't silently regress.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// phase4-social.js is an IIFE that touches window/document at load time
// (event listeners, MutationObserver checks, getSession). For the gate
// helpers we only need a window shim with enough surface to load cleanly.
global.window = {
  addEventListener: function () {},
  getSession: function () { return null; },
};
global.document = {
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  body: null,
};
global.localStorage = {
  getItem: function () { return null; },
  setItem: function () {},
  removeItem: function () {},
};
global.MutationObserver = function () {
  return { observe: function () {} };
};

require('../../js/phase4-social.js');

const PL = window.PatrolLeaderboard;

function makeRows(n) {
  // Sorted desc by score with rank=1..n. Each row has the shape the
  // renderer/gate expects (id, name, role, bags, delta, rank, tierRank).
  const rows = [];
  for (let i = 0; i < n; i++) {
    const rk = i + 1;
    rows.push({
      id: 'u' + rk,
      name: 'User ' + rk,
      initials: 'U' + rk,
      role: 'TSR',
      bags: 1000 - i * 10,
      delta: rk % 2 === 0 ? 3 : -2,
      rank: rk,
      tierRank: rk,
    });
  }
  return rows;
}

test('PatrolLeaderboard is exposed by phase4-social.js', () => {
  assert.ok(PL, 'window.PatrolLeaderboard should be defined');
  assert.equal(typeof PL.shouldShowFull, 'function');
  assert.equal(typeof PL.buildVisibleRanks, 'function');
  assert.ok(Array.isArray(PL.fullRoles));
});

test('admin allowlist matches PRODUCT.md canAccessUserAdmin (ceo/admin/evp/marketing)', () => {
  // Mirrors js/auth.js#canAccessUserAdmin — leaderboard tail visibility
  // follows the same rule.
  assert.equal(PL.shouldShowFull('ceo'), true);
  assert.equal(PL.shouldShowFull('admin'), true);
  assert.equal(PL.shouldShowFull('evp'), true);
  assert.equal(PL.shouldShowFull('marketing'), true);
  // Case-insensitive (callers may pass UPPERCASE).
  assert.equal(PL.shouldShowFull('CEO'), true);
  assert.equal(PL.shouldShowFull('Marketing'), true);
});

test('non-admin roles never see the full tail', () => {
  // CLAUDE.md Rule 8: TSR / champion / DSM / RSM / exec are all gated.
  // exec is intentionally NOT in the allowlist — exec ≠ ceo here. (See
  // PRODUCT.md line 37: canAccessUserAdmin = ceo|admin|evp|marketing only.)
  ['tsr', 'champion', 'dsm', 'rsm', 'exec', 'director', '', null, undefined, 'unknown']
    .forEach((r) => {
      assert.equal(
        PL.shouldShowFull(r),
        false,
        'role "' + r + '" must not see full leaderboard'
      );
    });
});

test('20-row leaderboard, non-admin viewer (TSR) sees nothing in tail + own row', () => {
  const rows = makeRows(20);
  // Viewer is rank #8 — outside top 3 → own row must surface.
  const view = PL.buildVisibleRanks(rows, 'u8', 'tsr', 'rank');
  assert.equal(view.showFull, false);
  assert.equal(view.rowsToRender.length, 0, 'tail rows must be hidden for TSR');
  assert.ok(view.ownRow, 'own row must be set when viewer is outside top 3');
  assert.equal(view.ownRow.id, 'u8');
  assert.equal(view.ownRow.rank, 8);
  assert.equal(view.hiddenCount, 17, '20 rows - 3 podium = 17 hidden tail rows');
});

test('20-row leaderboard, admin viewer sees the full tail (all 17 rows past podium)', () => {
  const rows = makeRows(20);
  const view = PL.buildVisibleRanks(rows, 'admin1', 'admin', 'rank');
  assert.equal(view.showFull, true);
  assert.equal(view.rowsToRender.length, 17, 'admin sees ranks 4..20');
  assert.equal(view.ownRow, null, 'admin gets no extra own row — full tail already includes them if present');
  assert.equal(view.hiddenCount, 0);
});

test('when viewer is in top 3, no duplicate own row is appended', () => {
  const rows = makeRows(20);
  // Viewer is rank #2 — inside podium → own row must NOT be appended (podium
  // already surfaces them).
  const view = PL.buildVisibleRanks(rows, 'u2', 'dsm', 'rank');
  assert.equal(view.showFull, false);
  assert.equal(view.rowsToRender.length, 0);
  assert.equal(view.ownRow, null, 'podium viewer should not get a duplicate Ikaw row');
});

test('when viewer is rank #50, "Ikaw" row appears with own data only', () => {
  const rows = makeRows(50);
  const view = PL.buildVisibleRanks(rows, 'u50', 'tsr', 'rank');
  assert.equal(view.showFull, false);
  assert.equal(view.rowsToRender.length, 0, 'no other rows visible to TSR');
  assert.ok(view.ownRow);
  assert.equal(view.ownRow.id, 'u50');
  assert.equal(view.ownRow.rank, 50);
  assert.equal(view.hiddenCount, 47);
});

test('tiered layout reads tierRank instead of rank', () => {
  // Tiered view: each tier has its own 1..N tierRank. Viewer is #4 in tier
  // → outside podium → own row appears.
  const rows = makeRows(10);
  // Re-base tierRank so it differs from rank to confirm we read the right key.
  rows.forEach((r, i) => { r.tierRank = i + 1; });
  const view = PL.buildVisibleRanks(rows, 'u4', 'rsm', 'tierRank');
  assert.equal(view.showFull, false);
  assert.equal(view.rowsToRender.length, 0);
  assert.ok(view.ownRow);
  assert.equal(view.ownRow.id, 'u4');
  assert.equal(view.ownRow.tierRank, 4);
});

test('unknown viewer id (no match in rows) → no own row, no leak', () => {
  const rows = makeRows(20);
  const view = PL.buildVisibleRanks(rows, 'ghost', 'tsr', 'rank');
  assert.equal(view.showFull, false);
  assert.equal(view.rowsToRender.length, 0);
  assert.equal(view.ownRow, null, 'phantom viewer must not surface anyone else as their row');
});

test('empty rows array is safe', () => {
  assert.doesNotThrow(() => {
    const view = PL.buildVisibleRanks([], 'u1', 'tsr', 'rank');
    assert.equal(view.rowsToRender.length, 0);
    assert.equal(view.ownRow, null);
    assert.equal(view.hiddenCount, 0);
  });
});

test('admin sees own row inside the tail (no separate "Ikaw" duplicate)', () => {
  const rows = makeRows(20);
  // Admin is rank #10 — they should see the full tail INCLUDING themselves
  // as a normal row, not as a duplicated highlighted row.
  const view = PL.buildVisibleRanks(rows, 'u10', 'ceo', 'rank');
  assert.equal(view.showFull, true);
  assert.equal(view.rowsToRender.length, 17);
  assert.equal(view.ownRow, null);
  // Confirm u10 is in the tail.
  const ids = view.rowsToRender.map((r) => r.id);
  assert.ok(ids.indexOf('u10') !== -1, 'admin sees self inside the rendered tail');
});

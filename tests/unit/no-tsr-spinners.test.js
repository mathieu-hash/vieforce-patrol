// tests/unit/no-tsr-spinners.test.js
// Regression guard: TSR-facing render paths must use skeletons (CLAUDE.md
// Rule 7), never "Loading..." text or spinners. Future leaks fail CI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
function readRepoFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// ── 1. PatrolSkeleton helper produces N .skeleton-row elements ───────────────
test('PatrolSkeleton.renderSkeletonRows(container, 3) → 3 .skeleton-row blocks', () => {
  // Minimal JSDOM-free DOM shim — only needs innerHTML + setAttribute.
  const calls = { innerHTML: '', attrs: {} };
  const fakeContainer = {
    set innerHTML(v) { calls.innerHTML = v; },
    get innerHTML() { return calls.innerHTML; },
    setAttribute(k, v) { calls.attrs[k] = v; },
  };
  const { renderSkeletonRows } = require('../../js/_util/skeleton.js');
  const ok = renderSkeletonRows(fakeContainer, 3);
  assert.equal(ok, true);
  const matches = calls.innerHTML.match(/class="skeleton-row"/g) || [];
  assert.equal(matches.length, 3, 'expected exactly 3 .skeleton-row elements');
  assert.equal(calls.attrs['aria-busy'], 'true', 'sets aria-busy=true while loading');
});

test('PatrolSkeleton.renderSkeletonRows defaults to 3 rows when count is missing', () => {
  const calls = { innerHTML: '' };
  const fakeContainer = {
    set innerHTML(v) { calls.innerHTML = v; },
    get innerHTML() { return calls.innerHTML; },
    setAttribute() {},
  };
  const { renderSkeletonRows } = require('../../js/_util/skeleton.js');
  renderSkeletonRows(fakeContainer);
  const matches = calls.innerHTML.match(/class="skeleton-row"/g) || [];
  assert.equal(matches.length, 3);
});

test('PatrolSkeleton.renderSkeletonRows returns false for null container', () => {
  const { renderSkeletonRows } = require('../../js/_util/skeleton.js');
  assert.equal(renderSkeletonRows(null, 3), false);
  assert.equal(renderSkeletonRows(undefined, 3), false);
});

// ── 2. No "Loading..." literal strings on TSR-facing render paths ────────────
// These files all touch TSR-visible UI. Any addition of the literal string
// "Loading..." (or its Tagalog/Bisaya/spinner-emoji equivalents) here is a
// Rule 7 regression and must be replaced with a skeleton.
const TSR_FACING_SOURCES = [
  'js/home-tsr.js',
  'js/stores.js',
  'js/visits.js',
];

const FORBIDDEN_TSR_LOADING_PATTERNS = [
  /['"`]Loading\.\.\.['"`]/,           // literal "Loading..." string
  /['"`]Naglo-load(?:\.{3}|…)['"`]/,   // Tagalog spinner-equivalent text
  /['"`]Naghihintay['"`]/,             // "Waiting..." Tagalog
  /['"`]Please wait['"`]/i,
  /['"`]⏳['"`]/,                  // ⏳ hourglass emoji as loading badge
  /class=["'][^"']*\bspinner\b/,       // .spinner CSS class injected into DOM
];

for (const rel of TSR_FACING_SOURCES) {
  test(`${rel}: no Loading…/spinner literals on TSR render path`, () => {
    const src = readRepoFile(rel);
    for (const pattern of FORBIDDEN_TSR_LOADING_PATTERNS) {
      assert.doesNotMatch(
        src,
        pattern,
        `${rel} contains forbidden TSR loading literal matching ${pattern}`
      );
    }
  });
}

// ── 3. app.html store-detail (TSR drill-down) must not seed "Loading..." ─────
test('app.html: openStoreDetail does not seed "Loading..." text', () => {
  const html = readRepoFile('app.html');
  // Locate the openStoreDetail function body and check the loading-state block.
  const idx = html.indexOf('async function openStoreDetail');
  assert.notEqual(idx, -1, 'openStoreDetail not found in app.html');
  // Inspect ~2000 chars after the function signature (covers the loading block
  // and the success path) for the literal "Loading..." string.
  const window = html.slice(idx, idx + 2000);
  assert.ok(
    !/['"`]Loading\.\.\.['"`]/.test(window),
    'openStoreDetail still contains a "Loading..." literal — use skeleton-row instead'
  );
  // Affirmative check: the skeleton primitive IS referenced in that window.
  assert.match(
    window,
    /skeleton/,
    'openStoreDetail must seed a .skeleton-* element while loading'
  );
});

// ── 4. NBA hero (TSR home) must seed a skeleton, not "Loading..." text ───────
test('app.html: TSR NBA hero seeds a skeleton, not a loading text node', () => {
  const html = readRepoFile('app.html');
  const idx = html.indexOf('id="tsrNbaTitle"');
  assert.notEqual(idx, -1, 'tsrNbaTitle anchor not found');
  // Slice the element's outer scope (looks back for the opening tag).
  const slice = html.slice(Math.max(0, idx - 200), idx + 400);
  assert.match(
    slice,
    /class="skeleton[^"]*"/,
    'tsrNbaTitle must render a .skeleton placeholder during first paint'
  );
  assert.ok(
    !/data-i18n="tsr\.nba_loading"/.test(slice),
    'tsrNbaTitle must not seed the "Nilo-load…" text via data-i18n'
  );
});

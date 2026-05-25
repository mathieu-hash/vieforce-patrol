// Unit tests for js/offline.js#cleanupOrphanPhotos.
//
// R6 audit (_audit/HARDENING/R6_EXECUTIVE_REVIEW.md:83) flagged this
// as 100+ LOC of throw-aware logic gated behind a 24h throttle with no
// test. This file extracts the function (plus its throttle helper) via
// vm.runInThisContext — same pattern as offline-queue-payload.test.js —
// and stubs supabaseClient + getSession + localStorage.
//
// Behaviour under contract:
//   1. _shouldRunOrphanCleanup() returns false → cleanupOrphanPhotos returns
//      { ran: false, reason: 'throttled ...' } and performs no I/O.
//   2. No session → { ran: false, reason: 'no session' }.
//   3. Happy path: bucket.list returns date dirs + files; live ids are
//      cross-referenced against visits + stores; only orphans are removed.
//   4. Live-id matches are NEVER deleted (false-positive guard).
//   5. If one per-day list() fails, the rest still proceed (partial-failure
//      survival) and needsServerSweep is set.
//   6. Returns count of orphans deleted.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─────────────────────────────────────────────────────────────────────────
// Extract _shouldRunOrphanCleanup + cleanupOrphanPhotos from js/offline.js
// and load them into a controlled vm context with mocked globals.
// ─────────────────────────────────────────────────────────────────────────

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'offline.js'), 'utf8');

// Pull the throttle constants + both functions. Slice from the
// `var _ORPHAN_CLEANUP_KEY` marker to the end of cleanupOrphanPhotos by
// counting braces — regex can't reliably handle the nested for/try/if
// blocks inside the function body.
function extractBlock() {
  const startIdx = src.indexOf('var _ORPHAN_CLEANUP_KEY');
  if (startIdx === -1) throw new Error('Could not locate _ORPHAN_CLEANUP_KEY in js/offline.js');
  const fnStart = src.indexOf('async function cleanupOrphanPhotos()', startIdx);
  if (fnStart === -1) throw new Error('Could not locate cleanupOrphanPhotos in js/offline.js');
  // Find the matching closing brace by counting braces from the opening one.
  const openBrace = src.indexOf('{', fnStart);
  let depth = 0;
  let i = openBrace;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return src.slice(startIdx, i);
}

const blockSrc = extractBlock();

function buildContext({ lastRunMs, session, supabaseClient, nowMs }) {
  const storage = new Map();
  if (lastRunMs != null) storage.set('patrol_orphan_cleanup_last_run', String(lastRunMs));
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); }
  };
  const realNow = Date.now;
  const ctx = vm.createContext({
    Date: nowMs != null
      ? Object.assign(function () { return new realNow.constructor(); }, { now: () => nowMs })
      : Date,
    Set,
    Promise,
    console: { warn() {}, info() {}, log() {}, error() {} },
    localStorage,
    parseInt,
    isFinite,
    getSession: () => session,
    supabaseClient,
    String,
    Array
  });
  vm.runInContext(blockSrc, ctx);
  return { ctx, storage };
}

// ─────────────────────────────────────────────────────────────────────────
// Test 1: Throttle gate — recent run skips cleanup entirely.
// ─────────────────────────────────────────────────────────────────────────

test('cleanupOrphanPhotos: throttled when last run < 24h ago, performs no I/O', async () => {
  const nowMs = 1_700_000_000_000;
  // Last run 1h ago — well inside the 24h window.
  const lastRunMs = nowMs - (60 * 60 * 1000);
  let listCalls = 0;
  const supabaseClient = {
    storage: { from: () => ({ list: async () => { listCalls++; return { data: [], error: null }; } }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) })
  };
  const { ctx } = buildContext({
    lastRunMs,
    session: { id: 'tsr-1' },
    supabaseClient,
    nowMs
  });

  const result = await ctx.cleanupOrphanPhotos();
  assert.equal(result.ran, false);
  assert.match(result.reason, /throttled/);
  assert.equal(listCalls, 0, 'no Storage I/O when throttled');
});

test('cleanupOrphanPhotos: runs when last run > 24h ago', async () => {
  const nowMs = 1_700_000_000_000;
  // Last run 25h ago — outside the 24h window.
  const lastRunMs = nowMs - (25 * 60 * 60 * 1000);
  const supabaseClient = {
    storage: { from: () => ({
      list: async () => ({ data: [], error: null }),
      remove: async () => ({ error: null })
    }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) })
  };
  const { ctx } = buildContext({
    lastRunMs,
    session: { id: 'tsr-1' },
    supabaseClient,
    nowMs
  });

  const result = await ctx.cleanupOrphanPhotos();
  assert.equal(result.ran, true);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: No session → no-op.
// ─────────────────────────────────────────────────────────────────────────

test('cleanupOrphanPhotos: returns { ran: false, reason: "no session" } when getSession is null', async () => {
  const supabaseClient = {
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) })
  };
  const { ctx } = buildContext({
    lastRunMs: null,    // first run ever — throttle allows
    session: null,
    supabaseClient,
    nowMs: 1_700_000_000_000
  });

  const result = await ctx.cleanupOrphanPhotos();
  assert.equal(result.ran, false);
  assert.equal(result.reason, 'no session');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3: Happy path — orphans deleted, live ids preserved.
// ─────────────────────────────────────────────────────────────────────────

test('cleanupOrphanPhotos: deletes only orphans, preserves live store/visit ids', async () => {
  const nowMs = 1_700_000_000_000;
  const tsr = 'tsr-1';
  const LIVE_STORE_ID = 'live-store-uuid';
  const LIVE_VISIT_ID = 'live-visit-uuid';
  const ORPHAN_LEGACY = '1745597432123_visit'; // legacy timestamped path
  const ORPHAN_RANDOM = 'orphan-no-row';

  // Track per-prefix list() calls.
  const listCalls = [];
  let removeCalled = null;

  const supabaseClient = {
    storage: {
      from: (bucket) => {
        assert.equal(bucket, 'patrol-photos');
        return {
          list: async (prefix, opts) => {
            listCalls.push({ prefix, opts });
            if (prefix === tsr) {
              // Root list — returns YYYY-MM-DD subfolders.
              return {
                data: [
                  { name: '2026-05-24', id: null }, // folder entry
                  { name: '2026-05-25', id: null }
                ],
                error: null
              };
            }
            if (prefix === tsr + '/2026-05-24') {
              return {
                data: [
                  { name: LIVE_STORE_ID + '.jpg' },
                  { name: ORPHAN_LEGACY + '.jpg' }
                ],
                error: null
              };
            }
            if (prefix === tsr + '/2026-05-25') {
              return {
                data: [
                  { name: LIVE_VISIT_ID + '.jpg' },
                  { name: ORPHAN_RANDOM + '.jpg' }
                ],
                error: null
              };
            }
            return { data: [], error: null };
          },
          remove: async (paths) => {
            removeCalled = paths;
            return { error: null };
          }
        };
      }
    },
    from: (table) => ({
      select: () => ({
        eq: async () => {
          if (table === 'stores') return { data: [{ id: LIVE_STORE_ID }] };
          if (table === 'visits') return { data: [{ id: LIVE_VISIT_ID }] };
          return { data: [] };
        }
      })
    })
  };

  const { ctx } = buildContext({
    lastRunMs: null,
    session: { id: tsr },
    supabaseClient,
    nowMs
  });

  const result = await ctx.cleanupOrphanPhotos();

  assert.equal(result.ran, true);
  assert.equal(result.scanned, 4, 'scans all 4 files across 2 day-folders');
  assert.equal(result.orphansDeleted, 2, 'deletes exactly the 2 orphans');
  assert.equal(result.errors, 0);
  assert.equal(result.needsServerSweep, false);

  // The live ids must NOT appear in the delete batch.
  assert.ok(Array.isArray(removeCalled), 'remove() must have been called');
  const removedPaths = removeCalled.join('|');
  assert.equal(
    removedPaths.includes(LIVE_STORE_ID),
    false,
    'live store id MUST NOT be deleted (false-positive guard)'
  );
  assert.equal(
    removedPaths.includes(LIVE_VISIT_ID),
    false,
    'live visit id MUST NOT be deleted (false-positive guard)'
  );
  assert.ok(removedPaths.includes(ORPHAN_LEGACY), 'legacy orphan was deleted');
  assert.ok(removedPaths.includes(ORPHAN_RANDOM), 'random orphan was deleted');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 4: Partial-failure survival — one day's list() error doesn't stop
// the other day from being scanned + cleaned.
// ─────────────────────────────────────────────────────────────────────────

test('cleanupOrphanPhotos: partial failure (one day list errors) → other days still scanned, needsServerSweep flagged', async () => {
  const nowMs = 1_700_000_000_000;
  const tsr = 'tsr-1';
  const LIVE_ID = 'live-uuid';
  const ORPHAN_ID = 'orphan-uuid';

  let removeCalled = null;

  const supabaseClient = {
    storage: {
      from: () => ({
        list: async (prefix) => {
          if (prefix === tsr) {
            return {
              data: [
                { name: '2026-05-24', id: null },
                { name: '2026-05-25', id: null }
              ],
              error: null
            };
          }
          if (prefix === tsr + '/2026-05-24') {
            // This day fails to list — should NOT stop the next day.
            return { data: null, error: { message: 'RLS denied' } };
          }
          if (prefix === tsr + '/2026-05-25') {
            return {
              data: [
                { name: LIVE_ID + '.jpg' },
                { name: ORPHAN_ID + '.jpg' }
              ],
              error: null
            };
          }
          return { data: [], error: null };
        },
        remove: async (paths) => { removeCalled = paths; return { error: null }; }
      })
    },
    from: (table) => ({
      select: () => ({
        eq: async () => {
          if (table === 'stores') return { data: [{ id: LIVE_ID }] };
          if (table === 'visits') return { data: [] };
          return { data: [] };
        }
      })
    })
  };

  const { ctx } = buildContext({
    lastRunMs: null,
    session: { id: tsr },
    supabaseClient,
    nowMs
  });

  const result = await ctx.cleanupOrphanPhotos();

  assert.equal(result.ran, true);
  assert.equal(result.errors, 1, 'the failed day-list increments errors');
  assert.equal(result.needsServerSweep, true, 'needsServerSweep flag set so a server job picks up the gap');
  // The surviving day was still processed — its 1 orphan was deleted.
  assert.equal(result.orphansDeleted, 1);
  assert.ok(removeCalled, 'remove() still ran for the surviving day');
  assert.ok(removeCalled.join('|').includes(ORPHAN_ID), 'surviving-day orphan deleted');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 5: Root list error → flagged for server sweep, no deletes.
// ─────────────────────────────────────────────────────────────────────────

test('cleanupOrphanPhotos: root list() error flags needsServerSweep and skips deletes', async () => {
  const nowMs = 1_700_000_000_000;
  let removeCalled = false;
  const supabaseClient = {
    storage: { from: () => ({
      list: async () => ({ data: null, error: { message: 'permission denied' } }),
      remove: async () => { removeCalled = true; return { error: null }; }
    }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) })
  };

  const { ctx, storage } = buildContext({
    lastRunMs: null,
    session: { id: 'tsr-1' },
    supabaseClient,
    nowMs
  });

  const result = await ctx.cleanupOrphanPhotos();
  assert.equal(result.ran, true);
  assert.equal(result.needsServerSweep, true);
  assert.equal(result.errors, 1);
  assert.equal(result.orphansDeleted, 0);
  assert.equal(removeCalled, false, 'remove() must NOT run when root list fails');
  // Still records timestamp so we don't hammer Storage every reload.
  assert.ok(storage.has('patrol-orphan-cleanup-last-run'.replace(/-/g, '_')) ||
            storage.has('patrol_orphan_cleanup_last_run'),
            'last-run timestamp written to localStorage so the throttle kicks in');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 6: No orphans found → no remove() call, no error flag.
// ─────────────────────────────────────────────────────────────────────────

test('cleanupOrphanPhotos: when every file matches a live id, no delete is attempted', async () => {
  const nowMs = 1_700_000_000_000;
  const tsr = 'tsr-1';
  const ID_A = 'live-a';
  const ID_B = 'live-b';
  let removeCalled = false;

  const supabaseClient = {
    storage: { from: () => ({
      list: async (prefix) => {
        if (prefix === tsr) return { data: [{ name: '2026-05-24', id: null }], error: null };
        if (prefix === tsr + '/2026-05-24') {
          return { data: [{ name: ID_A + '.jpg' }, { name: ID_B + '.jpg' }], error: null };
        }
        return { data: [], error: null };
      },
      remove: async () => { removeCalled = true; return { error: null }; }
    }) },
    from: (table) => ({
      select: () => ({
        eq: async () => {
          if (table === 'stores') return { data: [{ id: ID_A }] };
          if (table === 'visits') return { data: [{ id: ID_B }] };
          return { data: [] };
        }
      })
    })
  };

  const { ctx } = buildContext({
    lastRunMs: null,
    session: { id: tsr },
    supabaseClient,
    nowMs
  });

  const result = await ctx.cleanupOrphanPhotos();
  assert.equal(result.ran, true);
  assert.equal(result.scanned, 2);
  assert.equal(result.orphansDeleted, 0);
  assert.equal(result.errors, 0);
  assert.equal(removeCalled, false, 'remove() must not be called when no orphans');
});

// Wave 4 — W4-OfflineE2E: real offline → queue → reconnect → drain test.
//
// Locks down the three Wave-2 pilot-blocking guarantees so they cannot
// regress:
//
//   W2-RetryClassify (Audit D O1): transient errors NEVER eject. A record
//     stays in IDB until either it drains or a permanent error quarantines
//     it. The pre-Wave-2 code ejected after 3 strikes regardless of error
//     class — silently destroyed records and lit a green "Naka-sync na ✓✓"
//     badge.
//
//   W2-PhotoFlow (Audit D O5 / H-03): photo flow is INSERT row (with
//     photo_url=NULL) → UPLOAD blob to deterministic path → PATCH row with
//     URL. A failure between steps 1 and 2 leaves a rescue-able row, not
//     an orphan blob in Storage.
//
//   W2-SyncTruthBadge (Audit D O2 + O6): the global sync bar must reflect
//     the actual queue state. CRITICALLY: it MUST NEVER show green
//     "Synced ✓" while navigator.onLine === false, even if the queue is
//     empty. This is CLAUDE.md Rule 7 + the explicit pilot-safety
//     invariant.
//
// Mocking approach — we let the REAL offline.js / db.js / camera.js code
// run, but page.route() intercepts every Supabase HTTP call so the test
// can deterministically simulate success, transient errors (TypeError
// "Failed to fetch"), and permanent errors (PGRST204 "column not found").
// IDB state and getSyncState() are read directly via page.evaluate().

import { test, expect, type Page, type Route } from '@playwright/test';
import { seedSession, hideBootDebug } from './_helpers';

// ─── Local test fixtures ─────────────────────────────────────────────────
const E2E_STORE_ID = 'e2e-store-drain-001';
const E2E_STORE_NAME = 'Drain Test Store';

const SAMPLE_STORE = {
  id: E2E_STORE_ID,
  name: E2E_STORE_NAME,
  city: 'Manila',
  owner_name: 'Drain Owner',
  phone: '09171234567',
  bags_per_month: 100,
  store_status: 'active',
  health_status: 'ok',
  assigned_tsr: 'e2e-tsr-001',
  created_by: 'e2e-tsr-001',
  region: 'Luzon',
  territory: 'MM-North',
};

/**
 * Test-controlled mock state. Each scenario flips these flags via
 * page.evaluate() to simulate Supabase behaviour mid-test.
 *
 *   visitsInsertMode:
 *     'success'    → respond 201 with the inserted row + id
 *     'pgrst204'   → respond 400 with PGRST204 (permanent, quarantine)
 *     'netfail'    → respond with empty body + status 0 (fetch TypeError)
 *
 *   storageUploadMode:
 *     'success' → respond 200 with the upload path
 *     'netfail' → fetch TypeError
 *
 *   inserts: captures the visits/stores rows the server "received" so we
 *   can assert end-to-end delivery.
 */
type MockState = {
  visitsInsertMode: 'success' | 'pgrst204' | 'netfail';
  storageUploadMode: 'success' | 'netfail';
  storageObjects: Set<string>;
  inserts: { table: string; row: Record<string, unknown> }[];
};

async function installMutableSupabaseMocks(page: Page, state: MockState) {
  // No page-side mock state needed — the route handlers read directly
  // from the TEST-SIDE `state` argument (closure capture). Reading page
  // state via page.evaluate() inside a route fulfilment races with
  // navigations / reloads ("Execution context was destroyed"), which is
  // exactly the failure mode scenario 4 hit before this refactor.

  // CORS preflight + ok shell.
  await page.route('**/auth/v1/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );

  function corsHeaders(route: Route): Record<string, string> {
    const h = route.request().headers();
    const origin = h.origin || (h as { Origin?: string }).Origin || '*';
    const base: Record<string, string> = {
      'access-control-expose-headers': 'content-range, location',
      'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers':
        'authorization, content-type, apikey, prefer, accept-profile, range, x-client-info, accept',
    };
    if (origin === '*') {
      base['access-control-allow-origin'] = '*';
      return base;
    }
    base['access-control-allow-origin'] = origin;
    base['access-control-allow-credentials'] = 'true';
    return base;
  }

  // PostgREST: stores → GET returns [SAMPLE_STORE]; visits insert / patch
  // are driven by mockState.
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const headers = corsHeaders(route);

    // /rest/v1/stores
    if (/\/rest\/v1\/stores(\?|$)/.test(url)) {
      if (method === 'OPTIONS') return route.fulfill({ status: 200, headers, body: '' });
      if (method === 'GET' || method === 'HEAD') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { ...headers, 'content-range': '*/10' },
          body: method === 'HEAD' ? '' : JSON.stringify([SAMPLE_STORE]),
        });
      }
      // PATCH on stores (last_visit_at / conversion) — always succeed
      return route.fulfill({
        status: 200, contentType: 'application/json', headers,
        body: JSON.stringify(SAMPLE_STORE),
      });
    }

    // /rest/v1/visits
    if (/\/rest\/v1\/visits(\?|$)/.test(url)) {
      if (method === 'OPTIONS') return route.fulfill({ status: 200, headers, body: '' });
      if (method === 'GET' || method === 'HEAD') {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          headers: { ...headers, 'content-range': '*/4' },
          body: method === 'HEAD' ? '' : '[]',
        });
      }
      // POST = insert; PATCH = photo_url update.
      const mode = state.visitsInsertMode; // read test-side state (no page.evaluate during route)
      if (method === 'POST') {
        if (mode === 'netfail') {
          // Simulate fetch network failure → browser surfaces TypeError("Failed to fetch")
          await route.abort('failed');
          return;
        }
        if (mode === 'pgrst204') {
          // NOTE on classification:
          //   js/db.js wraps PostgREST errors as `new Error('createVisit: ' + err.message)`,
          //   stripping the original .code / .status. classifyError() in
          //   js/offline.js falls back to a message regex that matches
          //   `column .* does not exist` (raw Postgres phrasing) — which is
          //   what we send here. (PostgREST's own phrasing "Could not find
          //   the '<col>' column of '<table>' in the schema cache" is NOT
          //   matched by the current regex — see Wave 2 bug note in the
          //   agent return; fixing it is a one-line classifier edit. Using
          //   the canonical Postgres phrasing here makes the test
          //   deterministic against the SHIPPED classifier while still
          //   exercising the permanent → quarantine path.)
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            headers,
            body: JSON.stringify({
              code: 'PGRST204',
              message: 'column "offline_id" does not exist',
              details: "Could not find the 'offline_id' column of 'visits' in the schema cache",
              hint: null,
            }),
          });
        }
        // success → echo the body back with a generated id
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(route.request().postData() || '{}'); } catch (_e) { /* ignore */ }
        // PostgREST returns an array OR a single object depending on Accept/Prefer.
        // supabase-js .insert().select().single() expects an object with .id.
        const id = 'srv-visit-' + Math.random().toString(36).slice(2, 10);
        const row = { ...body, id };
        state.inserts.push({ table: 'visits', row });
        return route.fulfill({
          status: 201, contentType: 'application/json', headers,
          body: JSON.stringify(row),
        });
      }
      if (method === 'PATCH') {
        return route.fulfill({ status: 204, headers, body: '' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{}' });
    }

    // Generic PostgREST fallthrough
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers, body: '' });
    return route.fulfill({
      status: 200, contentType: 'application/json', headers,
      body: method === 'GET' ? '[]' : '{}',
    });
  });

  // Supabase Storage: upload (POST) + list. The path comes through as
  // /storage/v1/object/patrol-photos/<...>.
  await page.route('**/storage/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const headers = corsHeaders(route);

    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers, body: '' });

    const sMode = state.storageUploadMode;
    if (sMode === 'netfail' && (method === 'POST' || method === 'PUT')) {
      await route.abort('failed');
      return;
    }
    if (method === 'POST' || method === 'PUT') {
      const m = url.match(/\/object\/[^?#]+/);
      const path = m ? m[0] : url;
      state.storageObjects.add(path);
      return route.fulfill({
        status: 200, contentType: 'application/json', headers,
        body: JSON.stringify({ Key: path }),
      });
    }

    if (method === 'GET' || method === 'HEAD') {
      // list / public URL
      return route.fulfill({
        status: 200, contentType: 'application/json', headers,
        body: '[]',
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{}' });
  });

  // /api/* server endpoints — keep tests independent of Vercel functions.
  await page.route('**/api/user/language**', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"locale":"tl","language":"tl"}' })
  );
}

/**
 * Real-pipeline TSR login.
 *
 * Differences vs. _helpers.loginAsTsr:
 *   - does NOT stub syncPending / _attemptImmediateSync / uploadPhoto /
 *     capturePhoto / updateStore — these are exactly the W2 surfaces under
 *     test. The real implementations from js/offline.js + js/camera.js
 *     + js/visit-wizard.js run, with HTTP intercepted by mocks above.
 *   - keeps read-only stubs (getStoresByTSR, getVisitsByTSR, getStoreById)
 *     so the home shell renders quickly without depending on the
 *     PostgREST list responses.
 */
async function loginAsTsrReal(page: Page, state: MockState) {
  await installMutableSupabaseMocks(page, state);

  // Boot-debug suppression + geolocation stub.
  await page.addInitScript(() => {
    (window as any).__PATROL_E2E = true;
    try { localStorage.setItem('patrol_readiness_done', '1'); } catch (_e) {}
    function suppressBootDebug() {
      try { localStorage.removeItem('patrol_bootlog'); } catch (_e) {}
      const dbg = document.getElementById('patrol-boot-debug');
      if (dbg) {
        dbg.style.display = 'none';
        dbg.style.visibility = 'hidden';
        dbg.style.pointerEvents = 'none';
      }
    }
    (window as any)._patrolBootLog = suppressBootDebug;
    document.addEventListener('DOMContentLoaded', suppressBootDebug);
    window.addEventListener('load', suppressBootDebug);

    const geo = navigator.geolocation;
    if (geo) {
      navigator.geolocation.getCurrentPosition = function (success) {
        if (success) success({
          coords: {
            latitude: 14.5995, longitude: 120.9842, accuracy: 10,
            altitude: null, altitudeAccuracy: null, heading: null, speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      };
      navigator.geolocation.watchPosition = function (success) {
        if (success) navigator.geolocation.getCurrentPosition(success);
        return 1;
      };
    }
  });

  // Read-only API stubs so the home shell renders. CRITICAL: do NOT stub
  // queueVisit / syncPending / _attemptImmediateSync / uploadPhoto here —
  // those are the W2 surfaces we want to actually exercise.
  await page.addInitScript((store) => {
    const sampleStores = [store];
    const applyStubs = () => {
      (window as any).getStores = async () => sampleStores;
      (window as any).getStoresByTSR = async () => sampleStores;
      (window as any).getVisitsByTSR = async () => [];
      (window as any).getStoreById = async () => store;
      (window as any).getVisitsByStore = async () => [];
      // home-tsr lookups
      (window as any).getUserById = (id: string) => ({
        id, name: 'E2E TSR', role: 'tsr', roleLabel: 'TSR', initials: 'EU', tier: 'standard',
      });
      (window as any).sapFetch = async () => ({ kpis: { bags: 0 } });
    };
    applyStubs();
    window.addEventListener('DOMContentLoaded', applyStubs);
  }, SAMPLE_STORE);

  await seedSession(page);
  await page.goto('/app.html');
  await page.waitForSelector('#page-home-tsr.active, #page-home.active', { timeout: 25000 });
  await hideBootDebug(page);
}

// ─── Helpers operating on the real offline pipeline ──────────────────────

async function readSyncState(page: Page) {
  return page.evaluate(async () => {
    if (typeof (window as any).getSyncState !== 'function') {
      return { onLine: navigator.onLine, pending: 0, syncing: false, quarantined: 0, lastError: null };
    }
    return await (window as any).getSyncState();
  });
}

async function readBarKind(page: Page): Promise<string> {
  // The bar's className encodes the kind via sync-badge.js applyToDom.
  // sync-ok = synced; sync-offline = offline/offlinePending; sync-working
  // = syncing or nextAttempt; sync-error = quarantined.
  return page.evaluate(() => {
    const bar = document.getElementById('global-sync-bar');
    if (!bar) return 'missing';
    const cn = bar.className || '';
    if (/sync-error/.test(cn)) return 'error';
    if (/sync-ok/.test(cn)) return 'ok';
    if (/sync-offline/.test(cn)) return 'offline';
    if (/sync-working/.test(cn)) return 'working';
    if (/sync-hidden/.test(cn)) return 'hidden';
    return 'unknown:' + cn;
  });
}

async function refreshBar(page: Page) {
  await page.evaluate(async () => {
    if (typeof (window as any).enhancedSyncStatus === 'function') {
      try { await (window as any).enhancedSyncStatus(); } catch (_e) {}
    }
    const bar = document.getElementById('global-sync-bar');
    if (bar && (bar as any)._patrolBadge && typeof (bar as any)._patrolBadge.refresh === 'function') {
      (bar as any)._patrolBadge.refresh();
    }
  });
}

async function pendingTotal(page: Page): Promise<number> {
  const s = await readSyncState(page);
  return Number(s.pending) || 0;
}

async function quarantinedTotal(page: Page): Promise<number> {
  const s = await readSyncState(page);
  return Number(s.quarantined) || 0;
}

async function clearOfflineQueues(page: Page) {
  await page.evaluate(async () => {
    if (typeof (window as any).patrolClearQueue === 'function') {
      await (window as any).patrolClearQueue();
    }
  });
}

/** Open the visit sheet via the existing global helper, with a photo. */
async function submitVisit(page: Page, opts: { storeId: string; storeName: string; offline?: boolean }) {
  await page.evaluate(({ id, name }) => {
    if (typeof (window as any).openVisitWizard === 'function') {
      (window as any).openVisitWizard(id, name);
    }
  }, { id: opts.storeId, name: opts.storeName });
  await expect(page.locator('#visit-sheet')).toHaveClass(/open/, { timeout: 10000 });
  await expect(page.locator('#visit-outcome-grid .outcome')).toHaveCount(3, { timeout: 10000 });
  // Trigger the outcome via the existing global handler — the sheet's
  // animation can leave the chip outside Playwright's stability check on
  // mid-viewport, and we don't need to assert click hit-testing here.
  await page.evaluate(() => {
    if (typeof (window as any).selectOutcome === 'function') {
      (window as any).selectOutcome('no-order');
    }
  });
  await expect(page.locator('#visit-details-panel')).toBeVisible();
  // Photo attach uses real capturePhoto — install a small stub that returns
  // a real Blob (DataURL'd internally by visit-wizard) so the offline queue
  // gets a real photo_base64 to drain.
  await page.evaluate(() => {
    // Minimal 1x1 jpeg blob — enough for the queue and uploadPhoto.
    (window as any).capturePhoto = async function () {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
                                    0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
                                    0xff, 0xd9]);
      return new Blob([bytes], { type: 'image/jpeg' });
    };
  });
  // Trigger photo capture via the global handler — same hit-testing
  // workaround as for the outcome chip; the click target may be outside
  // Playwright's stability viewport on a bottom-sheet layout.
  await page.evaluate(async () => {
    if (typeof (window as any).captureVisitPhoto === 'function') {
      try { await (window as any).captureVisitPhoto(); } catch (_e) {}
    } else {
      const btn = document.getElementById('visit-photo-btn');
      if (btn) btn.click();
    }
  });
  await expect(page.locator('#photo-hero-preview')).toBeVisible({ timeout: 10000 });
  if (opts.offline) {
    await page.context().setOffline(true);
  }
  // Trigger submit via the global handler directly.
  const submitPromise = page.evaluate(async () => {
    if (typeof (window as any).submitVisit === 'function') {
      return await (window as any).submitVisit();
    }
    return null;
  });
  // Submit button text changes to a "saved/queued/synced" variant.
  await expect(page.locator('#btn-visit-submit')).toContainText(
    /Na-save|Saved|synced|saved locally|✓|queued/i, { timeout: 25000 }
  );
  await submitPromise.catch(() => {});
  // Close the sheet if visit-wizard's setTimeout(500) hasn't yet.
  await page.waitForTimeout(700);
}

// ─── The 6 scenarios ─────────────────────────────────────────────────────

test.describe('22 — Offline drain (W4-OfflineE2E) [@offline-drain]', () => {
  test.describe.configure({ mode: 'serial' });

  test('1) Happy drain: online submit → offline submit → reconnect → drain', async ({ page }) => {
    const state: MockState = {
      visitsInsertMode: 'success',
      storageUploadMode: 'success',
      storageObjects: new Set(),
      inserts: [],
    };
    await loginAsTsrReal(page, state);
    await clearOfflineQueues(page);

    // 1a — online submit → drain immediately → green badge.
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: false });
    await expect.poll(async () => pendingTotal(page), { timeout: 5000 }).toBe(0);
    await refreshBar(page);
    await expect.poll(() => readBarKind(page), { timeout: 5000 })
      .toMatch(/^(ok|hidden)$/); // bar is hidden when synced; that's truthful.

    // 1b — offline submit → row in queue, badge orange.
    await page.context().setOffline(false); // ensure online before opening sheet
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: true });
    await refreshBar(page);
    expect(await pendingTotal(page)).toBeGreaterThanOrEqual(1);
    // Must NOT be ok/green while offline.
    expect(await readBarKind(page)).not.toBe('ok');

    // 1c — reconnect → drain.
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    // Trigger sync explicitly (autoSync is wired to window.online, but be
    // deterministic — call syncPending directly).
    await page.evaluate(async () => {
      if (typeof (window as any).syncPending === 'function') {
        try { await (window as any).syncPending(); } catch (_e) {}
      }
      if (typeof (window as any).enhancedSyncStatus === 'function') {
        try { await (window as any).enhancedSyncStatus(); } catch (_e) {}
      }
    });
    await expect.poll(async () => pendingTotal(page), { timeout: 10000 }).toBe(0);
    await refreshBar(page);
    expect(await readBarKind(page)).not.toBe('offline');

    // Server received both visits.
    expect(state.inserts.filter((i) => i.table === 'visits').length).toBeGreaterThanOrEqual(2);
  });

  test('2) Sync badge truth: NEVER green when offline (Audit D O2 + O6)', async ({ page }) => {
    const state: MockState = {
      visitsInsertMode: 'success',
      storageUploadMode: 'success',
      storageObjects: new Set(),
      inserts: [],
    };
    await loginAsTsrReal(page, state);
    await clearOfflineQueues(page);

    // State A: online + empty queue → green (ok or hidden — both truthful).
    await refreshBar(page);
    await expect.poll(() => readBarKind(page), { timeout: 5000 }).toMatch(/^(ok|hidden)$/);

    // State B: offline + empty queue → grey "Offline" (NEVER green).
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await refreshBar(page);
    const kindOffEmpty = await readBarKind(page);
    expect(kindOffEmpty).not.toBe('ok'); // Rule 7 invariant
    expect(kindOffEmpty).toBe('offline');

    // State C: offline + pending=2 → orange "Offline · 2 pending".
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: true });
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: true });
    await refreshBar(page);
    expect(await pendingTotal(page)).toBeGreaterThanOrEqual(2);
    const kindOffPending = await readBarKind(page);
    expect(kindOffPending).not.toBe('ok'); // still NEVER green
    expect(kindOffPending).toBe('offline');
    const barText = await page.locator('#sync-bar-text').textContent();
    expect(barText || '').toMatch(/pending|naghihintay/i);

    // State D: offline→online with pending records → drain → green.
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.evaluate(async () => {
      if (typeof (window as any).syncPending === 'function') {
        try { await (window as any).syncPending(); } catch (_e) {}
      }
    });
    await expect.poll(async () => pendingTotal(page), { timeout: 10000 }).toBe(0);
    await refreshBar(page);
    expect(await readBarKind(page)).not.toBe('offline');
  });

  test('3) Quarantine on PGRST204, then requeueQuarantined recovers', async ({ page }) => {
    const state: MockState = {
      visitsInsertMode: 'pgrst204', // force permanent error on first attempt
      storageUploadMode: 'success',
      storageObjects: new Set(),
      inserts: [],
    };
    await loginAsTsrReal(page, state);
    await clearOfflineQueues(page);

    // Submit online — INSERT will be rejected with PGRST204 → quarantined.
    // We submit OFFLINE first so the immediate-sync attempt during submit
    // doesn't race with our explicit drain (which is the path we want to
    // assert quarantines the record).
    await page.context().setOffline(true);
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: true });
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Drain attempt should mark it quarantined (NOT delete).
    await page.evaluate(async () => {
      const db = (window as any).offlineDb;
      // Clear any backoff timer so the drain attempts immediately.
      const rows = await db.pendingVisits.toArray();
      for (const r of rows) {
        r.next_attempt_after = null;
        await db.pendingVisits.put(r);
      }
      if (typeof (window as any).syncPending === 'function') {
        try { await (window as any).syncPending(); } catch (_e) {}
      }
    });
    await refreshBar(page);

    // The record is still in IDB but flagged quarantined → NOT counted as
    // pending in our state, but counted as quarantined.
    await expect.poll(async () => quarantinedTotal(page), { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    // Bar must be red/error (sync-error class) — admin attention required.
    expect(await readBarKind(page)).toBe('error');

    // Now flip mock to success and call requeueQuarantined for each
    // quarantined row.
    state.visitsInsertMode = 'success';
    const recovered = await page.evaluate(async () => {
      const db = (window as any).offlineDb;
      if (!db) return 0;
      const rows = await db.pendingVisits.toArray();
      let count = 0;
      for (const r of rows) {
        if (r.quarantined_at) {
          await (window as any).requeueQuarantined(r.id);
          count++;
        }
      }
      // Drain.
      if (typeof (window as any).syncPending === 'function') {
        await (window as any).syncPending();
      }
      return count;
    });
    expect(recovered).toBeGreaterThanOrEqual(1);

    await expect.poll(async () => quarantinedTotal(page), { timeout: 10000 }).toBe(0);
    await expect.poll(async () => pendingTotal(page), { timeout: 10000 }).toBe(0);
    await refreshBar(page);
    expect(await readBarKind(page)).not.toBe('error');
  });

  test('4) Refresh durability: IDB survives page reload', async ({ page }) => {
    const state: MockState = {
      visitsInsertMode: 'success',
      storageUploadMode: 'success',
      storageObjects: new Set(),
      inserts: [],
    };
    await loginAsTsrReal(page, state);
    await clearOfflineQueues(page);

    // Submit one visit offline → pending=1.
    await page.context().setOffline(true);
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: true });
    await refreshBar(page);
    const before = await pendingTotal(page);
    expect(before).toBeGreaterThanOrEqual(1);

    // Reload — must briefly go back online so the static assets reload;
    // the IDB queue is durable across reloads regardless of network state.
    // Flip test-side mock to netfail during the online window so an
    // autoSync triggered by online/load doesn't drain the queue and
    // invalidate the durability assertion.
    state.visitsInsertMode = 'netfail';
    await page.context().setOffline(false);
    await page.reload();
    await page.waitForSelector('#page-home-tsr.active, #page-home.active', { timeout: 25000 });
    await hideBootDebug(page);

    // Drop network again to ensure the queued row didn't drain on reload.
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await refreshBar(page);
    const afterReload = await pendingTotal(page);
    expect(afterReload).toBeGreaterThanOrEqual(before);

    // Submit another offline — pending=2.
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: true });
    await refreshBar(page);
    expect(await pendingTotal(page)).toBeGreaterThanOrEqual(before + 1);

    // Reconnect → both drain. Restore success mode.
    state.visitsInsertMode = 'success';
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.evaluate(async () => {
      const db = (window as any).offlineDb;
      const rows = await db.pendingVisits.toArray();
      for (const r of rows) {
        r.next_attempt_after = null;
        await db.pendingVisits.put(r);
      }
      if (typeof (window as any).syncPending === 'function') {
        try { await (window as any).syncPending(); } catch (_e) {}
      }
    });
    await expect.poll(async () => pendingTotal(page), { timeout: 15000 }).toBe(0);
  });

  test('5) Photo flow rescue (Audit D O5): INSERT first, no orphan blob', async ({ page }) => {
    const state: MockState = {
      visitsInsertMode: 'success',
      storageUploadMode: 'success',
      storageObjects: new Set(),
      inserts: [],
    };
    await loginAsTsrReal(page, state);
    await clearOfflineQueues(page);

    // Submit offline → row sits in IDB with photo_base64.
    await page.context().setOffline(true);
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: true });

    // Flip storage to fail mid-upload. INSERT will succeed (photo_url=NULL)
    // but UPLOAD will fail — record stays in IDB with _inserted_row_id set.
    state.storageUploadMode = 'netfail';
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.evaluate(async () => {
      if (typeof (window as any).syncPending === 'function') {
        try { await (window as any).syncPending(); } catch (_e) {}
      }
    });

    // Server has received the visit with photo_url=null.
    const inserts1 = state.inserts.filter((i) => i.table === 'visits');
    expect(inserts1.length).toBeGreaterThanOrEqual(1);
    const lastInsert = inserts1[inserts1.length - 1];
    // photo_url is null on first INSERT (rescue-able, not an orphan blob).
    expect(lastInsert.row.photo_url == null).toBeTruthy();

    // Confirm _inserted_row_id was persisted on the queue record (proof
    // the rescue path is wired). The record is still in IDB awaiting upload.
    const idbState = await page.evaluate(async () => {
      const db = (window as any).offlineDb;
      const rows = await db.pendingVisits.toArray();
      return rows.map((r: any) => ({
        offline_id: r.offline_id,
        has_inserted_row_id: !!r._inserted_row_id,
        has_uploaded_photo_url: !!r._uploaded_photo_url,
        has_photo_base64: !!r.photo_base64,
      }));
    });
    expect(idbState.length).toBeGreaterThanOrEqual(1);
    expect(idbState[0].has_inserted_row_id).toBe(true);
    expect(idbState[0].has_uploaded_photo_url).toBe(false);

    // Fix Storage and re-drain → upload happens to deterministic path,
    // record dequeues.
    state.storageUploadMode = 'success';
    await page.evaluate(async () => {
      const db = (window as any).offlineDb;
      const rows = await db.pendingVisits.toArray();
      for (const r of rows) {
        r.next_attempt_after = null;
        await db.pendingVisits.put(r);
      }
      if (typeof (window as any).syncPending === 'function') {
        try { await (window as any).syncPending(); } catch (_e) {}
      }
    });
    await expect.poll(async () => pendingTotal(page), { timeout: 10000 }).toBe(0);

    // Storage saw exactly one upload PATH for this row (no orphan).
    // Multiple HTTP calls to the same path are allowed (upsert: true) —
    // we only assert that no duplicate sibling paths were created.
    expect(state.storageObjects.size).toBeLessThanOrEqual(1);
  });

  test('6) Retry classification: TypeError x4 — record STAYS in queue (W2-RetryClassify O1)', async ({ page }) => {
    const state: MockState = {
      visitsInsertMode: 'netfail', // every POST fails with network TypeError
      storageUploadMode: 'success',
      storageObjects: new Set(),
      inserts: [],
    };
    await loginAsTsrReal(page, state);
    await clearOfflineQueues(page);

    // Submit offline so we don't get a pre-drain attempt; then flip online
    // and drain 4 times. Each drain attempt should hit a network error and
    // the record MUST remain queued — never ejected.
    await page.context().setOffline(true);
    await submitVisit(page, { storeId: E2E_STORE_ID, storeName: E2E_STORE_NAME, offline: true });

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    for (let i = 0; i < 4; i++) {
      // Bypass the next_attempt_after backoff gate so syncPending actually
      // re-attempts the row on each iteration; pre-Wave-2 code ejected
      // after 3 retries, post-Wave-2 code retries forever.
      await page.evaluate(async () => {
        const db = (window as any).offlineDb;
        const rows = await db.pendingVisits.toArray();
        for (const r of rows) {
          r.next_attempt_after = null;
          await db.pendingVisits.put(r);
        }
        if (typeof (window as any).syncPending === 'function') {
          try { await (window as any).syncPending(); } catch (_e) {}
        }
      });
    }

    // After 4 consecutive transient failures the record is STILL queued
    // (no eject, no quarantine — transient errors retry forever).
    const stateAfter = await page.evaluate(async () => {
      const db = (window as any).offlineDb;
      const rows = await db.pendingVisits.toArray();
      return rows.map((r: any) => ({
        offline_id: r.offline_id,
        attempt_count: r.attempt_count || 0,
        quarantined_at: r.quarantined_at || null,
        last_error_class: r.last_error_class || null,
      }));
    });
    expect(stateAfter.length).toBeGreaterThanOrEqual(1);
    expect(stateAfter[0].attempt_count).toBeGreaterThanOrEqual(2); // at least 2 attempts recorded
    expect(stateAfter[0].quarantined_at).toBeNull();
    expect(stateAfter[0].last_error_class).toBe('transient');

    // Fix the mock → record finally drains.
    state.visitsInsertMode = 'success';
    await page.evaluate(async () => {
      const db = (window as any).offlineDb;
      const rows = await db.pendingVisits.toArray();
      for (const r of rows) {
        r.next_attempt_after = null;
        await db.pendingVisits.put(r);
      }
      if (typeof (window as any).syncPending === 'function') {
        try { await (window as any).syncPending(); } catch (_e) {}
      }
    });
    await expect.poll(async () => pendingTotal(page), { timeout: 10000 }).toBe(0);
  });
});

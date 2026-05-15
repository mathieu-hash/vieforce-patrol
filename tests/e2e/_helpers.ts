import { expect, type Page } from '@playwright/test';

export const E2E_STORE_ID = 'e2e-store-001';
export const E2E_STORE_NAME = 'E2E Test Store';

const SAMPLE_STORE = {
  id: E2E_STORE_ID,
  name: E2E_STORE_NAME,
  city: 'Manila',
  owner_name: 'Test Owner',
  phone: '09171234567',
  bags_per_month: 100,
  store_status: 'active',
  health_status: 'ok',
  assigned_tsr: 'e2e-tsr-001',
  created_by: 'e2e-tsr-001',
  region: 'Luzon',
  territory: 'MM-North',
};

function sessionExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

/** True when URL is the main app shell (static server may serve /app without .html). */
export function isAppShellUrl(url: URL): boolean {
  const path = url.pathname.replace(/\/$/, '') || '/';
  return path === '/app' || path.endsWith('/app.html');
}

export async function waitForAppShell(page: Page, timeout = 20000) {
  await page.waitForURL(isAppShellUrl, { timeout });
}

export function buildSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e2e-tsr-001',
    name: 'E2E TSR',
    role: 'tsr',
    region: 'Luzon',
    district: 'Metro Manila',
    territory: 'MM-North',
    is_champion: false,
    loggedInAt: new Date().toISOString(),
    expiresAt: sessionExpiry(),
    ...overrides,
  };
}

/** Seed session before the next navigation (avoids localStorage SecurityError on about:blank). */
export async function seedSession(
  page: Page,
  overrides: Record<string, unknown> = {}
) {
  const session = buildSession(overrides);
  await page.addInitScript((s) => {
    localStorage.setItem('patrol_session', JSON.stringify(s));
  }, session);
  return session;
}

/** Block live Supabase PostgREST so E2E does not depend on network or credentials. */
export async function installApiRouteMocks(page: Page) {
  await page.route('**/auth/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/stores')) {
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([SAMPLE_STORE]),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SAMPLE_STORE),
      });
    }

    if (url.includes('/visits')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: method === 'GET' ? '[]' : '{}',
    });
  });

  await page.route('**/api/user/language**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: '' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ locale: 'tl', language: 'tl' }),
    });
  });

  await page.route('**/api/admin/sap-reps**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, body: '' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reps: [
          {
            slp_code: 'E001',
            slp_name: 'E2E Rep',
            is_vacant: false,
            linked_supabase_user: {
              id: 'u1',
              name: 'Linked User',
              role: 'tsr',
              region: 'Luzon',
              district: 'MM',
              territory: 'MM-North',
            },
          },
        ],
        supabase_managers: [],
      }),
    });
  });
}

/** Suppress boot-debug overlay and stub geolocation before app scripts run. */
export async function installAppInitScripts(page: Page) {
  await installApiRouteMocks(page);
  await page.addInitScript(({ store }) => {
    const applyPatrolE2eStubs = () => {
      const sampleStore = store;
      const sampleStores = [sampleStore];

      window.getStores = async function () {
        return sampleStores;
      };
      window.getStoresByTSR = async function () {
        return sampleStores;
      };
      window.getVisitsByTSR = async function () {
        return [];
      };
      window.getStoreById = async function () {
        return sampleStore;
      };
      window.getVisitsByStore = async function () {
        return [];
      };
      window.updateStore = async function () {
        return sampleStore;
      };
      window.syncPending = async function () {
        return { synced: 0, errors: [], ejected: false };
      };
      window._attemptImmediateSync = async function () {
        return { state: 'queued', message: '\u2713 Na-save!' };
      };
      window.uploadPhoto = async function () {
        return 'https://e2e.example/photo.jpg';
      };
      window.capturePhoto = async function () {
        return new Blob([0xff, 0xd8, 0xff, 0xd9], { type: 'image/jpeg' });
      };
      window.getUserById = function (id: string) {
        return {
          id,
          name: 'E2E User',
          role: 'tsr',
          roleLabel: 'TSR',
          initials: 'EU',
          tier: 'standard',
        };
      };
      window.sapFetch = async function () {
        return { kpis: { bags: 1200 } };
      };
    };

    applyPatrolE2eStubs();
    window.addEventListener('DOMContentLoaded', applyPatrolE2eStubs);
  }, { store: SAMPLE_STORE });
  await page.addInitScript(() => {
    function suppressBootDebug() {
      try {
        localStorage.removeItem('patrol_bootlog');
      } catch (_e) {
        /* ignore */
      }
      const dbg = document.getElementById('patrol-boot-debug');
      const btn = document.getElementById('patrol-boot-debug-close');
      if (dbg) {
        dbg.style.display = 'none';
        dbg.style.visibility = 'hidden';
        dbg.style.pointerEvents = 'none';
      }
      if (btn) {
        btn.style.display = 'none';
        btn.style.pointerEvents = 'none';
      }
    }

    window._patrolBootLog = function () {
      suppressBootDebug();
    };
    suppressBootDebug();
    document.addEventListener('DOMContentLoaded', suppressBootDebug);
    window.addEventListener('load', () => {
      window._patrolBootLog = function () {
        suppressBootDebug();
      };
      suppressBootDebug();
    });

    const geo = navigator.geolocation;
    if (geo) {
      navigator.geolocation.getCurrentPosition = function (success, _error, _opts) {
        if (success) {
          success({
            coords: {
              latitude: 14.5995,
              longitude: 120.9842,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        }
      };
      navigator.geolocation.watchPosition = function (success) {
        if (success) {
          navigator.geolocation.getCurrentPosition(success);
        }
        return 1;
      };
    }
  });
}

export async function hideBootDebug(page: Page) {
  await page.evaluate(() => {
    function suppressBootDebug() {
      try {
        localStorage.removeItem('patrol_bootlog');
      } catch (_e) {
        /* ignore */
      }
      const dbg = document.getElementById('patrol-boot-debug');
      const btn = document.getElementById('patrol-boot-debug-close');
      if (dbg) {
        dbg.style.display = 'none';
        dbg.style.visibility = 'hidden';
        dbg.style.pointerEvents = 'none';
      }
      if (btn) {
        btn.style.display = 'none';
        btn.style.pointerEvents = 'none';
      }
    }
    window._patrolBootLog = function () {
      suppressBootDebug();
    };
    suppressBootDebug();
  });
}

/** Hide boot overlay then click — prevents #patrol-boot-debug intercepting pointer events. */
export async function safeClick(
  page: Page,
  locator: Parameters<Page['locator']>[0],
  options?: Parameters<ReturnType<Page['locator']>['click']>[0]
) {
  await hideBootDebug(page);
  await page.locator(locator).click(options);
}

export async function prepareAppPage(page: Page) {
  await hideBootDebug(page);
  await page.waitForSelector('.page.active', { timeout: 25000 });
}

/** Stubs store/visit/profile APIs so E2E does not need Supabase. */
export async function stubPatrolApis(page: Page) {
  await page.evaluate((store) => {
    const sampleStores = [store];

    window.getStores = async function () {
      return sampleStores;
    };
    window.getStoresByTSR = async function () {
      return sampleStores;
    };
    window.getVisitsByTSR = async function () {
      return [];
    };
    window.getStoreById = async function () {
      return store;
    };
    window.getVisitsByStore = async function () {
      return [];
    };
    window.updateStore = async function () {
      return store;
    };
    window.syncPending = async function () {
      return { synced: 0, errors: [], ejected: false };
    };
    window._attemptImmediateSync = async function () {
      return { state: 'queued', message: '\u2713 Na-save!' };
    };
    window.uploadPhoto = async function () {
      return 'https://e2e.example/photo.jpg';
    };
    window.capturePhoto = async function () {
      return new Blob([0xff, 0xd8, 0xff, 0xd9], { type: 'image/jpeg' });
    };
    window.getUserById = function (id: string) {
      return {
        id,
        name: 'E2E User',
        role: 'tsr',
        roleLabel: 'TSR',
        initials: 'EU',
        tier: 'standard',
      };
    };
    window.sapFetch = async function () {
      return { kpis: { bags: 1200 } };
    };
  }, SAMPLE_STORE);
}

export async function injectSession(
  page: Page,
  overrides: Record<string, unknown> = {}
) {
  const session = buildSession(overrides);
  await page.evaluate((s) => {
    localStorage.setItem('patrol_session', JSON.stringify(s));
  }, session);
}

export async function loginAsDsm(page: Page) {
  await installAppInitScripts(page);
  await seedSession(page, {
    id: 'e2e-dsm-001',
    name: 'E2E DSM',
    role: 'dsm',
    region: 'Visayas',
    district: 'CEBU-SOUTH',
    territory: null,
  });
  await page.goto('/app.html');
  await page.waitForSelector('#page-home-dsm.active', { timeout: 25000 });
  await prepareAppPage(page);
  await stubPatrolApis(page);
}

export async function loginAsTsr(page: Page) {
  await installAppInitScripts(page);
  await seedSession(page);
  await page.goto('/app.html');
  await page.waitForSelector('#page-home-tsr.active, #page-home.active', {
    timeout: 25000,
  });
  await prepareAppPage(page);
  await stubPatrolApis(page);
}

export async function loginAsRsm(page: Page) {
  await installAppInitScripts(page);
  await seedSession(page, {
    id: 'e2e-rsm-001',
    name: 'E2E RSM',
    role: 'rsm',
    region: 'Luzon',
    district: null,
    territory: null,
  });
  await page.goto('/app.html');
  await page.waitForSelector('#page-rsm-home.active', { timeout: 25000 });
  await prepareAppPage(page);
  await stubPatrolApis(page);
}

export async function loginAsCeo(page: Page) {
  await installAppInitScripts(page);
  await seedSession(page, {
    id: 'e2e-ceo-001',
    name: 'E2E CEO',
    role: 'ceo',
    region: null,
    district: null,
    territory: null,
  });
  await page.goto('/admin-users-sap.html');
  await page.waitForSelector('#sap-table-wrap', { timeout: 25000 });
}

export async function openMoreSheet(page: Page) {
  const moreBtn = page.locator('#bottom-nav button[data-action="more-sheet"]');
  await expect(moreBtn).toBeVisible({ timeout: 15000 });
  await moreBtn.click();
  await expect(page.locator('#more-sheet')).toBeVisible();
}

export async function openVisitSheet(
  page: Page,
  storeId = E2E_STORE_ID,
  storeName = E2E_STORE_NAME
) {
  await stubPatrolApis(page);
  await page.evaluate(
    ({ id, name }) => {
      if (typeof openVisitWizard === 'function') {
        openVisitWizard(id, name);
      }
    },
    { id: storeId, name: storeName }
  );
  await expect(page.locator('#visit-sheet')).toHaveClass(/open/, { timeout: 10000 });
  await expect(page.locator('#visit-overlay')).toHaveClass(/show/);
  await expect(page.locator('#visit-outcome-grid .outcome')).toHaveCount(3, {
    timeout: 10000,
  });
}

export async function selectVisitOutcome(page: Page, outcome: 'order' | 'no-order' | 'comeback') {
  await page.locator(`.outcome[data-outcome="${outcome}"]`).click();
  await expect(page.locator('#visit-details-panel')).toBeVisible();
}

export async function attachVisitPhoto(page: Page) {
  await page.locator('#visit-photo-btn').click();
  await expect(page.locator('#photo-hero-preview')).toBeVisible({ timeout: 10000 });
}

export async function countPendingVisits(page: Page): Promise<number> {
  return page.evaluate(async () => {
    if (typeof offlineDb !== 'undefined') {
      try {
        return await offlineDb.pendingVisits.count();
      } catch (_e) {
        return 0;
      }
    }
    return new Promise<number>((resolve) => {
      const req = indexedDB.open('PatrolOffline');
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('pendingVisits', 'readonly');
          const store = tx.objectStore('pendingVisits');
          const countReq = store.count();
          countReq.onsuccess = () => resolve(countReq.result || 0);
          countReq.onerror = () => resolve(0);
        } catch (_e2) {
          resolve(0);
        }
      };
      req.onerror = () => resolve(0);
    });
  });
}

export async function expectNoControllingServiceWorker(page: Page) {
  const hasController = await page.evaluate(
    () => !!(navigator.serviceWorker && navigator.serviceWorker.controller)
  );
  expect(hasController).toBe(false);
}

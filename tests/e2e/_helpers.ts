import { expect, type Page, type Route } from '@playwright/test';

export const E2E_STORE_ID = 'e2e-store-001';
export const E2E_STORE_NAME = 'E2E Test Store';
export const E2E_TSR_ID = 'e2e-tsr-001';
export const E2E_FARM_ID = 'e2e-farm-001';

const SAMPLE_TSR = {
  id: E2E_TSR_ID,
  name: 'E2E TSR',
  role: 'tsr',
  region: 'Visayas',
  district: 'CEBU-SOUTH',
  territory: 'CEBU-SOUTH',
  is_active: true,
};

const SAMPLE_FARM = {
  id: E2E_FARM_ID,
  name: 'E2E Test Farm',
  type: 'hog',
  city: 'Cebu',
  region: 'Visayas',
  assigned_tsr: null,
  created_by: E2E_TSR_ID,
};

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

/** PostgREST rows for admin.html (Sales Admin user management) — GET /users only when route is layered on. */
export const ADMIN_HTML_MOCK_USERS = [
  {
    id: '10000000-0000-4000-a000-000000000001',
    name: 'Alpha TSR',
    phone: '09170000001',
    role: 'tsr',
    region: 'Luzon',
    district: 'Metro Manila',
    territory: 'MM-North',
    is_active: true,
    is_champion: false,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    pin_hash: '1234',
  },
  {
    id: '10000000-0000-4000-a000-000000000002',
    name: 'Beta DSM',
    phone: '09170000002',
    role: 'dsm',
    region: 'Luzon',
    district: 'Metro Manila',
    territory: '',
    is_active: true,
    is_champion: false,
    created_at: '2025-01-02T00:00:00.000Z',
    updated_at: '2025-01-02T00:00:00.000Z',
    pin_hash: '2345',
  },
  {
    id: '10000000-0000-4000-a000-000000000003',
    name: 'Gamma TSR',
    phone: '09170000003',
    role: 'tsr',
    region: 'Visayas',
    district: 'Cebu',
    territory: 'South',
    is_active: true,
    is_champion: false,
    created_at: '2025-01-03T00:00:00.000Z',
    updated_at: '2025-01-03T00:00:00.000Z',
    pin_hash: '3456',
  },
];

function sessionExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Supabase is cross-origin (config.js host). Browsers hide `Content-Range` unless the response
 * lists it in `Access-Control-Expose-Headers`; postgrest-js needs that header to set `count`.
 */
function mockCorsHeaders(route: Route): Record<string, string> {
  const h = route.request().headers();
  const origin = h.origin || (h as { Origin?: string }).Origin || '*';
  const base: Record<string, string> = {
    'access-control-expose-headers': 'content-range',
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

    if (/\/rest\/v1\/stores(\?|$)/.test(url)) {
      const h = route.request().headers();
      const prefer = (h.prefer || (h as { Prefer?: string }).Prefer || '').toLowerCase();
      const wantsCount =
        prefer.includes('count=exact') ||
        prefer.includes('count=planned') ||
        /\bcount=/.test(prefer);
      // PostgREST: Supabase `head: true` count queries use HEAD; Prefer is not always visible to route mocks.
      const isCountRequest = wantsCount || method === 'HEAD';
      if ((method === 'GET' || method === 'HEAD') && isCountRequest) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            ...mockCorsHeaders(route),
            'content-range': '*/10',
          },
          body: method === 'HEAD' ? '' : '[]',
        });
      }
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: mockCorsHeaders(route),
          body: JSON.stringify([SAMPLE_STORE]),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: mockCorsHeaders(route),
        body: JSON.stringify(SAMPLE_STORE),
      });
    }

    if (/\/rest\/v1\/visits(\?|$)/.test(url)) {
      const h = route.request().headers();
      const prefer = (h.prefer || (h as { Prefer?: string }).Prefer || '').toLowerCase();
      const wantsCount =
        prefer.includes('count=exact') ||
        prefer.includes('count=planned') ||
        /\bcount=/.test(prefer);
      const isCountRequest = wantsCount || method === 'HEAD';
      if ((method === 'GET' || method === 'HEAD') && isCountRequest) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            ...mockCorsHeaders(route),
            'content-range': '*/4',
          },
          body: method === 'HEAD' ? '' : '[]',
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: mockCorsHeaders(route),
        body: JSON.stringify([]),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: mockCorsHeaders(route),
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

/**
 * Register after installApiRouteMocks so GET /users is fulfilled before the generic REST handler.
 * Used by admin.html (Sales Admin user management) E2E.
 */
export async function installAdminHtmlUserListMock(page: Page) {
  await page.route('**/rest/v1/users*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: mockCorsHeaders(route),
        body: JSON.stringify(ADMIN_HTML_MOCK_USERS),
      });
      return;
    }
    await route.fallback();
  });
}

/** CEO session on admin.html with mocked PostgREST (users + stats); no live Supabase. */
export async function loginToSalesAdminHtml(page: Page) {
  await installApiRouteMocks(page);
  await installAdminHtmlUserListMock(page);
  await seedSession(page, {
    id: 'e2e-ceo-001',
    name: 'E2E CEO',
    role: 'ceo',
    region: null,
    district: null,
    territory: null,
  });
  await page.goto('/admin.html');
  await expect(page.locator('#admin-user-list .admin-user-card')).toHaveCount(3, {
    timeout: 25000,
  });
  await expect(page.locator('#admin-stat-users')).toHaveText('3', { timeout: 15000 });
  await expect(page.locator('#admin-stat-active')).toHaveText('2');
  await expect(page.locator('#admin-stat-stores')).toHaveText('10');
  await expect(page.locator('#admin-stat-visits')).toHaveText('4');
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

/** Stubs store/farm assignment APIs for DSM assign page E2E. */
export async function stubAssignApis(page: Page) {
  await page.evaluate(
    ({ tsr, store, farm }) => {
      window.getTSRsByDistrict = async function () {
        return [tsr];
      };
      window.getUnassignedStores = async function () {
        return [store];
      };
      window.getAssignmentCounts = async function () {
        return { [tsr.id]: 0 };
      };
      window.getStoresByTSR = async function () {
        return [];
      };
      window.assignStores = async function (ids: string[]) {
        return { count: ids.length };
      };
      window.unassignStores = async function () {
        return { count: 0 };
      };
      window.getUnassignedFarms = async function () {
        return [farm];
      };
      window.getFarmAssignmentCounts = async function () {
        return { [tsr.id]: 0 };
      };
      window.getFarmsByTSR = async function () {
        return [];
      };
      window.assignFarms = async function (ids: string[]) {
        return { count: ids.length };
      };
      window.unassignFarms = async function () {
        return { count: 0 };
      };
    },
    { tsr: SAMPLE_TSR, store: SAMPLE_STORE, farm: SAMPLE_FARM }
  );
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
  await stubAssignApis(page);
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

export async function getLastPendingVisit(
  page: Page
): Promise<Record<string, unknown> | null> {
  return page.evaluate(async () => {
    const win = window as Window & {
      offlineDb?: {
        pendingVisits: {
          orderBy: (key: string) => {
            reverse: () => {
              limit: (n: number) => { toArray: () => Promise<Record<string, unknown>[]> };
            };
          };
        };
      };
    };
    if (win.offlineDb?.pendingVisits) {
      try {
        const rows = await win.offlineDb.pendingVisits
          .orderBy('id')
          .reverse()
          .limit(1)
          .toArray();
        return rows[0] || null;
      } catch (_e) {
        return null;
      }
    }
    return new Promise<Record<string, unknown> | null>((resolve) => {
      const req = indexedDB.open('PatrolOffline');
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('pendingVisits', 'readonly');
          const store = tx.objectStore('pendingVisits');
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            const rows = (allReq.result || []) as Record<string, unknown>[];
            resolve(rows.length ? rows[rows.length - 1] : null);
          };
          allReq.onerror = () => resolve(null);
        } catch (_e2) {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  });
}

export async function expectNoControllingServiceWorker(page: Page) {
  const hasController = await page.evaluate(
    () => !!(navigator.serviceWorker && navigator.serviceWorker.controller)
  );
  expect(hasController).toBe(false);
}

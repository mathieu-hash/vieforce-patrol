import { test, expect } from '@playwright/test';
import {
  expectSapRosterLoaded,
  installAppInitScripts,
  seedSession,
  waitForAppShell,
} from './_helpers';

const MOCK_SAP = {
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
};

test.describe('11 — Admin SAP roster page', () => {
  test('@smoke CEO session loads roster table (mocked API)', async ({ page }) => {
    await installAppInitScripts(page);
    await page.route('**/api/admin/sap-reps**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SAP),
      });
    });
    await seedSession(page, {
      id: 'e2e-ceo-001',
      name: 'E2E CEO',
      role: 'ceo',
      region: null,
      district: null,
      territory: null,
    });
    await page.goto('/admin-users-sap.html');
    await expectSapRosterLoaded(page, '1');
  });

  test('TSR without admin access redirects to app shell', async ({ page }) => {
    await installAppInitScripts(page);
    await page.route('**/api/admin/sap-reps**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden' }),
      });
    });
    await seedSession(page, { id: 'e2e-tsr-001', name: 'E2E TSR', role: 'tsr' });
    await Promise.all([
      waitForAppShell(page, 15000),
      page.goto('/admin-users-sap.html'),
    ]);
  });

  test('CEO sees API error panel when roster fetch fails', async ({ page }) => {
    await installAppInitScripts(page);
    await page.route('**/api/admin/sap-reps**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden' }),
      });
    });
    await seedSession(page, {
      id: 'e2e-ceo-001',
      name: 'E2E CEO',
      role: 'ceo',
    });
    await page.goto('/admin-users-sap.html');
    await expect(page.locator('#sap-error')).toBeVisible({ timeout: 15000 });
  });
});

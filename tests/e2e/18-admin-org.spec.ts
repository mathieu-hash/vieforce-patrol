import { test, expect, type Page } from '@playwright/test';
import {
  E2E_TSR_ID,
  installApiRouteMocks,
  seedSession,
  waitForAppShell,
} from './_helpers';

const ORG_FIXTURE = {
  regions: [
    {
      id: 'region-luzon',
      name: 'Luzon',
      source: 'sap',
      user_count: 3,
      is_active: true,
      districts: [
        {
          id: 'district-mm',
          name: 'Metro Manila',
          sap_district_code: 'MM',
          sap_district_label: 'Metro Manila',
          user_count: 2,
          is_active: true,
          territories: [
            { id: 'territory-mm-north', name: 'MM-North', user_count: 1, is_active: true },
            { id: 'territory-mm-south', name: 'MM-South', user_count: 1, is_active: true },
          ],
        },
        {
          id: 'district-cl',
          name: 'Central Luzon',
          sap_district_code: 'CL',
          sap_district_label: 'Central Luzon',
          user_count: 1,
          is_active: true,
          territories: [],
        },
      ],
    },
    {
      id: 'region-visayas',
      name: 'Visayas',
      source: 'sap',
      user_count: 1,
      is_active: true,
      districts: [
        {
          id: 'district-cebu',
          name: 'Cebu',
          sap_district_code: 'CEB',
          sap_district_label: 'Cebu',
          user_count: 1,
          is_active: true,
          territories: [{ id: 'territory-cebu-south', name: 'Cebu-South', user_count: 1, is_active: true }],
        },
      ],
    },
  ],
};

async function loginToAdminOrg(page: Page) {
  await installApiRouteMocks(page);
  await page.route('**/api/admin/org**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { action?: string; name?: string } | null;
      if (body?.action === 'sync_sap') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ regions: 2, districts: 3 }),
        });
      }
      if (body?.action === 'territory_create') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'territory-new', name: body.name }),
        });
      }
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ORG_FIXTURE),
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
  await page.goto('/admin-org.html');
  await expect(page.locator('#org-layout')).toBeVisible({ timeout: 15000 });
}

test.describe('18 — Org master admin', () => {
  test('@smoke CEO sees org master regions, districts, and territories', async ({ page }) => {
    await loginToAdminOrg(page);

    await expect(page.locator('#admin-org-name')).toHaveText('E2E CEO');
    await expect(page.locator('#org-region-list')).toContainText('Luzon');
    await expect(page.locator('#org-district-list')).toContainText('Metro Manila');
    await expect(page.locator('#org-territory-list')).toContainText('MM-North');
    await expect(page.locator('#org-loading')).toBeHidden();
  });

  test('Search filters org master rows without leaving the page blank', async ({ page }) => {
    await loginToAdminOrg(page);

    await page.locator('#org-search').fill('Visayas');
    await expect(page.locator('#org-region-list')).toContainText('Visayas');
    await expect(page.locator('#org-region-list')).not.toContainText('Luzon');
    await expect(page.locator('#org-layout')).toBeVisible();
  });

  test('Sync from SAP and Add territory use mocked admin API safely', async ({ page }) => {
    await loginToAdminOrg(page);

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#org-sync-sap').click();
    await expect(page.locator('#org-sync-sap')).toBeEnabled({ timeout: 10000 });

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#org-new-territory').fill('MM-East');
    await page.locator('#org-add-territory').click();
    await expect(page.locator('#org-new-territory')).toHaveValue('', { timeout: 10000 });
  });

  test('API failure shows retryable error panel', async ({ page }) => {
    await installApiRouteMocks(page);
    await page.route('**/api/admin/org**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Org API unavailable' }),
      });
    });
    await seedSession(page, { id: 'e2e-ceo-001', name: 'E2E CEO', role: 'ceo' });

    await page.goto('/admin-org.html');

    await expect(page.locator('#org-error')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#org-error-msg')).toContainText('Org API unavailable');
    await expect(page.locator('#org-error-retry')).toBeVisible();
  });

  test('TSR without org admin access is redirected to app shell', async ({ page }) => {
    await installApiRouteMocks(page);
    await seedSession(page, {
      id: E2E_TSR_ID,
      name: 'E2E TSR',
      role: 'tsr',
      region: 'Luzon',
      district: 'Metro Manila',
      territory: 'MM-North',
    });

    await Promise.all([waitForAppShell(page, 20000), page.goto('/admin-org.html')]);

    await expect(page).not.toHaveURL(/admin-org\.html$/);
  });
});

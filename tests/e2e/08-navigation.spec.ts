import { test, expect } from '@playwright/test';
import { loginAsDsm, loginAsTsr } from './_helpers';

test.describe('08 — Role-aware navigation', () => {
  test('TSR wide viewport keeps default 5-tab bar with More', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await loginAsTsr(page);
    await expect(page.locator('#bottom-nav button[data-action="more-sheet"]')).toBeVisible();
    await expect(page.locator('#bottom-nav .nav-item[data-page="page-stores"]')).toBeVisible();
  });

  test('TSR mobile uses emoji nav strip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);
    const nav = page.locator('#bottom-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.nav-item, button')).toHaveCount(5, { timeout: 10000 });
  });

  test('DSM mobile nav includes Sales tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDsm(page);
    const sales = page.locator('#bottom-nav .nav-item[data-page="pg-sales"]');
    await expect(sales).toBeVisible();
    await sales.click();
    await expect(page.locator('#pg-sales')).toHaveClass(/active/, { timeout: 10000 });
  });

  test('DSM nav to Stores does not leave shell blank', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsDsm(page);
    await page.locator('#bottom-nav .nav-item[data-page="page-stores"]').click();
    await expect(page.locator('#page-stores.active')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#tindahanTitle')).toBeVisible();
  });
});

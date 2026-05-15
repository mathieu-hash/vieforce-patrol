import { test, expect } from '@playwright/test';
import { loginAsRsm, openMoreSheet } from './_helpers';

test.describe('07 — RSM Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsRsm(page);
  });

  test('@smoke RSM lands on regional home', async ({ page }) => {
    await expect(page.locator('#page-rsm-home')).toHaveClass(/active/);
  });

  test('RSM bottom nav includes Stores tab', async ({ page }) => {
    const storesTab = page.locator('#bottom-nav .nav-item[data-page="page-stores"]');
    await expect(storesTab).toBeVisible();
    await storesTab.click();
    await expect(page.locator('#page-stores')).toHaveClass(/active/, { timeout: 10000 });
  });

  test('RSM More sheet opens on mobile', async ({ page }) => {
    await openMoreSheet(page);
    await page.locator('#more-sheet .more-sheet-backdrop').click();
    await expect(page.locator('#more-sheet')).toBeHidden();
  });
});

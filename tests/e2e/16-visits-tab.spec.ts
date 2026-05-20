import { test, expect } from '@playwright/test';
import { loginAsTsr, openTsrVisits } from './_helpers';

test.describe('16 — Visits tab', () => {
  test('Visits page loads and shows empty or visit rows', async ({ page }) => {
    await loginAsTsr(page);
    await page.evaluate(() => {
      if (typeof nav === 'function') nav('page-visits');
    });
    await expect(page.locator('#page-visits.active')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#visits-page-title')).toBeVisible();
    await expect(page.locator('#visit-search')).toBeVisible();
    const list = page.locator('#visit-list .vf-visits-empty, #visit-list .vf-visit-row, #visit-list .skeleton-row');
    await expect(list.first()).toBeVisible({ timeout: 10000 });
  });

  test('TSR reaches Visits via More sheet (Phase B nav)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);

    await openTsrVisits(page);

    await expect(page.locator('#visits-page-title')).toBeVisible();
    await expect(page.locator('#visit-search')).toBeVisible();
    const list = page.locator('#visit-list .vf-visits-empty, #visit-list .vf-visit-row, #visit-list .skeleton-row');
    await expect(list.first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#more-sheet')).toBeHidden();
  });
});

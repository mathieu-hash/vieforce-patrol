import { test, expect } from '@playwright/test';
import { loginAsTsr } from './_helpers';

test.describe('16 — Visits tab', () => {
  test('Visits page loads and shows empty or visit rows', async ({ page }) => {
    await loginAsTsr(page);
    await page.evaluate(() => {
      if (typeof nav === 'function') nav('page-visits');
    });
    await expect(page.locator('#page-visits.active')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#visits-page-title')).toBeVisible();
    await expect(page.locator('#visit-search')).toBeVisible();
    await expect(page.locator('#visits-loading-hint')).toBeHidden({ timeout: 20000 });
    const list = page.locator('#visit-list .vf-visits-empty, #visit-list .vf-visit-row');
    await expect(list.first()).toBeVisible({ timeout: 10000 });
  });
});

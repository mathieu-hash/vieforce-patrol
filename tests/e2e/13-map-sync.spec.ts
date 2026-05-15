import { test, expect } from '@playwright/test';
import { hideBootDebug, loginAsTsr } from './_helpers';

test.describe('13 — Map & sync bar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTsr(page);
  });

  test('TSR map tab loads without fatal errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const mapTab = page.locator(
      '#bottom-nav .nav-item[data-page="page-mapa-tsr"], #bottom-nav .nav-item[data-page="page-map"]'
    );
    await hideBootDebug(page);
    await mapTab.first().click({ force: true });
    await page.waitForTimeout(2000);
    const activeMap = page.locator('#page-mapa-tsr.active, #page-map.active');
    await expect(activeMap.first()).toBeVisible({ timeout: 15000 });
    const fatal = errors.filter((m) => !/favicon|leaflet|maplibre/i.test(m));
    expect(fatal).toEqual([]);
  });

  test('Sync bar element exists in shell', async ({ page }) => {
    await expect(page.locator('#global-sync-bar')).toHaveCount(1);
  });

  test('Offline toggles navigator.onLine flag used by app', async ({ page }) => {
    await page.context().setOffline(true);
    const online = await page.evaluate(() => navigator.onLine);
    expect(online).toBe(false);
    await page.context().setOffline(false);
    const onlineAgain = await page.evaluate(() => navigator.onLine);
    expect(onlineAgain).toBe(true);
  });
});

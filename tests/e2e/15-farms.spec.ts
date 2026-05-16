import { test, expect } from '@playwright/test';
import { hideBootDebug, loginAsTsr } from './_helpers';

test.describe('15 — Farms smoke', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTsr(page);
  });

  test('Map Bukid filter chip toggles active state', async ({ page }) => {
    await page.evaluate(() => {
      if (typeof nav === 'function') nav('page-map');
    });
    await expect(page.locator('#page-map.active')).toBeVisible({ timeout: 15000 });
    await hideBootDebug(page);
    const farmChip = page.locator('#page-map .map-filter-chip[data-filter="farm"]');
    await expect(farmChip).toBeVisible({ timeout: 10000 });
    await farmChip.click();
    await expect(farmChip).toHaveClass(/active/, { timeout: 10000 });
    const activeFilter = await page.evaluate(() => {
      return typeof _activeMapFilter !== 'undefined' ? _activeMapFilter : null;
    });
    expect(activeFilter).toBe('farm');
  });

  test('Farm registration chatbot page opens', async ({ page }) => {
    await page.evaluate(() => {
      if (typeof openChatbotFarm === 'function') openChatbotFarm();
    });
    await expect(page.locator('#page-farm-new.active')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#new-farm-messages')).toBeVisible();
  });
});

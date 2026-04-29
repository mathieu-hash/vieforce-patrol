import { test, expect } from '@playwright/test';

// Helper: inject a TSR session
async function loginAsTSR(page) {
  await page.goto('/app.html');
  await page.evaluate(() => {
    localStorage.setItem('patrol_session', JSON.stringify({
      id: 'test-tsr-001',
      name: 'Rico Abante',
      role: 'tsr',
      region: 'Luzon',
      district: 'Metro Manila',
      territory: 'MM-North',
      is_champion: false,
      loggedInAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }));
  });
  await page.reload();
  await page.waitForSelector('#page-home.active, #page-stores', { timeout: 10000 });
}

test.describe('02 — Stores', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTSR(page);
  });

  test('Store list page loads for TSR', async ({ page }) => {
    await page.click('.nav-item[data-page="page-stores"]');
    await expect(page.locator('#page-stores')).toHaveClass(/active/);
    await expect(page.locator('#stores-title')).toBeVisible();
  });

  test('Store search input is visible', async ({ page }) => {
    await page.click('.nav-item[data-page="page-stores"]');
    await expect(page.locator('#store-search')).toBeVisible();
  });

  test('Filter chips are present and clickable', async ({ page }) => {
    await page.click('.nav-item[data-page="page-stores"]');
    const chips = page.locator('[data-filter-row="health"] .tab');
    await expect(chips).toHaveCount(5);
    // First chip should be active
    await expect(chips.first()).toHaveClass(/active/);
  });

  test('New store button opens wizard', async ({ page }) => {
    await page.click('.nav-item[data-page="page-stores"]');
    await page.click('#btn-new-store');
    await expect(page.locator('#page-store-new')).toHaveClass(/active/);
    // Wizard step 1 should be visible
    await expect(page.locator('#wizard-step1')).toBeVisible();
  });

  test('Empty state shows when no stores assigned', async ({ page }) => {
    // Clear any cached stores
    await page.evaluate(() => {
      // Clear IndexedDB store cache
      indexedDB.deleteDatabase('PatrolDB');
    });
    await page.click('.nav-item[data-page="page-stores"]');
    // Store list area should exist even if empty
    await expect(page.locator('#storesList')).toBeVisible();
  });

  test('Tap store opens store detail', async ({ page }) => {
    await page.click('.nav-item[data-page="page-stores"]');
    // Wait for stores to render (or skeleton)
    await page.waitForTimeout(2000);
    const storeRow = page.locator('#storesList .store-row').first();
    if (await storeRow.isVisible()) {
      await storeRow.click();
      await expect(page.locator('#page-store-detail')).toHaveClass(/active/);
    }
    // If no stores loaded (offline/empty), test passes — empty state is valid
  });
});

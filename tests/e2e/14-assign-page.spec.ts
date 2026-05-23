import { test, expect } from '@playwright/test';
import {
  E2E_FARM_ID,
  E2E_STORE_NAME,
  E2E_TSR_ID,
  loginAsDsm,
  safeClick,
} from './_helpers';

const E2E_FARM_NAME = 'E2E Test Farm';

test.describe('14 — DSM assign page (stores + farms)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDsm(page);
    await page.evaluate(() => {
      if (typeof nav === 'function') nav('page-assign');
    });
    await expect(page.locator('#page-assign.active')).toBeVisible({ timeout: 15000 });
  });

  test('Assign page loads store mode by default', async ({ page }) => {
    await expect(page.locator('#assign-page-title')).toHaveText(/(I-assign ang Stores|Assign Stores)/i);
    await expect(page.locator('#assign-unassigned-label')).toHaveText(/Unassigned Stores/i);
    await expect(page.locator('#assign-mode-stores')).toHaveClass(/active/);
    await expect(page.locator('#assign-stores-unassigned .assign-store-row')).toContainText(
      E2E_STORE_NAME
    );
  });

  test('Bukid tab switches to farm assignment mode', async ({ page }) => {
    await safeClick(page, '#assign-mode-farms');
    await expect(page.locator('#assign-page-title')).toHaveText(/(I-assign ang Bukid|Assign Farms)/i);
    await expect(page.locator('#assign-unassigned-label')).toHaveText(/(Unassigned Bukid|Unassigned Farms)/i);
    await expect(page.locator('#assign-mode-farms')).toHaveClass(/active/);
    await expect(page.locator('#assign-stores-unassigned .assign-store-row')).toContainText(
      E2E_FARM_NAME
    );
  });

  test('DSM can assign a farm to a TSR', async ({ page }) => {
    await safeClick(page, '#assign-mode-farms');
    await safeClick(page, `#assign-tsr-list .assign-tsr-row[data-tsr-id="${E2E_TSR_ID}"]`);
    await expect(page.locator('#assign-selected-label')).toContainText(/E2E TSR/i);
    await safeClick(page, `[data-store-id="${E2E_FARM_ID}"]`);
    await expect(page.locator('#assign-toast')).toContainText(/assign/i, { timeout: 10000 });
  });
});

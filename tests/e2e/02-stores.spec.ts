import { test, expect } from '@playwright/test';
import { loginAsTsr, safeClick } from './_helpers';

test.describe('02 — Stores', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTsr(page);
  });

  test('Store list page loads for TSR', async ({ page }) => {
    await safeClick(page, '.nav-item[data-page="page-stores"]');
    await expect(page.locator('#page-stores')).toHaveClass(/active/);
    await expect(page.locator('#tindahanTitle')).toBeVisible();
  });

  test('Store search input is visible', async ({ page }) => {
    await safeClick(page, '.nav-item[data-page="page-stores"]');
    await expect(page.locator('#tindahan-store-search')).toBeVisible();
  });

  test('Circle filters are present and clickable', async ({ page }) => {
    await safeClick(page, '.nav-item[data-page="page-stores"]');
    const filters = page.locator('#tindahanFilterGrid .tindahan-filter-item');
    await expect(filters).toHaveCount(4);
    await filters.first().click();
    await expect(filters.first()).toHaveClass(/active/);
  });

  test('New store button opens chatbot registration', async ({ page }) => {
    await safeClick(page, '.nav-item[data-page="page-stores"]');
    await page.locator('#btn-new-store').click();
    await expect(page.locator('#page-store-new')).toHaveClass(/active/);
    await expect(page.locator('#new-store-messages')).toBeVisible();
    await page.waitForFunction(
      () => {
        const el = document.getElementById('new-store-messages');
        return el && (el.textContent || '').trim().length > 0;
      },
      { timeout: 15000 }
    );
  });

  test('Store list container renders', async ({ page }) => {
    await safeClick(page, '.nav-item[data-page="page-stores"]');
    await expect(page.locator('#page-stores')).toHaveClass(/active/);
    await expect(page.locator('#tindahanAllList')).toBeAttached();
    await page.waitForFunction(
      () => {
        const pri = document.getElementById('tindahanPriorityList');
        const all = document.getElementById('tindahanAllList');
        const hasRows = (el) => !!el && !!el.querySelector('.tindahan-row');
        const hasEmpty = (el) => !!el && !!el.querySelector('.tindahan-empty');
        return hasRows(pri) || hasRows(all) || hasEmpty(all);
      },
      { timeout: 20000 }
    );
  });

  test('Tap store opens store detail when rows exist', async ({ page }) => {
    await safeClick(page, '.nav-item[data-page="page-stores"]');
    await page.waitForTimeout(2000);
    const storeRow = page
      .locator('#tindahanAllList .tindahan-row, #tindahanPriorityList .tindahan-row')
      .first();
    if (await storeRow.isVisible()) {
      await storeRow.click();
      await expect(page.locator('#page-store-detail')).toHaveClass(/active/);
    }
  });
});

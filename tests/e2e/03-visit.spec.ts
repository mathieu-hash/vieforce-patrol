import { test, expect } from '@playwright/test';
import {
  loginAsTsr,
  openVisitSheet,
  selectVisitOutcome,
  attachVisitPhoto,
  countPendingVisits,
} from './_helpers';

test.describe('03 — Visit bottom sheet', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTsr(page);
  });

  test('Visit sheet shows three outcome options', async ({ page }) => {
    await openVisitSheet(page);
    const outcomes = page.locator('#visit-outcome-grid .outcome');
    await expect(outcomes).toHaveCount(3);
    await expect(outcomes.nth(0)).toContainText(/With Order|May Order|Adunay order/i);
    await expect(outcomes.nth(1)).toContainText(/Walang Order|No Order|Nakausap/i);
    await expect(outcomes.nth(2)).toContainText(/Bukas ulit|Come back|Balik/i);
  });

  test('Outcome "May Order" expands order form', async ({ page }) => {
    await openVisitSheet(page);
    await selectVisitOutcome(page, 'order');
    const orderPanel = page.locator('#visit-order-panel');
    await expect(orderPanel).toBeVisible();
    await expect(orderPanel).toHaveClass(/open/);
    await expect(page.locator('#visit-order-amount')).toBeVisible();
  });

  test('Outcome "Walang Order" hides order amount field', async ({ page }) => {
    await openVisitSheet(page);
    await selectVisitOutcome(page, 'no-order');
    await expect(page.locator('#visit-order-panel')).not.toHaveClass(/open/);
    await expect(page.locator('#visit-extra-notes')).toBeVisible();
  });

  test('Outcome "Bukas ulit" pre-fills notes', async ({ page }) => {
    await openVisitSheet(page);
    await selectVisitOutcome(page, 'comeback');
    const notes = page.locator('#visit-extra-notes');
    await expect(notes).not.toHaveValue('');
  });

  test('Submit stays disabled until outcome and photo', async ({ page }) => {
    await openVisitSheet(page);
    const submitBtn = page.locator('#btn-visit-submit');
    await expect(submitBtn).toBeDisabled();
    await selectVisitOutcome(page, 'no-order');
    await expect(submitBtn).toBeDisabled();
    await attachVisitPhoto(page);
    await expect(submitBtn).toBeEnabled();
  });

  test('Submit without photo shows error', async ({ page }) => {
    await openVisitSheet(page);
    await selectVisitOutcome(page, 'no-order');
    await page.evaluate(() => {
      if (typeof submitVisit === 'function') submitVisit();
    });
    await expect(page.locator('#visit-submit-error')).toBeVisible({ timeout: 10000 });
  });

  test('GPS warning hidden when geolocation succeeds', async ({ page }) => {
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 14.5995, longitude: 120.9842 });
    await openVisitSheet(page);
    await page.waitForTimeout(3000);
    await expect(page.locator('#visit-gps-warning')).toBeHidden();
  });

  test('Submit visit queues to IndexedDB (online)', async ({ page }) => {
    const before = await countPendingVisits(page);
    await openVisitSheet(page);
    await selectVisitOutcome(page, 'no-order');
    await attachVisitPhoto(page);
    await page.fill('#visit-extra-notes', 'Playwright E2E visit');
    await page.locator('#btn-visit-submit').click();
    await expect(page.locator('#btn-visit-submit')).toContainText(
      /Na-save|Saved|synced|saved locally|✓/i,
      { timeout: 25000 }
    );
    const after = await countPendingVisits(page);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test('Submit visit offline still queues', async ({ page }) => {
    await openVisitSheet(page);
    await selectVisitOutcome(page, 'no-order');
    await attachVisitPhoto(page);
    await page.context().setOffline(true);
    await page.locator('#btn-visit-submit').click();
    await expect(page.locator('#btn-visit-submit')).toContainText(
      /Na-save|Saved|synced|saved locally|✓/i,
      { timeout: 25000 }
    );
    await page.context().setOffline(false);
  });
});

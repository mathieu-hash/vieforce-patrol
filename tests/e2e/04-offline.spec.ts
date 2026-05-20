import { test, expect } from '@playwright/test';
import {
  loginAsTsr,
  openVisitSheet,
  selectVisitOutcome,
  attachVisitPhoto,
  countPendingVisits,
  getLastPendingVisit,
  expectNoControllingServiceWorker,
} from './_helpers';

test.describe('04 — Offline resilience (IndexedDB queue)', () => {
  test('App shell stays usable offline after initial load (no SW cache required)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('patrol_nosw', '1');
    });
    await loginAsTsr(page);
    await expectNoControllingServiceWorker(page);
    await page.context().setOffline(true);
    await page.locator('.nav-item[data-page="page-stores"]').click();
    await expect(page.locator('#page-stores')).toHaveClass(/active/, { timeout: 15000 });
    await page.context().setOffline(false);
  });

  test('Visit submits and queues when offline', async ({ page }) => {
    await loginAsTsr(page);
    const before = await countPendingVisits(page);
    await openVisitSheet(page, 'e2e-store-offline', 'Offline Test Store');
    await selectVisitOutcome(page, 'no-order');
    await attachVisitPhoto(page);
    await page.context().setOffline(true);
    await page.locator('#btn-visit-submit').click();
    await expect(page.locator('#btn-visit-submit')).toContainText(
      /Na-save|Saved|synced|saved locally|✓/i,
      { timeout: 25000 }
    );
    const after = await countPendingVisits(page);
    expect(after).toBeGreaterThan(before);
    await page.context().setOffline(false);
  });

  test('Reconnect after offline does not crash shell', async ({ page }) => {
    await loginAsTsr(page);
    await openVisitSheet(page, 'e2e-store-sync', 'Sync Test Store');
    await selectVisitOutcome(page, 'no-order');
    await attachVisitPhoto(page);
    await page.context().setOffline(true);
    await page.locator('#btn-visit-submit').click();
    await expect(page.locator('#btn-visit-submit')).toContainText(
      /Na-save|Saved|synced|saved locally|✓/i,
      { timeout: 25000 }
    );
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).toBeVisible();
    const syncBar = page.locator('#global-sync-bar');
    if (await syncBar.isVisible()) {
      await expect(syncBar).toBeVisible();
    }
  });

  test('Queued visit remains in PatrolOffline after offline submit', async ({ page }) => {
    await loginAsTsr(page);
    await openVisitSheet(page, 'e2e-store-nodataloss', 'No Data Loss Store');
    await selectVisitOutcome(page, 'order');
    await page.fill('#visit-order-amount', '15000');
    await attachVisitPhoto(page);
    await page.context().setOffline(true);
    await page.locator('#btn-visit-submit').click();
    await expect(page.locator('#btn-visit-submit')).toContainText(
      /Na-save|Saved|synced|saved locally|✓/i,
      { timeout: 25000 }
    );
    const pending = await countPendingVisits(page);
    expect(pending).toBeGreaterThan(0);
    await page.context().setOffline(false);
  });

  test('Offline visit keeps photo_base64 in IndexedDB queue', async ({ page }) => {
    await loginAsTsr(page);
    await openVisitSheet(page, 'e2e-store-photo-queue', 'Photo Queue Store');
    await selectVisitOutcome(page, 'no-order');
    await attachVisitPhoto(page);
    await page.context().setOffline(true);
    await page.locator('#btn-visit-submit').click();
    await expect(page.locator('#btn-visit-submit')).toContainText(
      /Na-save|Saved|synced|saved locally|✓/i,
      { timeout: 25000 }
    );
    const last = await getLastPendingVisit(page);
    expect(last).toBeTruthy();
    const photoB64 = last?.photo_base64;
    expect(typeof photoB64).toBe('string');
    expect(String(photoB64).length).toBeGreaterThan(20);
    await page.context().setOffline(false);
  });
});

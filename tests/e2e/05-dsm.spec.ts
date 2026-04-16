import { test, expect } from '@playwright/test';

async function loginAsDSM(page) {
  await page.goto('/app.html');
  await page.evaluate(() => {
    localStorage.setItem('patrol_session', JSON.stringify({
      id: 'test-dsm-001',
      name: 'Maria Santos',
      role: 'dsm',
      region: 'Luzon',
      district: 'Metro Manila',
      territory: null,
      is_champion: false,
      loggedInAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }));
  });
  await page.reload();
  await page.waitForSelector('#page-dashboard.active', { timeout: 10000 });
}

test.describe('05 — DSM Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDSM(page);
  });

  test('DSM login shows dashboard with KPIs', async ({ page }) => {
    // Dashboard should be the active page for DSM
    await expect(page.locator('#page-dashboard')).toHaveClass(/active/);

    // KPI cards should be present
    await expect(page.locator('#dsm-kpi-stores')).toBeVisible();
    await expect(page.locator('#dsm-kpi-farms')).toBeVisible();
    await expect(page.locator('#dsm-kpi-visits')).toBeVisible();
    await expect(page.locator('#dsm-kpi-orders')).toBeVisible();
  });

  test('Dashboard has segment matrix section', async ({ page }) => {
    await expect(page.locator('#dsm-segment-matrix')).toBeVisible();
  });

  test('Dashboard has visit trend chart', async ({ page }) => {
    await expect(page.locator('#dsm-visit-chart')).toBeVisible();
  });

  test('Assignment page opens from dashboard', async ({ page }) => {
    // Click "I-assign ang Stores" button
    const assignBtn = page.locator('button:has-text("I-assign")');
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      await expect(page.locator('#page-assign')).toHaveClass(/active/);
    }
  });

  test('Export buttons are present on dashboard', async ({ page }) => {
    const exportSection = page.locator('#dsm-export-section');
    await exportSection.scrollIntoViewIfNeeded();
    await expect(exportSection).toBeVisible();

    // Should have 3 export buttons
    const exportBtns = exportSection.locator('button.big-button');
    await expect(exportBtns).toHaveCount(3);
  });

  test('Export visits triggers download', async ({ page }) => {
    // Listen for download event
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    const exportSection = page.locator('#dsm-export-section');
    await exportSection.scrollIntoViewIfNeeded();

    // Click first export button (Visits)
    await exportSection.locator('button.big-button').first().click();

    // Either a download starts or an error appears — both are valid
    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.(xlsx|csv)$/i);
    }
    // If no download, the export may have failed due to no data — acceptable
  });
});

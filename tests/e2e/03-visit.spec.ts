import { test, expect } from '@playwright/test';

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

// Helper: open visit wizard directly via JS (bypasses store list dependency)
async function openVisitWizardDirect(page) {
  await page.evaluate(() => {
    if (typeof openVisitWizard === 'function') {
      openVisitWizard('test-store-001', 'Golden Feed Supply');
    }
  });
  await page.waitForSelector('#page-visit-wizard.active', { timeout: 5000 });
}

test.describe('03 — Visit Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTSR(page);
  });

  test('Visit wizard shows outcome chips', async ({ page }) => {
    await openVisitWizardDirect(page);
    const chips = page.locator('#visit-outcome-grid .outcome-chip');
    await expect(chips).toHaveCount(3);
    // Verify Taglish labels
    await expect(chips.nth(0)).toContainText('May Order');
    await expect(chips.nth(1)).toContainText('Walang Order');
    await expect(chips.nth(2)).toContainText('Bukas ulit');
  });

  test('Outcome "May Order" expands order form', async ({ page }) => {
    await openVisitWizardDirect(page);
    await page.click('.outcome-chip[data-outcome="order"]');
    // Details panel should be visible
    await expect(page.locator('#visit-details-panel')).toBeVisible();
    // Order panel should be visible
    await expect(page.locator('#visit-order-panel')).toBeVisible();
    // Order amount input should be present
    await expect(page.locator('#visit-order-amount')).toBeVisible();
  });

  test('Outcome "Walang Order" shows notes only', async ({ page }) => {
    await openVisitWizardDirect(page);
    await page.click('.outcome-chip[data-outcome="no-order"]');
    await expect(page.locator('#visit-details-panel')).toBeVisible();
    // Order panel should be HIDDEN
    await expect(page.locator('#visit-order-panel')).toBeHidden();
    // Notes input should be visible
    await expect(page.locator('#visit-extra-notes')).toBeVisible();
  });

  test('Outcome "Bukas ulit" pre-fills notes', async ({ page }) => {
    await openVisitWizardDirect(page);
    await page.click('.outcome-chip[data-outcome="comeback"]');
    // Notes should be pre-filled with "Babalik bukas"
    const notes = page.locator('#visit-extra-notes');
    await expect(notes).toHaveValue(/Babalik bukas|Mobalik ugma|Will return/);
  });

  test('Submit without outcome shows error', async ({ page }) => {
    await openVisitWizardDirect(page);
    // Select an outcome first, then deselect by resetting, then submit
    // Actually, just click the submit button directly in the DOM
    const submitBtn = page.locator('#btn-visit-submit');
    // The details panel is hidden until outcome is selected, but we can
    // force the submit via JS to test the validation
    await page.evaluate(() => {
      // Ensure details panel is visible so submit button is accessible
      document.getElementById('visit-details-panel').style.display = 'block';
    });
    await submitBtn.click();
    const error = page.locator('#visit-submit-error');
    await expect(error).toBeVisible({ timeout: 5000 });
  });

  test('GPS warning banner hidden when GPS succeeds', async ({ page }) => {
    // Grant geolocation with mock coordinates (Manila)
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 14.5995, longitude: 120.9842 });
    await openVisitWizardDirect(page);
    // Wait for GPS pre-check to complete
    await page.waitForTimeout(5000);
    const warning = page.locator('#visit-gps-warning');
    // Element should exist in DOM
    await expect(warning).toHaveCount(1);
    // When GPS succeeds, warning should be hidden
    await expect(warning).toBeHidden();
  });

  test('Submit visit queues to IndexedDB (online)', async ({ page }) => {
    await openVisitWizardDirect(page);
    await page.click('.outcome-chip[data-outcome="no-order"]');
    await page.fill('#visit-extra-notes', 'Test visit from Playwright');

    const submitBtn = page.locator('#btn-visit-submit');
    await submitBtn.click();

    // Button should show success state
    await expect(submitBtn).toContainText(/Na-save|Saved|✓/, { timeout: 15000 });
  });

  test('Submit visit offline queues pending', async ({ page }) => {
    await openVisitWizardDirect(page);
    await page.click('.outcome-chip[data-outcome="no-order"]');

    // Go offline
    await page.context().setOffline(true);

    const submitBtn = page.locator('#btn-visit-submit');
    await submitBtn.click();

    // Should still succeed (IndexedDB first)
    await expect(submitBtn).toContainText(/Na-save|Saved|✓/, { timeout: 15000 });

    // Restore online
    await page.context().setOffline(false);
  });
});

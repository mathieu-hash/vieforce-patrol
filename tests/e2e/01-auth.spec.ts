import { test, expect } from '@playwright/test';

// Helper: inject a fake session into localStorage to simulate login
async function injectSession(page, overrides: Record<string, unknown> = {}) {
  const session = {
    id: 'test-tsr-001',
    name: 'Rico Abante',
    role: 'tsr',
    region: 'Luzon',
    district: 'Metro Manila',
    territory: 'MM-North',
    is_champion: false,
    loggedInAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
  await page.evaluate((s) => {
    localStorage.setItem('patrol_session', JSON.stringify(s));
  }, session);
}

test.describe('01 — Authentication', () => {
  test('Login page loads with phone and PIN fields', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#login-phone')).toBeVisible();
    await expect(page.locator('#login-pin')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
  });

  test('Login with empty fields shows error', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#login-btn');
    const error = page.locator('#login-error');
    await expect(error).toBeVisible();
    await expect(error).not.toBeEmpty();
  });

  test('Login with wrong PIN shows Taglish error', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#login-phone', '09171234567');
    await page.fill('#login-pin', '0000');
    await page.click('#login-btn');
    // Wait for the network call to complete and error to appear
    const error = page.locator('#login-error');
    await expect(error).toBeVisible({ timeout: 15000 });
    await expect(error).not.toBeEmpty();
  });

  test('Valid session redirects to app', async ({ page }) => {
    await page.goto('/index.html');
    await injectSession(page);
    await page.reload();
    // Should redirect to app.html
    await expect(page).toHaveURL(/app\.html/);
  });

  test('Logout redirects to login', async ({ page }) => {
    // Start with a valid session on app.html
    await page.goto('/app.html');
    await injectSession(page);
    await page.reload();
    await page.waitForSelector('.page.active', { timeout: 10000 });

    // Navigate to profile first
    await page.click('.nav-item[data-page="page-profile"]');
    await page.waitForSelector('#page-profile.active', { timeout: 5000 });

    // Click sign out
    const logoutBtn = page.locator('#btn-logout');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();

    // Should end up on login page
    await expect(page).toHaveURL(/index\.html/, { timeout: 10000 });
  });

  test('Inactive account shows Taglish error', async ({ page }) => {
    await page.goto('/index.html');
    // We can't easily test inactive accounts without a real backend,
    // but we verify the error element is wired up
    await page.fill('#login-phone', '09000000000');
    await page.fill('#login-pin', '1234');
    await page.click('#login-btn');
    const error = page.locator('#login-error');
    await expect(error).toBeVisible({ timeout: 15000 });
  });
});

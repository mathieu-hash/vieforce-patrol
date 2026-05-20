import { test, expect } from '@playwright/test';
import {
  installAppInitScripts,
  loginAsTsr,
  logoutViaMoreSheet,
  seedSession,
  waitForAppShell,
} from './_helpers';

test.describe('01 — Authentication', () => {
  test('@smoke Login page loads with phone and PIN fields', async ({ page }) => {
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
    const error = page.locator('#login-error');
    await expect(error).toBeVisible({ timeout: 15000 });
    await expect(error).not.toBeEmpty();
  });

  test('@smoke Valid session redirects to app', async ({ page }) => {
    await installAppInitScripts(page);
    await seedSession(page);
    await Promise.all([waitForAppShell(page), page.goto('/index.html')]);
    await expect(page.locator('#page-home-tsr.active')).toBeVisible({
      timeout: 15000,
    });
  });

  test('Logout redirects to login', async ({ page }) => {
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await loginAsTsr(page);
    await logoutViaMoreSheet(page);
    await page.waitForURL(
      (url) => {
        const path = url.pathname.replace(/\/$/, '') || '/';
        return path === '/' || path.endsWith('/index.html');
      },
      { timeout: 20000 }
    );
  });

  test('Inactive account shows error on login attempt', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#login-phone', '09000000000');
    await page.fill('#login-pin', '1234');
    await page.click('#login-btn');
    const error = page.locator('#login-error');
    await expect(error).toBeVisible({ timeout: 15000 });
  });
});

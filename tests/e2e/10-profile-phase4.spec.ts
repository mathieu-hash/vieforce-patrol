import { test, expect } from '@playwright/test';
import { loginAsTsr, openTsrProfile, stubPatrolApis } from './_helpers';

test.describe('10 — Phase 4 profile', () => {
  test('TSR own profile shows settings block', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);
    await openTsrProfile(page);
    await stubPatrolApis(page);
    await page.evaluate(() => {
      if (typeof loadPatrolProfile === 'function') loadPatrolProfile();
    });
    await expect(page.locator('#profileSettingsOwn')).toBeVisible();
    await expect(page.locator('#profileActions button', { hasText: 'Logout' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('TSR profile shows name header', async ({ page }) => {
    await loginAsTsr(page);
    await openTsrProfile(page);
    await stubPatrolApis(page);
    await page.evaluate(() => {
      if (typeof loadPatrolProfile === 'function') loadPatrolProfile();
    });
    await expect(page.locator('#profileName')).not.toBeEmpty({ timeout: 10000 });
  });
});

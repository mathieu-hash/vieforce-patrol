import { test, expect } from '@playwright/test';
import { loginAsDsm, safeClick } from './_helpers';

test.describe('12 — DSM team & squad', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDsm(page);
  });

  test('DSM squad composer is read-only', async ({ page }) => {
    const composer = page.locator('#page-home-dsm .phase4-composer-dsm');
    await expect(composer).toBeVisible({ timeout: 15000 });
    await expect(composer).toHaveClass(/composer--readonly/);
    const buttons = composer.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      await expect(buttons.nth(i)).toBeDisabled();
    }
  });

  test('DSM can navigate to team page from performance details', async ({ page }) => {
    await safeClick(page, '#dsmTsrPerfDetails');
    await expect(page.locator('#page-team.active')).toBeVisible({ timeout: 10000 });
  });
});

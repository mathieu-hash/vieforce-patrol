import { test, expect } from '@playwright/test';
import { loginAsDsm, safeClick } from './_helpers';

test.describe('12 — DSM team & squad', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDsm(page);
  });

  test('DSM squad shows hint without post composer', async ({ page }) => {
    await expect(page.locator('#dsmSquadHint')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#page-home-dsm .phase4-composer-dsm')).toHaveCount(0);
  });

  test('DSM can navigate to team page from performance details', async ({ page }) => {
    await safeClick(page, '#dsmTsrPerfDetails');
    await expect(page.locator('#page-team.active')).toBeVisible({ timeout: 10000 });
  });
});

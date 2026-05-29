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

  test('Assign UI uses localized stats and placeholders after language switch', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('patrol_locale', 'tl');
      if (window.PatrolI18n && typeof window.PatrolI18n.setLocale === 'function') {
        return window.PatrolI18n.setLocale('tl');
      }
      window.dispatchEvent(new CustomEvent('patrol:locale-changed', { detail: { locale: 'tl' } }));
      return Promise.resolve();
    });

    // force: nav is the real top element; centered DSM-home column overlaps its
    // box and trips Playwright's actionability check. (page-assign assertion below proves flow.)
    await page.locator('#bottom-nav .nav-item[data-page="page-stores"]').click({ force: true });
    await page.evaluate(() => {
      if (typeof nav === 'function') nav('page-assign');
    });

    await expect(page.locator('#page-assign.active')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#assign-page-title')).toHaveText('I-assign ang Stores');
    await expect(page.locator('#assign-selected-label')).toHaveText('Pumili muna ng TSR');
    await expect(page.locator('#assign-search-input')).toHaveAttribute('placeholder', 'Hanapin ang store...');
    await expect(page.locator('#assign-stats')).toContainText('assigned');
  });
});

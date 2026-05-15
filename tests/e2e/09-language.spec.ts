import { test, expect } from '@playwright/test';
import { loginAsTsr, safeClick } from './_helpers';

test.describe('09 — Language picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);
  });

  test('Language settings card is visible on profile', async ({ page }) => {
    await safeClick(page, '#bottom-nav .nav-item[data-page="page-profile"]');
    await expect(page.locator('#page-profile.active')).toBeVisible();
    await expect(page.locator('#patrol-lang-settings-card')).toBeVisible();
  });

  test('Can open language sheet and select Tagalog', async ({ page }) => {
    await safeClick(page, '#bottom-nav .nav-item[data-page="page-profile"]');
    await page.locator('#patrol-lang-summary-row').click();
    const sheet = page.locator('#patrol-lang-sheet');
    await expect(sheet).toHaveClass(/open/, { timeout: 10000 });
    const tl = page.locator('[data-locale-option="tl"]');
    await expect(tl).toBeVisible();
    await tl.click();
    await page.waitForFunction(
      () => {
        try {
          if (
            window.PatrolI18n &&
            typeof PatrolI18n.getCurrentLocale === 'function' &&
            PatrolI18n.getCurrentLocale() === 'tl'
          ) {
            return true;
          }
          return localStorage.getItem('patrol_locale') === 'tl';
        } catch {
          return false;
        }
      },
      { timeout: 15000 }
    );
    const locale = await page.evaluate(() => {
      if (window.PatrolI18n && typeof PatrolI18n.getCurrentLocale === 'function') {
        return PatrolI18n.getCurrentLocale();
      }
      return localStorage.getItem('patrol_locale') || localStorage.getItem('patrol_language');
    });
    expect(locale).toBe('tl');
  });
});

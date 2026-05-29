import { test, expect } from '@playwright/test';
import { loginAsDsm, loginAsTsr, openTsrProfile, safeClick } from './_helpers';

test.describe('06 — More sheet, profile menu, scorecard retention', () => {
  test('DSM: More sheet opens at wide viewport (no display:none !important regression)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginAsDsm(page);

    const moreBtn = page.locator('#bottom-nav button[data-action="more-sheet"]');
    await expect(moreBtn).toBeVisible({ timeout: 15000 });
    await moreBtn.click();

    const sheet = page.locator('#more-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.more-sheet-panel')).toBeVisible();
    await expect(sheet.locator('.more-sheet-item').first()).toBeVisible();

    await sheet.locator('.more-sheet-backdrop').click();
    await expect(sheet).toBeHidden();
  });

  test('DSM: More sheet opens on phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDsm(page);

    const moreBtn = page.locator('#bottom-nav button[data-action="more-sheet"]');
    // force: nav is the real top element; centered DSM-home column overlaps its
    // box and trips Playwright's actionability check. #more-sheet assertion proves the click landed.
    await moreBtn.click({ force: true });
    await expect(page.locator('#more-sheet')).toBeVisible();
    await page.locator('#more-sheet .more-sheet-backdrop').click();
    await expect(page.locator('#more-sheet')).toBeHidden();
  });

  test('TSR: More sheet opens at wide viewport (default 5-tab bar from app.html)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await loginAsTsr(page);

    const moreBtn = page.locator('#bottom-nav button[data-action="more-sheet"]');
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();
    await expect(page.locator('#more-sheet')).toBeVisible();
    await page.locator('#more-sheet .more-sheet-backdrop').click();
    await expect(page.locator('#more-sheet')).toBeHidden();
  });

  test('TSR: scorecard hero has no surrogate leak (dc9a) in stage labels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await loginAsTsr(page);

    const box = page.locator('#page-home-tsr .scorecard-hero');
    await expect(box).toBeVisible({ timeout: 20000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#tsrScStages');
        return el && el.querySelector('.sc-stage-card');
      },
      { timeout: 30000 }
    );
    const txt = await box.innerText();
    expect(txt).not.toMatch(/dc9a/i);
    expect(txt.length).toBeGreaterThan(20);
  });

  test('TSR: profile header More scrolls settings into view (no alert stub)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);

    await openTsrProfile(page);

    const settings = page.locator('#profileSettingsOwn');
    await expect(settings).toBeVisible();

    await safeClick(page, '#page-profile [aria-label="More"]');

    const langCard = page.locator('#patrol-lang-settings-card');
    await expect(langCard).toBeVisible();
    await page.waitForTimeout(600);
    const visible = await langCard.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      return r.top >= -40 && r.bottom <= vh + 80;
    });
    expect(visible).toBeTruthy();
  });
});

import { test, expect } from '@playwright/test';
import {
  E2E_TSR_ID,
  installApiRouteMocks,
  loginToSalesAdminHtml,
  seedSession,
  waitForAppShell,
} from './_helpers';

test.describe('17 — Sales Admin (admin.html)', () => {
  test('@smoke CEO sees stats, user table, and search filters rows', async ({ page }) => {
    await loginToSalesAdminHtml(page);

    await expect(page.locator('#admin-user-list')).toBeVisible();
    await expect(page.locator('#admin-user-list .admin-user-card')).toHaveCount(3);
    await expect(page.locator('#admin-user-list .admin-user-card').first()).toContainText(
      'Alpha TSR'
    );

    await page.locator('#admin-search').fill('Gamma');
    const gammaCard = page.locator('#admin-user-list .admin-user-card', { hasText: 'Gamma TSR' });
    await expect(gammaCard).toBeVisible();
    const alphaCardHidden = page.locator('#admin-user-list .admin-user-card', {
      hasText: 'Alpha TSR',
    });
    await expect(alphaCardHidden).toBeHidden();

    await page.locator('#admin-search').fill('');
    await expect(page.locator('#admin-user-list .admin-user-card')).toHaveCount(3);
  });

  test('@smoke Edit modal: Cancel closes and restores focus (QA-SMOKE §10)', async ({
    page,
  }) => {
    await loginToSalesAdminHtml(page);

    const alphaCard = page.locator('#admin-user-list .admin-user-card', { hasText: 'Alpha TSR' });
    const editBtn = alphaCard.getByRole('button', { name: 'Edit' });
    await editBtn.click();

    const modal = page.locator('#modal-edit-user');
    await expect(modal).toHaveClass(/visible/);
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).not.toHaveClass(/visible/);
    await expect(editBtn).toBeFocused();
  });

  test('@smoke Edit modal: Tab focus stays inside dialog; Escape closes (QA-SMOKE §10)', async ({
    page,
  }) => {
    await loginToSalesAdminHtml(page);

    const alphaCard = page.locator('#admin-user-list .admin-user-card', { hasText: 'Alpha TSR' });
    const editBtn = alphaCard.getByRole('button', { name: 'Edit' });
    await editBtn.click();

    const modal = page.locator('#modal-edit-user');
    await expect(modal).toHaveClass(/visible/);

    const focusablesCount = await modal.evaluate((m) => {
      const sel =
        'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const nodes = m.querySelectorAll(sel);
      let n = 0;
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i] as HTMLElement;
        if (el.getAttribute('hidden') != null || el.getAttribute('aria-hidden') === 'true')
          continue;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        n++;
      }
      return n;
    });
    expect(focusablesCount).toBeGreaterThan(2);

    for (let i = 0; i < focusablesCount + 4; i++) {
      await page.keyboard.press('Tab');
      const inside = await modal.evaluate((m) => m.contains(document.activeElement));
      expect(inside).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/visible/);
    await expect(editBtn).toBeFocused();
  });

  test('TSR without Sales Admin access is redirected to app shell', async ({ page }) => {
    await installApiRouteMocks(page);
    await seedSession(page, {
      id: E2E_TSR_ID,
      name: 'E2E TSR',
      role: 'tsr',
      region: 'Luzon',
      district: 'Metro Manila',
      territory: 'MM-North',
    });
    await Promise.all([waitForAppShell(page, 20000), page.goto('/admin.html')]);
    await expect(page).not.toHaveURL(/admin\.html$/);
  });
});

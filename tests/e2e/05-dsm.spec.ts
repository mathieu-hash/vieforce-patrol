import { test, expect } from '@playwright/test';
import { loginAsDsm } from './_helpers';

test.describe('05 — DSM Home', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDsm(page);
  });

  test('@smoke DSM lands on squad home with KPI grid', async ({ page }) => {
    await expect(page.locator('#page-home-dsm')).toHaveClass(/active/);
    await expect(page.locator('#dsmKpiGrid')).toBeVisible();
    await expect(page.locator('#dsmHdrName')).toBeVisible();
  });

  test('DSM TSR performance table is present', async ({ page }) => {
    await page.evaluate(() => {
      window.getDirectReports = async function () {
        return [
          { id: 'tsr-1', name: 'Alpha One', role: 'tsr' },
          { id: 'tsr-2', name: 'Beta Two', role: 'tsr' },
          { id: 'tsr-3', name: 'Gamma Three', role: 'tsr' },
          { id: 'tsr-4', name: 'Delta Four', role: 'tsr' },
          { id: 'tsr-5', name: 'Echo Five', role: 'tsr' },
        ];
      };
      if (typeof renderDsmHome === 'function') return renderDsmHome();
      return Promise.resolve();
    });

    await expect(page.locator('#dsmTsrTable')).toBeVisible();
    await expect(page.locator('#dsmTsrPerfTitle')).toBeVisible();
    await expect(page.locator('#dsmTsrTable [data-dsm-tsr-row]')).toHaveCount(3, {
      timeout: 10000,
    });
    await expect(page.locator('#dsmTsrTable')).toContainText('top performers');
  });

  test('DSM home can render skeleton-first manager sections', async ({ page }) => {
    await page.evaluate(() => {
      if (typeof renderDsmSkeletons === 'function') renderDsmSkeletons();
    });
    await expect(page.locator('#dsmKpiGrid .dsm-skeleton.kpi')).toHaveCount(4);
    await expect(page.locator('#dsmTsrTable .dsm-skeleton')).toHaveCount(18);
    await expect(page.locator('#dsmSquadFeed .dsm-skeleton-card')).toBeVisible();
  });

  test('DSM can open team from performance details', async ({ page }) => {
    const details = page.locator('#dsmTsrPerfDetails');
    await expect(details).toBeVisible();
    await details.click();
    await expect(page.locator('#page-team')).toHaveClass(/active/, { timeout: 10000 });
  });

  test('@smoke DSM More sheet opens (wide viewport)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const moreBtn = page.locator('#bottom-nav button[data-action="more-sheet"]');
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();
    await expect(page.locator('#more-sheet')).toBeVisible();
    await page.locator('#more-sheet .more-sheet-backdrop').click();
    await expect(page.locator('#more-sheet')).toBeHidden();
  });
});

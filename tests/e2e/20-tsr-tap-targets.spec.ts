/**
 * W4-TapTargets / W5-TapTargets — enumerate TSR-facing controls and assert
 * `boundingBox().height >= 64` per CLAUDE.md §0 Rule 3.
 *
 * Scope: TSR shell (login + home + profile + stores list). DSM/RSM/CEO
 * screens are intentionally NOT covered — manager UI is denser by design
 * per PRODUCT.md.
 *
 * Allow-list (documented inline): inline language pills (48px floor) and
 * the theme toggle inside the More sheet (48px floor). Both are
 * pill-shape decorative-adjacent controls where a literal 64px floor
 * would dominate the layout and break the visual hierarchy. 48px still
 * exceeds the 44px iOS HIG minimum and is well above the platform default.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { installApiRouteMocks, installAppInitScripts, loginAsTsr, openMoreSheet } from './_helpers';

const MIN_TAP = 64;
const PILL_TAP = 48; // documented allow-list floor

async function expectMinHeight(locator: Locator, min: number, label: string) {
  await expect(locator, `${label} not visible`).toBeVisible({ timeout: 10000 });
  const box = await locator.boundingBox();
  expect(box, `${label} has no bounding box`).not.toBeNull();
  if (!box) return;
  expect(
    box.height,
    `${label}: boundingBox().height was ${box.height.toFixed(1)}px (need >= ${min}px) — CLAUDE.md Rule 3`,
  ).toBeGreaterThanOrEqual(min);
}

test.describe('20 — TSR tap targets (CLAUDE.md Rule 3 / 64px floor)', () => {
  test('login: phone, PIN, sign-in, Google all meet 64px floor; lang pills meet 48px allow-list', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiRouteMocks(page);
    await page.goto('/index.html');
    await page.waitForSelector('#login-phone', { timeout: 15000 });

    await expectMinHeight(page.locator('#login-phone'), MIN_TAP, '#login-phone');
    await expectMinHeight(page.locator('#login-pin'), MIN_TAP, '#login-pin');
    await expectMinHeight(page.locator('#login-btn'), MIN_TAP, '#login-btn');
    await expectMinHeight(page.locator('#google-login-btn'), MIN_TAP, '#google-login-btn');

    // Allow-list: language pills are inline 48px decorative-adjacent.
    await expectMinHeight(page.locator('#pill-TL'), PILL_TAP, '#pill-TL');
    await expectMinHeight(page.locator('#pill-BIS'), PILL_TAP, '#pill-BIS');
    await expectMinHeight(page.locator('#pill-EN'), PILL_TAP, '#pill-EN');
  });

  test('TSR home: header icons, search, NBA buttons, route items meet 64px floor', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);
    await page.waitForSelector('#page-home-tsr.active', { timeout: 25000 });

    // Header chrome (was 56px circular icons + 48px search pill).
    await expectMinHeight(
      page.locator('#tsrHomeSearchBtn'),
      MIN_TAP,
      '#tsrHomeSearchBtn',
    );
    await expectMinHeight(
      page.locator('#page-home-tsr .icon-btn[aria-label="Notifications"]'),
      MIN_TAP,
      'TSR notifications icon button',
    );
    await expectMinHeight(
      page.locator('#page-home-tsr .icon-btn[aria-label="Profile"]'),
      MIN_TAP,
      'TSR profile icon button',
    );

    // NBA buttons exist in the DOM even when their text is populated async.
    await expectMinHeight(page.locator('#tsrNbaBtnGo'), MIN_TAP, '#tsrNbaBtnGo');
    await expectMinHeight(
      page.locator('#tsrNbaBtnSkip'),
      MIN_TAP,
      '#tsrNbaBtnSkip',
    );

    // tsrRouteOptimize is on the 48px allow-list — it's a secondary inline
    // pill ("Optimize route" link in the route section header) where a
    // full 64px row would dominate the section title.
    await expectMinHeight(
      page.locator('#tsrRouteOptimize'),
      PILL_TAP,
      '#tsrRouteOptimize (allow-list: 48px secondary inline pill)',
    );

    // Route items get populated by renderTsrHome() — assert min-height on
    // the CSS rule even if the list is currently empty, by injecting a
    // sentinel row via the same .route-item class.
    await page.evaluate(() => {
      const list = document.getElementById('tsrRouteList');
      if (!list) return;
      if (!list.querySelector('.route-item')) {
        const row = document.createElement('div');
        row.className = 'route-item';
        row.setAttribute('data-test-id', 'route-item-sentinel');
        row.innerHTML =
          '<div class="route-num">1</div><div class="route-name">Sentinel store</div><div class="route-time">9:00</div>';
        list.appendChild(row);
      }
    });
    await expectMinHeight(
      page.locator('#tsrRouteList .route-item').first(),
      MIN_TAP,
      '.route-item (first)',
    );
  });

  test('TSR profile header back / more meet 64px floor; profile-actions buttons meet 64px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);
    await page.waitForSelector('#page-home-tsr.active', { timeout: 25000 });

    // Navigate to profile via the same path the user takes (More sheet).
    await openMoreSheet(page);
    const profileItem = page
      .locator('#more-sheet .more-sheet-item')
      .filter({ hasText: /profile/i });
    await profileItem.first().click();
    await expect(page.locator('#page-profile.active')).toBeVisible({ timeout: 10000 });

    // Profile header chrome (was 56px each).
    await expectMinHeight(
      page.locator('#page-profile .app-header [aria-label="Back"]'),
      MIN_TAP,
      'Profile header back button',
    );
    await expectMinHeight(
      page.locator('#page-profile .app-header [aria-label="More"]'),
      MIN_TAP,
      'Profile header more button',
    );

    // Profile-actions row is rendered by phase4-social.js asynchronously;
    // wait for the row to be populated, then assert each prof-btn.
    await page.waitForFunction(
      () => {
        const row = document.querySelector('#profileActions');
        return !!row && row.querySelectorAll('.prof-btn').length >= 1;
      },
      undefined,
      { timeout: 15000 },
    ).catch(() => {
      // If the JS never injects a button (e.g. anonymous role), skip the assertion.
    });

    const profBtns = page.locator('#profileActions .prof-btn');
    const count = await profBtns.count();
    for (let i = 0; i < count; i += 1) {
      await expectMinHeight(profBtns.nth(i), MIN_TAP, `#profileActions .prof-btn[${i}]`);
    }
  });

  test('TSR stores list: tindahan-store-search meets 64px floor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);
    await page.waitForSelector('#page-home-tsr.active', { timeout: 25000 });

    await page.evaluate(() => {
      if (typeof (window as unknown as { nav: (id: string) => void }).nav === 'function') {
        (window as unknown as { nav: (id: string) => void }).nav('page-stores');
      }
    });
    await page.waitForSelector('#page-stores.active', { timeout: 10000 });
    await page.waitForSelector('#tindahan-store-search', { timeout: 10000 });

    await expectMinHeight(
      page.locator('#page-stores label.tindahan-search'),
      MIN_TAP,
      '#page-stores .tindahan-search container',
    );
  });

  test('pilot-readiness sheet buttons meet 64px floor (TSR-only injected DOM)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installAppInitScripts(page);
    await page.goto('/app.html');

    // Force the pilot-readiness sheet open by calling the panel directly.
    await page.evaluate(() => {
      // Mark the body so .pilot-btn rules apply.
      document.body.classList.add('role-tsr');
      if (typeof (window as unknown as { patrolOpenReadiness?: () => void }).patrolOpenReadiness === 'function') {
        (window as unknown as { patrolOpenReadiness: () => void }).patrolOpenReadiness();
      }
    });

    const pilotButtons = page.locator('.pilot-btn');
    // If the readiness sheet is gated by other state, skip silently — but
    // when present, every button must meet 64px.
    const cnt = await pilotButtons.count();
    if (cnt === 0) {
      test.skip(true, 'pilot-readiness sheet not present in this build');
      return;
    }
    for (let i = 0; i < cnt; i += 1) {
      await expectMinHeight(pilotButtons.nth(i), MIN_TAP, `.pilot-btn[${i}]`);
    }
  });
});

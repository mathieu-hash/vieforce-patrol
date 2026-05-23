import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { loginAsTsr, hideBootDebug, openTsrProfile } from './_helpers';

/**
 * 20-tsr-tap-targets — CLAUDE.md §0 Rule 3 e2e gate (Audit E P0 top-2)
 *
 * Enumerates every visible interactive control on TSR-facing surfaces
 * (login, home, store list, store detail, visit sheet, profile) and
 * asserts `boundingBox().height >= 64`. Any future CSS regression that
 * drops a TSR control below 64px fails CI loudly.
 *
 * --- Allow-list (documented exceptions) ---
 *  - Embedded icon-only nodes inside a larger parent tap target — the
 *    parent IS the tap target. We measure the outermost interactive
 *    ancestor, never a child `<span>` icon.
 *  - Status indicators (sync badge, notification dot) — not interactive,
 *    excluded by the selector list.
 *  - Manager-only controls (DSM/RSM/admin) — DSM/RSM screens are allowed
 *    denser per PRODUCT.md. We skip elements inside `.manager-only`,
 *    `[data-role="manager"]`, `[data-role="dsm"]`, `[data-role="rsm"]`,
 *    or any descendant of `#page-home-dsm` / `#page-home-rsm` / `#page-dashboard`.
 *  - Hidden controls (display:none / visibility:hidden / offscreen / zero box)
 *    — not "interactive" in the spirit of Rule 3, skipped.
 *  - Login page Google OAuth button (`#google-login-btn`) is manager-only
 *    by audience but lives on the shared login shell. Skipping it would
 *    leave a hole, so we measure it — Rule 3 still applies because TSRs
 *    also see the login page.
 */

const TSR_TAP_MIN_HEIGHT = 64;

const INTERACTIVE_SELECTOR =
  'button, a[href], input:not([type="hidden"]), select, textarea, ' +
  '[role="button"], [tabindex]:not([tabindex="-1"])';

/** Containers whose contents are explicitly allowed to be denser than 64px. */
const MANAGER_ONLY_ANCESTORS = [
  '.manager-only',
  '[data-role="manager"]',
  '[data-role="dsm"]',
  '[data-role="rsm"]',
  '[data-role="admin"]',
  '#page-home-dsm',
  '#page-home-rsm',
  '#page-dashboard',
  '#page-assign',
  '#page-team',
  '#page-leader',
  '#page-rsm-home',
  '#page-tsr-scorecard', // detailed analytics, manager view
];

/** Selectors that are NOT real interactive controls even though they match
 *  the broad selector. Boot-debug overlay, hidden boot toggles, etc. */
const ALWAYS_SKIP_SELECTORS = [
  '#patrol-boot-debug',
  '#patrol-boot-debug-close',
  '.skeleton', // skeleton placeholders are not interactive
];

type Surface = {
  name: string;
  /** Returns once the surface is visible and ready to measure. */
  enter: (page: Page) => Promise<void>;
  /** Root selector containing the interactive controls for this surface. */
  root: string;
};

type Failure = {
  surface: string;
  selector: string;
  tag: string;
  height: number;
  text: string;
};

/** Measure every interactive control inside `root` and collect failures. */
async function auditSurface(
  page: Page,
  surface: Surface,
  failures: Failure[],
  testInfo: TestInfo
): Promise<{ measured: number; skipped: number }> {
  // Wait until the root container is in the DOM and visible.
  const rootLoc = page.locator(surface.root).first();
  await expect(rootLoc, `${surface.name}: root '${surface.root}' should be visible`).toBeVisible({
    timeout: 15000,
  });

  // Snapshot all candidate controls in the surface.
  const handles = await rootLoc.locator(INTERACTIVE_SELECTOR).elementHandles();

  let measured = 0;
  let skipped = 0;

  for (const handle of handles) {
    // We work directly with the ElementHandle (snapshot of the DOM node)
    // rather than through a Locator. Snapshot semantics are correct here:
    // we want to measure the controls that were present when this surface
    // was first rendered — not whatever the page mutates to mid-loop.
    const visible = await handle.evaluate((el: Element) => {
      if (!(el instanceof HTMLElement)) return false;
      let cur: HTMLElement | null = el;
      while (cur) {
        const cs = getComputedStyle(cur);
        if (cs.display === 'none') return false;
        if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
        cur = cur.parentElement;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!visible) {
      skipped++;
      continue;
    }

    const skip = await handle.evaluate(
      (el: Element, args: { managerSels: string[]; skipSels: string[] }) => {
        for (const s of args.skipSels) {
          if ((el as Element).matches(s)) return 'always-skip';
          if ((el as Element).closest(s)) return 'always-skip';
        }
        for (const s of args.managerSels) {
          if ((el as Element).closest(s)) return 'manager-only';
        }
        return null;
      },
      { managerSels: MANAGER_ONLY_ANCESTORS, skipSels: ALWAYS_SKIP_SELECTORS }
    );
    if (skip) {
      skipped++;
      continue;
    }

    const box = await handle.boundingBox();
    if (!box) {
      skipped++;
      continue;
    }

    measured++;

    if (box.height + 0.5 < TSR_TAP_MIN_HEIGHT) {
      const desc = await handle.evaluate((el: Element) => {
        const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
        const cls = ((el as Element).getAttribute('class') || '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((c) => `.${c}`)
          .join('');
        const tag = (el as Element).tagName.toLowerCase();
        const text = ((el as HTMLElement).innerText || (el as HTMLElement).textContent || '')
          .trim()
          .slice(0, 60)
          .replace(/\s+/g, ' ') || '(no text)';
        const ariaLabel = (el as HTMLElement).getAttribute('aria-label') || '';
        return {
          selector: `${tag}${id}${cls}`.slice(0, 200),
          tag,
          text: ariaLabel ? `${text} [aria=${ariaLabel}]` : text,
        };
      });

      // Screenshot for triage (attached to Playwright trace).
      try {
        const buf = await handle.screenshot();
        await testInfo.attach(
          `tap-target-fail-${surface.name}-${desc.selector.replace(/[^a-z0-9_-]/gi, '_')}.png`,
          { body: buf, contentType: 'image/png' }
        );
      } catch {
        /* element may have moved during scroll — non-fatal for the report */
      }

      failures.push({
        surface: surface.name,
        selector: desc.selector,
        tag: desc.tag,
        height: Math.round(box.height * 10) / 10,
        text: desc.text,
      });
    }
  }

  // Free the handles so Playwright doesn't keep retaining them.
  for (const h of handles) {
    await h.dispose();
  }

  return { measured, skipped };
}

/** Navigate using the app's global `nav(pageId)` (no animations to wait for). */
async function navTo(page: Page, pageId: string) {
  await hideBootDebug(page);
  await page.evaluate((id) => {
    if (typeof (window as any).nav === 'function') {
      (window as any).nav(id);
    }
  }, pageId);
  await expect(page.locator(`#${pageId}.active`)).toBeVisible({ timeout: 10000 });
}

/** Open the visit bottom sheet against the stubbed sample store. */
async function openVisitSheetForAudit(page: Page) {
  await page.evaluate(() => {
    if (typeof (window as any).openVisitWizard === 'function') {
      (window as any).openVisitWizard('e2e-store-001', 'E2E Test Store');
    }
  });
  await expect(page.locator('#visit-sheet')).toHaveClass(/open/, { timeout: 10000 });
}

test.describe('20 — TSR tap targets (CLAUDE.md Rule 3, 64px min)', () => {
  test.describe.configure({ mode: 'serial' });

  test('@smoke Login page (PIN keypad + login buttons)', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');
    await expect(page.locator('#login-phone')).toBeVisible({ timeout: 15000 });

    const failures: Failure[] = [];
    const { measured, skipped } = await auditSurface(
      page,
      { name: 'login', enter: async () => {}, root: '.login-page, body' },
      failures,
      testInfo
    );

    if (failures.length) {
      const msg = failures
        .map(
          (f) =>
            `Control "${f.text}" (${f.selector}) on ${f.surface} is ${f.height}px tall, needs ${TSR_TAP_MIN_HEIGHT}px`
        )
        .join('\n');
      throw new Error(`Tap-target violations on login (${failures.length}/${measured}):\n${msg}`);
    }
    expect(measured, 'login surface must contain at least one tap target').toBeGreaterThan(0);
    expect(skipped).toBeGreaterThanOrEqual(0); // documentation
  });

  test('@smoke TSR shell surfaces sweep (home, stores, store-detail, visit, profile)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsTsr(page);

    // Confirm body class — CSS 64px enforcement keys off this.
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('role-tsr')), {
      timeout: 10000,
    }).toBeTruthy();

    const failures: Failure[] = [];
    const counts: Record<string, { measured: number; skipped: number }> = {};

    // -- Home (TSR Phase 4 hero) + bottom nav --
    await navTo(page, 'page-home-tsr');
    counts['home-tsr'] = await auditSurface(
      page,
      { name: 'home-tsr', enter: async () => {}, root: '#page-home-tsr' },
      failures,
      testInfo
    );
    counts['bottom-nav'] = await auditSurface(
      page,
      { name: 'bottom-nav', enter: async () => {}, root: '#bottom-nav' },
      failures,
      testInfo
    );

    // -- Store list (search, filter pills, FAB) --
    await navTo(page, 'page-stores');
    counts['stores'] = await auditSurface(
      page,
      { name: 'stores', enter: async () => {}, root: '#page-stores' },
      failures,
      testInfo
    );

    // -- Store detail (back button, action buttons, input bar) --
    // Force-activate the page; sample store is stubbed so renderStoreDetail
    // can hydrate against it even without clicking a list row.
    await page.evaluate(() => {
      if (typeof (window as any).nav === 'function') {
        (window as any).nav('page-store-detail');
      }
    });
    if (await page.locator('#page-store-detail.active').isVisible().catch(() => false)) {
      counts['store-detail'] = await auditSurface(
        page,
        { name: 'store-detail', enter: async () => {}, root: '#page-store-detail' },
        failures,
        testInfo
      );
    } else {
      counts['store-detail'] = { measured: 0, skipped: 0 };
    }

    // -- Visit bottom sheet (outcome chips, photo capture, notes, submit) --
    await navTo(page, 'page-stores');
    await openVisitSheetForAudit(page);
    counts['visit-sheet'] = await auditSurface(
      page,
      { name: 'visit-sheet', enter: async () => {}, root: '#visit-sheet' },
      failures,
      testInfo
    );
    // Close before navigating away.
    await page.evaluate(() => {
      if (typeof (window as any).closeVisitSheet === 'function') {
        (window as any).closeVisitSheet();
      }
    });

    // -- Profile (logout, language switcher, theme toggle) --
    await openTsrProfile(page);
    counts['profile'] = await auditSurface(
      page,
      { name: 'profile', enter: async () => {}, root: '#page-profile' },
      failures,
      testInfo
    );

    // -- Report --
    const summary = Object.entries(counts)
      .map(([k, v]) => `  ${k}: ${v.measured} measured, ${v.skipped} skipped`)
      .join('\n');

    if (failures.length) {
      const msg = failures
        .map(
          (f) =>
            `Control "${f.text}" (${f.selector}) on ${f.surface} is ${f.height}px tall, needs ${TSR_TAP_MIN_HEIGHT}px`
        )
        .join('\n');
      throw new Error(
        `TSR tap-target violations (${failures.length} total):\n${msg}\n\nSurfaces audited:\n${summary}`
      );
    }

    const totalMeasured = Object.values(counts).reduce((acc, v) => acc + v.measured, 0);
    expect(totalMeasured, `TSR sweep must measure at least 20 controls; summary:\n${summary}`).toBeGreaterThan(20);
  });
});

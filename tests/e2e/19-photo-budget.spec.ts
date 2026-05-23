// 19-photo-budget.spec.ts — Audit E P0 top-1 fix.
//
// Regression guard for CLAUDE.md §0 Rule 2 (data budget: 6MB/month per TSR).
// Without this gate, a regression in js/camera.js::compressImage (e.g.
// canvas.toBlob mime drift to PNG, maxWidth bumped to 1280, quality
// raised to 0.9, scale calc broken) would not be caught by any prior
// test — capturePhoto/uploadPhoto were stubbed end-to-end before W4.
//
// What this spec verifies, against a REAL ~1.5MB JPEG fixture
// (tests/e2e/fixtures/photo-large-1500kb.jpg):
//   1. The compressed blob is ≤ 80KB (the soft cap CLAUDE.md
//      enforces and the runtime uploadPhoto() warns against).
//   2. The compressed blob is image/jpeg (not PNG default).
//   3. The decoded dimensions are ≤ 640 wide AND ≤ 480 tall.
//   4. Aspect ratio is preserved (no warping).
//
// Single smoke case — this is a regression guard, not full coverage of
// every camera path. The contract tests in tests/unit/photo-compression-budget.test.js
// lock the source defaults (maxWidth=640, maxHeight=480, quality=0.5); this
// spec proves those defaults still produce a budget-compliant blob when
// the real browser runs the real pipeline.

import { test, expect } from '@playwright/test';
import { loginAsTsr } from './_helpers';

// CLAUDE.md says 50KB target / 80KB cap. The runtime warn in uploadPhoto
// trips at 81920 bytes — match that here so the test fails BEFORE the
// soft-warn fires in prod.
const BYTE_CAP = 81920;
const MAX_WIDTH = 640;
const MAX_HEIGHT = 480;

test.describe('19 — Photo compression budget (CLAUDE.md §0 Rule 2)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTsr(page);
  });

  test('Real ~1.5MB fixture → compressImage produces ≤80KB JPEG ≤640×480', async ({ page }) => {
    // Run the actual js/camera.js::compressImage against a real JPEG
    // loaded from the test fixture. We do not use capturePhoto() here
    // because the e2e helper for that creates a synthetic File for the
    // visit form flow — instead we directly invoke compressImage so the
    // assertion is on the *pipeline output*, not the helper.
    const result = await page.evaluate(async () => {
      const res = await fetch('/tests/e2e/fixtures/photo-large-1500kb.jpg');
      if (!res.ok) {
        throw new Error('fixture fetch failed ' + res.status);
      }
      const ab = await res.arrayBuffer();
      const file = new File([ab], 'photo-large-1500kb.jpg', { type: 'image/jpeg' });
      const inputBytes = ab.byteLength;

      const compress = (window as any).compressImage;
      if (typeof compress !== 'function') {
        throw new Error('compressImage is not defined on window — js/camera.js failed to load');
      }
      const blob: Blob = await compress(file);
      if (!blob) throw new Error('compressImage returned null');

      // Decode the output dimensions by drawing the compressed blob back
      // through Image + ImageBitmap. createImageBitmap is the modern fast
      // path; Image.onload is the universal fallback.
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = function () {
          const out = { w: img.naturalWidth, h: img.naturalHeight };
          URL.revokeObjectURL(url);
          resolve(out);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('compressed blob would not decode as an image'));
        };
        img.src = url;
      });

      return {
        inputBytes,
        outputBytes: blob.size,
        outputType: blob.type,
        outputWidth: dims.w,
        outputHeight: dims.h,
      };
    });

    // Sanity: the input really was a big JPEG. If this fails the fixture
    // was overwritten or shipped at the wrong size.
    expect(result.inputBytes).toBeGreaterThan(800_000);

    // CLAUDE.md Rule 2 — the actual budget assertions.
    expect.soft(result.outputType).toMatch(/^image\/jpeg/);
    expect(result.outputBytes).toBeLessThanOrEqual(BYTE_CAP);
    expect(result.outputWidth).toBeLessThanOrEqual(MAX_WIDTH);
    expect(result.outputHeight).toBeLessThanOrEqual(MAX_HEIGHT);

    // Aspect-ratio preservation: source was 2000×1500 (from the sharp
    // generator, see tests/e2e/fixtures/_README), aspect 4:3.
    // Allowed band 1.30–1.36 (vs ideal 1.333) absorbs rounding.
    const aspect = result.outputWidth / result.outputHeight;
    expect(aspect).toBeGreaterThan(1.3);
    expect(aspect).toBeLessThan(1.36);
  });

  test('Visit form: real capturePhoto + submit queues a budget-compliant blob to IDB', async ({ page }) => {
    // End-to-end smoke: capture a photo through the helper (which now drives
    // the real compressImage pipeline against the fixture), submit a visit,
    // and assert the queued pendingVisits record holds a base64 photo whose
    // decoded byte length is ≤ the 80KB cap.
    const { openVisitSheet, selectVisitOutcome, attachVisitPhoto, getLastPendingVisit } =
      await import('./_helpers');

    await openVisitSheet(page);
    await selectVisitOutcome(page, 'no-order');
    await attachVisitPhoto(page);
    await page.fill('#visit-extra-notes', 'W4-PhotoBudget regression smoke');
    await page.locator('#btn-visit-submit').click();
    await expect(page.locator('#btn-visit-submit')).toContainText(
      /Na-save|Saved|synced|saved locally|✓/i,
      { timeout: 25000 }
    );

    const queued = (await getLastPendingVisit(page)) as Record<string, unknown> | null;
    expect(queued, 'a pending visit must exist after submit').not.toBeNull();
    const photoB64 = (queued && (queued.photo_base64 as string | null)) || null;
    expect(photoB64, 'queued visit must carry photo_base64 for offline upload').toBeTruthy();

    // Decode the base64 data URL and assert its raw byte size is ≤ the cap.
    const decodedBytes = await page.evaluate((dataUrl: string) => {
      const comma = dataUrl.indexOf(',');
      const b64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
      // atob gives us a byte string; .length === raw byte count.
      return atob(b64).length;
    }, photoB64 as string);
    expect(decodedBytes).toBeLessThanOrEqual(BYTE_CAP);

    // Also assert dimensions by re-decoding the base64 through Image.
    const dims = await page.evaluate(async (dataUrl: string) => {
      return new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = function () {
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = function () {
          reject(new Error('queued photo_base64 did not decode'));
        };
        img.src = dataUrl;
      });
    }, photoB64 as string);
    expect(dims.w).toBeLessThanOrEqual(MAX_WIDTH);
    expect(dims.h).toBeLessThanOrEqual(MAX_HEIGHT);
  });
});

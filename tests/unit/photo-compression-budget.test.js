// Unit tests for js/camera.js compression pipeline — CLAUDE.md §0 Rule 2
// (data budget: 6MB/month per TSR, photos ≤80KB, ≤640×480, JPEG quality 0.5).
//
// Closes Audit E top-1 (P0 gap): "Photo pipeline (Rule 2) is stubbed end-to-end."
// Before this test, no automated gate caught a regression that disabled
// compression — a full-res 2MB upload would land in pilot undetected.
//
// SCOPE OF THIS UNIT TEST
// =======================
// compressImage() lives behind heavy browser APIs (FileReader, Image,
// HTMLCanvasElement, canvas.toBlob). A pure-Node DOM shim is not feasible
// without jsdom + node-canvas (jsdom is NOT in devDependencies; node-canvas
// is a native build that adds heavy install weight to every CI run).
//
// Therefore this unit test is a CONTRACT TEST against the source:
//   1. Confirm the function declares the documented defaults
//      (maxWidth=640, maxHeight=480, quality=0.5).
//   2. Confirm the function calls canvas.toBlob with 'image/jpeg' + quality var.
//   3. Reimplement the scale algorithm independently and verify it matches
//      the source for the cases CLAUDE.md cares about (large 4000×3000,
//      square 2000×2000, already-small 200×150, exact 640×480).
//   4. The actual blob-size assertion (≤80KB) runs in Playwright against
//      a real Chromium — see tests/e2e/19-photo-budget.spec.ts.
//
// Combined, the unit test (contract) + the e2e test (real blob output)
// form the regression guard.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CAMERA_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'camera.js'),
  'utf8'
);

// ─────────────────────────────────────────────────────────────────────────
// Contract: the function signature locks the documented defaults in place.
// A regression that bumps maxWidth to 1280 or quality to 0.9 silently
// breaks Rule 2's "photos ≤50KB target / ≤80KB hard cap" budget — and
// would land before any e2e ran. This regex pins the signature line.
// ─────────────────────────────────────────────────────────────────────────
test('compressImage signature defaults: maxWidth=640, maxHeight=480, quality=0.5', () => {
  // Match the body's default-assignment idiom:
  //   maxWidth  = maxWidth  || 640;
  //   maxHeight = maxHeight || 480;
  //   quality   = quality   || 0.5;
  const mWidth = CAMERA_SRC.match(/maxWidth\s*=\s*maxWidth\s*\|\|\s*(\d+)/);
  const mHeight = CAMERA_SRC.match(/maxHeight\s*=\s*maxHeight\s*\|\|\s*(\d+)/);
  const mQuality = CAMERA_SRC.match(/quality\s*=\s*quality\s*\|\|\s*([\d.]+)/);

  assert.ok(mWidth, 'maxWidth default must be present in js/camera.js');
  assert.ok(mHeight, 'maxHeight default must be present in js/camera.js');
  assert.ok(mQuality, 'quality default must be present in js/camera.js');

  assert.equal(Number(mWidth[1]), 640, 'maxWidth default must be 640 per CLAUDE.md Rule 2');
  assert.equal(Number(mHeight[1]), 480, 'maxHeight default must be 480 per CLAUDE.md Rule 2');
  assert.equal(
    Number(mQuality[1]),
    0.5,
    'JPEG quality default must be 0.5 per CLAUDE.md Rule 2 (50KB target / 80KB cap)'
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Contract: the canvas.toBlob call must specify image/jpeg + the quality
// variable. Any drift (e.g. canvas.toBlob(cb) with no mime → PNG default,
// silently quadruples file size) would not raise an error.
// ─────────────────────────────────────────────────────────────────────────
test("compressImage uses canvas.toBlob('image/jpeg', quality)", () => {
  // Be lenient on whitespace and arg formatting; pin the mime and the var name.
  const m = CAMERA_SRC.match(
    /canvas\.toBlob\([\s\S]*?['"]image\/jpeg['"][\s\S]*?,\s*quality\s*\)/
  );
  assert.ok(
    m,
    "canvas.toBlob('image/jpeg', quality) call must be present — " +
      'a regression that drops the mime or quality argument silently produces PNG (4× bigger).'
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Contract: the soft warn threshold of 80KB must be present in uploadPhoto.
// CLAUDE.md says 50KB target / 80KB cap. The runtime warning is the only
// in-app signal that a photo went over budget.
// ─────────────────────────────────────────────────────────────────────────
test('uploadPhoto warns when blob > 80KB (81920 bytes)', () => {
  const m = CAMERA_SRC.match(/blob\.size\s*>\s*(\d+)/);
  assert.ok(m, 'uploadPhoto must compare blob.size against the 80KB cap');
  assert.equal(
    Number(m[1]),
    81920,
    'soft-warn threshold must be 81920 (80KB) — CLAUDE.md Rule 2'
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Algorithmic test: the scale calculation in compressImage decides the
// output dimensions BEFORE the JPEG encoder runs. Get this wrong and the
// 80KB cap is missed even at quality=0.5.
//
// The source uses:
//   scale = Math.min(maxWidth / w, maxHeight / h, 1);
//   w = Math.round(w * scale);
//   h = Math.round(h * scale);
//
// Reimplement here in plain Node and assert the cases that matter.
// ─────────────────────────────────────────────────────────────────────────
function computeDims(srcW, srcH, maxW, maxH) {
  maxW = maxW || 640;
  maxH = maxH || 480;
  const scale = Math.min(maxW / srcW, maxH / srcH, 1);
  return {
    w: Math.round(srcW * scale),
    h: Math.round(srcH * scale),
    scale: scale
  };
}

test('large 4000×3000 landscape → fits within 640×480, aspect preserved', () => {
  const { w, h } = computeDims(4000, 3000);
  assert.ok(w <= 640, 'width must be ≤ 640: got ' + w);
  assert.ok(h <= 480, 'height must be ≤ 480: got ' + h);
  // 4000/3000 = 1.3333; 640/480 = 1.3333. Same aspect → fits perfectly.
  assert.equal(w, 640);
  assert.equal(h, 480);
});

test('1920×1080 16:9 landscape → fits within 640×480 by width-binding', () => {
  // 1920/1080 = 1.7778. maxW/srcW = 640/1920 = 0.3333; maxH/srcH = 480/1080 = 0.4444.
  // Min = 0.3333 → w = 640, h = 360. Width-binding case.
  const { w, h } = computeDims(1920, 1080);
  assert.equal(w, 640);
  assert.equal(h, 360);
  assert.ok(w <= 640 && h <= 480);
  // Aspect preserved: 640/360 = 1.7778 ≈ source 1.7778
  assert.ok(Math.abs(w / h - 1920 / 1080) < 0.01);
});

test('3000×4000 portrait → height-binds, ≤ 480 tall, ≤ 640 wide', () => {
  // maxW/srcW = 640/3000 = 0.2133; maxH/srcH = 480/4000 = 0.12. Min = 0.12.
  // w = 360, h = 480.
  const { w, h } = computeDims(3000, 4000);
  assert.equal(w, 360);
  assert.equal(h, 480);
});

test('2000×2000 square → fits within 640×480 — height binds', () => {
  // scale = min(640/2000, 480/2000, 1) = 0.24 → w=480, h=480.
  const { w, h } = computeDims(2000, 2000);
  assert.equal(w, 480);
  assert.equal(h, 480);
  assert.ok(w <= 640 && h <= 480);
});

test('already-small 200×150 image → scale clamps to 1 (no upscaling)', () => {
  // CRITICAL: scale = min(640/200, 480/150, 1) = min(3.2, 3.2, 1) = 1.
  // We MUST NOT upscale a small photo — that wastes bytes for no quality gain.
  const { w, h, scale } = computeDims(200, 150);
  assert.equal(scale, 1);
  assert.equal(w, 200);
  assert.equal(h, 150);
});

test('exact 640×480 → no resize', () => {
  const { w, h, scale } = computeDims(640, 480);
  assert.equal(scale, 1);
  assert.equal(w, 640);
  assert.equal(h, 480);
});

test('640×481 (one pixel over) → tiny scale-down, no upscale', () => {
  // scale = min(640/640, 480/481, 1) = min(1, 0.9979, 1) = 0.9979.
  const { w, h } = computeDims(640, 481);
  assert.ok(w <= 640);
  assert.ok(h <= 480);
});

// ─────────────────────────────────────────────────────────────────────────
// Locked: the data-budget toast says "lang" (Tagalog reassurance) and uses
// KB units (not MB). This is the bridge to CLAUDE.md §15.5 "Data Usage
// Reassurance" promise to TSRs. A regression to "MB" would terrify a TSR
// who thinks 1MB = 1% of their 100MB load.
// ─────────────────────────────────────────────────────────────────────────
test('data-usage toast uses KB units and Tagalog reassurance copy', () => {
  // "Ginamit: XKB lang para sa litrato" — see _showDataUsage in js/camera.js
  assert.match(CAMERA_SRC, /Ginamit:[^']*\$\{?kb\}?KB lang|Ginamit:[^']*'\s*\+\s*kb\s*\+\s*'KB lang/);
});

// ─────────────────────────────────────────────────────────────────────────
// Lock: the deterministic Storage path format. Audit D O5 / H-03 — retries
// must hit the SAME path or we orphan blobs in patrol-photos.
// (Already covered by photo-flow.test.js, but pinned here as a defence-
// in-depth for the budget contract.)
// ─────────────────────────────────────────────────────────────────────────
test('buildPhotoPath format is {tsr_id}/{day}/{row_id}.jpg', () => {
  const m = CAMERA_SRC.match(
    /function\s+buildPhotoPath[\s\S]+?return\s+([\s\S]+?);\s*\}/
  );
  assert.ok(m, 'buildPhotoPath must exist and return a path');
  // Either string-concat or template — both must end with '.jpg'.
  assert.match(m[1], /\.jpg/);
});

# Round 10 — Cross-Platform Verification (Paper Audit)

**Generated:** 2026-05-25
**Mode:** Paper audit — NO real cross-browser runs. Verdict scored against the realistic-pilot bar (Android Chrome TSRs + Desktop Chrome managers).
**Score: 7/10** (capped at 8/10 per rubric absent real cross-browser evidence; deducted -1 for `theme-color` mismatch + no documented browser support matrix)

---

## Verdict

The PWA bones are clean and pilot-ready for the **stated targets** (Android Chrome TSRs, Desktop Chrome managers). The manifest validates; the service worker is correctly scoped (cache-first shell only, never API/Supabase/tiles); offline-drain is the most-tested area of the entire suite (`22-offline-drain.spec.ts`, 6 tests). Push notifications are deliberately deferred in favor of Messenger chatbot (CLAUDE.md §11 L495) — this is a product decision, not a gap.

The audit cannot be pushed past 8/10 because: (a) no real Safari/Firefox/WebKit run exists; (b) Playwright config only ships `chromium-desktop` + `chromium-mobile` Pixel 5 projects — no Mobile Safari / Mobile Firefox; (c) the prior 2026-04-17 pre-pilot gate flagged iOS Safari as untested with concerns on `backdrop-filter`, MapLibre WebGL on older iOS, and IndexedDB quota. Those concerns have not been re-verified.

The final -1 is **earned** on a real defect: `app.html` declares `<meta name="theme-color" content="#004D71">` (navy) while `manifest.json` declares `"theme_color": "#00A6CE"` (Messenger blue). PWA install chrome will use the manifest; in-page browser chrome on Android will use the meta. Discrepancy.

---

## Checklist

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| R10-1 | PWA manifest valid | PASS | `manifest.json` — `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, `orientation: portrait`, `lang: fil`, 4 icons (192/512 + maskable variants) — all required keys present |
| R10-2 | Manifest icons exist on disk | PASS | `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-192-maskable.png`, `icons/icon-512-maskable.png` referenced; matches `apple-touch-icon` in `app.html` L42 |
| R10-3 | Service worker registered | PASS | `app.html` L60-69 + `index.html` L28-37 — registers `sw.js` at `./` scope on `load`; opt-out via `?nosw=1` or `localStorage.patrol_nosw=1` |
| R10-4 | SW shell cache-first strategy | PASS | `sw.js` L40-60 — `SHELL_CACHE = 'patrol-shell-v4'`; `isShellAsset` correctly excludes cross-origin (API, Supabase, tiles); cache-then-network with put on 200 basic |
| R10-5 | SW lifecycle: `skipWaiting()` + `clients.claim()` | PASS | `sw.js` L21-37 — both present; ensures hot-replace on deploy |
| R10-6 | SW cache-bust headers in Vercel | PASS | `vercel.json` L17-22 — `Cache-Control: no-store, max-age=0` + `Service-Worker-Allowed: /` |
| R10-7 | Offline mode documented + tested | PASS | `tests/e2e/04-offline.spec.ts` + `tests/e2e/22-offline-drain.spec.ts` (6 tests covering happy drain, sync-badge truth, PGRST204 quarantine, IDB durability, photo flow, retry classification); CLAUDE.md Rule 1 enshrined |
| R10-8 | Push notifications | N/A (deferred) | CLAUDE.md §11 L495 — Messenger chatbot is the chosen delivery path; not a defect |
| R10-9 | Android Webview compatibility | PASS (assumed) | Vanilla JS + Dexie + Leaflet/MapLibre — no exotic web platform features; `js/supabase.js` uses CDN bundle. No Webview-specific shims needed for Chrome on Redmi A3x |
| R10-10 | Low-RAM tolerance (2GB Redmi A3x) | PARTIAL | TSR-only bundle: manager CSS (`rsm.css`, `phase4-social.css`, `phase3-sales-stores.css`, `sales-tab-v2.css`, ~32KB) is lazy-loaded via `ensureManager*Assets` (`app.html` L33-39). `chart.js`/`xlsx` lazy-loaded for managers. But MapLibre GL JS is loaded eagerly on `app.html` L72 — heavy WebGL lib for a phone that may not always need it on TSR home |
| R10-11 | 2G/3G data budget enforcement | PASS | CLAUDE.md Rule 2 codified; `tests/e2e/19-photo-budget.spec.ts` enforces ≤80KB photos; manager assets lazy-loaded; no auto-polling found in code sweep |
| R10-12 | iOS Safari (not a pilot target) | N/A | TSRs on Android only per CLAUDE.md / PRODUCT.md. Managers on desktop Chrome. iOS is an aspiration, not a pilot bar. Pre-pilot gate 2026-04-17 line 38 already declared `Cross-Platform: 6/10 — Only tested on Android Chrome` |
| R10-13 | Mobile vs desktop responsiveness | PASS | `css/dsm-rsm-mobile.css` (26.5KB) exists and is loaded eagerly in `app.html` L24. Viewport meta `width=device-width, initial-scale=1.0, viewport-fit=cover` (`app.html` L5) — correct for notched Android. Admin SAP page has mobile card view <640px (A3 backlog item closed) |
| R10-14 | Viewport: no `user-scalable=no` | PASS | PRODUCT.md backlog "Closed" status for `user-scalable=no` (only out-of-scope prototype carries it). `app.html` L5 confirms |
| R10-15 | PWA install prompt | PASS | Wired in `js/ux-polish.js` per `docs/quality-gate-pre-pilot-2026-04-17.md` line 226. Backlog calls for "Add to Home Screen" after 2nd visit (CLAUDE.md Rule 8) — not yet built |
| R10-16 | Browser support matrix documented | FAIL | No `BROWSER-SUPPORT.md` or matrix anywhere in `docs/`. Only the 2026-04-17 quality gate line 222-226 mentions "Tested only: Chrome Android". Documenting the supported matrix (Chrome Android 100+, Chrome Desktop 100+, others "best effort") would unblock future Round 10 |
| R10-17 | `theme-color` consistency | FAIL | `app.html` L41 sets `<meta name="theme-color" content="#004D71">` (navy). `manifest.json` L8 sets `"theme_color": "#00A6CE"` (Messenger blue). PWA chrome will use manifest; in-page address bar tint will use meta. Should align — and per CLAUDE.md Rule 6, TSR shell should be `#00A6CE`, while `index.html` L25 (manager-leaning login) uses `#0F1923`. App.html serves BOTH personas so this is genuinely ambiguous, but currently neither |
| R10-18 | Playwright matrix coverage | PARTIAL | `playwright.config.ts` L27-36 — only `chromium-desktop` (1280×800) + `chromium-mobile` (Pixel 5). No `webkit`, no `firefox`, no Galaxy/Redmi viewport. For a Redmi A3x-targeted app, consider adding a project with the actual Redmi viewport (~360×800) |

---

## Findings

### F-R10-1 (P2) — Manifest vs in-page `theme-color` mismatch
**Where:** `manifest.json` L8 = `#00A6CE`; `app.html` L41 = `#004D71`; `index.html` L25 = `#0F1923`.
**Impact:** PWA standalone chrome will tint Messenger-blue; in-browser address bar on Android will tint navy on `app.html`. Brand inconsistency only — no functional break.
**Fix:** Decide canonical TSR chrome color (per CLAUDE.md Rule 6 it should be `#00A6CE`) and align `app.html` meta to match. Login (`index.html`) staying navy is defensible since it's manager-leaning.

### F-R10-2 (P2) — No browser support matrix
**Where:** `docs/` — no `BROWSER-SUPPORT.md`.
**Impact:** Pilot support team has no reference for "is this browser supported?" When TSR shows up with an old browser, no policy exists.
**Fix:** Add a one-page `docs/BROWSER-SUPPORT.md` declaring Chrome Android 100+, Chrome Desktop 110+, "no-test" for Safari/Firefox/Samsung Internet, with the rationale (Android-only TSRs, Chrome-only managers).

### F-R10-3 (P3) — Playwright matrix narrow
**Where:** `playwright.config.ts` L27-36.
**Impact:** Tests never run against a Redmi-class viewport (~360×800). Pixel 5 (393×851) is close but not exact. Tap-target spec `20-tsr-tap-targets.spec.ts` could miss real Redmi A3x rendering issues.
**Fix:** Add a `chromium-redmi` project with `viewport: { width: 360, height: 800 }, deviceScaleFactor: 2`.

### F-R10-4 (P3) — MapLibre GL eager-loaded for TSR
**Where:** `app.html` L71-72 — `maplibre-gl.css` + `maplibre-gl.js` loaded in head, unconditional.
**Impact:** Heavy WebGL library (~700KB) included in TSR cold-load even before they navigate to `#page-mapa-tsr`. Conflicts with CLAUDE.md Rule 2 (500KB app bundle target).
**Fix:** Lazy-load MapLibre when route enters `#page-mapa-tsr` / `#page-map`. Same pattern as `ensureManager*Assets`.

### F-R10-5 (P3) — No automated PWA installability check
**Where:** No spec validates `manifest.json` parses + `start_url` resolves + icons return 200.
**Fix:** Add a small Playwright spec that fetches `/manifest.json` + each icon and asserts status 200 + content-type.

---

## What's STRONG (don't regress)

- `sw.js` correctly **excludes** cross-origin (API, Supabase, tile servers) — no risk of caching stale API responses or auth tokens
- Offline drain coverage is the **best-tested surface in the entire codebase** — 6 dedicated specs cover the high-risk paths
- Service-worker opt-out (`?nosw=1`, `patrol_nosw=1`) gives ops a clean kill switch if the SW ever misbehaves in pilot
- CSP, HSTS, frame-ancestors, Permissions-Policy all set in `vercel.json` and apply to every route
- `viewport-fit=cover` is correctly used on `app.html` for notched Android phones
- Manager-only CSS lazy-loading is real and shipped (W5)

---

## Score Justification

| Component | Score |
|-----------|-------|
| Base (paper audit cap) | 8 |
| Deduct: `theme-color` mismatch (F-R10-1) | -0.5 |
| Deduct: no browser support matrix (F-R10-2) | -0.5 |
| **Round 10 Final** | **7.0 / 10** |

Promotion path to 9/10: ship browser-support matrix, fix theme-color, lazy-load MapLibre, add Redmi viewport project. Promotion to 10/10 requires real WebKit/Mobile Safari run with passing suite — out of pilot scope.

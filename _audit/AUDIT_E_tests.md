# Audit E — Test Coverage

**Scope:** `tests/unit/` (18 files), `tests/e2e/` (18 specs + `_helpers.ts` + `fixtures/`), `playwright.config.ts`, `package.json` test scripts, `.github/workflows/e2e.yml`.

**Mode:** read-only audit.

## Summary

- Unit tests: **18 files** (`tests/unit/*.test.js`) — 17 wired into `npm run test:unit` (one orphan: `hq-client` listed but check below). Handoff asserts 121 passing — not re-verified, but `package.json` script does enumerate every file in the directory **except** `_helpers.js` (correct) and matches the 17 production files plus `org-sync.test.js`. **Asserted 121 passing — plausible from file enumeration; not re-run here.**
- E2E specs: **18 files** (`01-auth` … `18-admin-org`). Asserted 144 passing — not re-verified. `@smoke` tag count = 10 across 7 spec files (drives `test:e2e:prod-smoke`).
- Locale parity: `en/tl/ceb` each have **191 keys, in lockstep** (re-verified live). `scripts/check-locale-parity.mjs` is gated as first step of `test:unit`.
- CI: `.github/workflows/e2e.yml` runs **unit + full local e2e** on every PR, then `@smoke` against prod on `main`/`master` push. Strong PR gate.
- Coverage gaps (count): **8** (4 P0/P1, 4 P2/P3 — see Findings).
- Findings: **P0=2, P1=3, P2=4, P3=2**

---

## Feature-vs-test matrix

Sourced from `PRODUCT.md` (personas, surfaces) + `CLAUDE.md` (TSR rules) + `docs/SESSION_HANDOFF_2026-05-21-complete.md` test map.

| Feature surface | Unit | E2E | Gap severity |
|---|---|---|---|
| Auth — PIN login (TSR) | none | `01-auth.spec.ts` (6 tests, 2 @smoke) | OK |
| Auth — Google OAuth (manager `@vienovo.ph`) | none | **none** — `loginAsDsm/Rsm/Ceo` all seed `patrol_session` in localStorage, never exercise OAuth flow or domain lock | **P1** |
| Session expiry / `expiresAt` | none | none (helper sets 24h expiry but no test for expiry behaviour) | P3 |
| TSR home (`page-home-tsr`, scorecard hero) | none | `06-more-sheet-profile.spec.ts` (scorecard surrogate-leak test) | OK |
| Store list (`page-stores`) | `stores-nav-pref.test.js` (chip→filter mapping) | `02-stores.spec.ts` (6 tests) | OK |
| Store detail (`page-store-detail`) | none | thin: one branch in `02-stores.spec.ts` line 58 fires only if a row is visible — silent skip otherwise | **P2** |
| Store chatbot registration (`page-store-new`) | none | `02-stores.spec.ts` (opens chatbot, asserts messages render) | OK |
| Visit bottom sheet | `patrol-duplicate-error.test.js` (Supabase dup-detect helper) | `03-visit.spec.ts` (9 tests — outcomes, photo gate, submit, GPS) | OK |
| Photo capture / compress | none — `capturePhoto`/`uploadPhoto` are stubbed by `installAppInitScripts` (return fake blob) so real Canvas/JPEG quality 0.5/50KB target is **never tested** | only "photo attached" UX in `03-visit.spec.ts` | **P1** |
| Offline queue (write-first) | `offline-queue-payload.test.js` (regression: strip `offline_id` before PostgREST — strong) | `04-offline.spec.ts` (5 tests incl. base64 photo retention, online toggle, queue durability) | OK |
| Offline → reconnect → sync | none direct | `04-offline.spec.ts` "Reconnect after offline does not crash shell" — does **not** assert that queued items actually drain | **P2** |
| DSM Pulse (`page-home-dsm`, KPI grid, leaderboard) | `role-scope.test.js` (`canSeeKpiStrip`, `canSeeLeaderboard`) | `05-dsm.spec.ts` (5 tests inc. skeleton-first), `12-assign-team.spec.ts` | OK |
| Sales tab (`pg-sales`, lazy-load chart.js) | `sales-tab-format.test.js`, `sales-queries.test.js` (10 SQL builder tests, anti-injection) | `08-navigation.spec.ts` (lazy-load assertion) — no spec asserts KPIs render | **P2** |
| Assign — DSM → TSR (stores) | none | `14-assign-page.spec.ts` (3 tests inc. mode toggle) | OK |
| Assign — DSM → TSR (farms / Bukid) | none | `14-assign-page.spec.ts` farm path + `15-farms.spec.ts` | OK |
| Team page | none | `05-dsm.spec.ts` + `12-assign-team.spec.ts` | OK |
| RSM home (`page-rsm-home`) | `role-scope.test.js` | `07-rsm.spec.ts` (3 tests, @smoke) | OK |
| Bottom nav role-aware | `role-scope.test.js` (`homePageId`) | `08-navigation.spec.ts` (4 tests) | OK |
| Language picker (tl/ceb/en) | locale parity script | `09-language.spec.ts` (2 tests for tl select); ceb path not tested | P3 |
| Profile page (TSR Phase 4) | none | `10-profile-phase4.spec.ts` (2 tests) | OK |
| Visits page (`page-visits`) | none | `16-visits-tab.spec.ts` (2 tests) | OK |
| Map tab (`page-mapa-tsr`/`page-map`) | none | `13-map-sync.spec.ts` + `15-farms.spec.ts` Bukid chip | OK |
| Sync bar (`#global-sync-bar`) | none | `13-map-sync.spec.ts` element-exists only — does **not** assert status text under offline/syncing/error states | **P2** |
| Admin user CRUD (`admin.html`) | none | `17-admin-html.spec.ts` (4 tests — stats, search, edit modal focus trap, escape) | OK |
| Admin user CRUD — create/save/delete | none | **none** — only Cancel path tested; create user, save edit, delete user are **not exercised** | **P1** |
| Admin SAP roster (`admin-users-sap.html`) | none | `11-admin-users-sap.spec.ts` (3 tests, viewport-aware via `expectSapRosterLoaded`) | OK |
| Admin Org master (`admin-org.html`) | `org-sync.test.js` (1 trivial `norm` test only) | `18-admin-org.spec.ts` (5 tests, @smoke, mocked API) | OK |
| HQ proxy (`api/_lib/hq-client.js`) | `hq-client.test.js` | n/a (server) | OK |
| Scope / margin stripping (`api/_lib/scope.js`) | `scope.test.js` (189 lines, deep) | n/a | OK |
| SAP route handlers | 7 unit files (`sap-sales*`, `sap-ar`, `sap-customer(s)`, `sap-inventory`, `sap-speed`) | n/a (proxied through Sales tab) | OK |
| `whoami` / `patrol-cors` diagnostics | `whoami.test.js`, `patrol-cors.test.js` | n/a | OK |
| Service worker / PWA install (A2HS prompt) | none | **none** — `04-offline.spec.ts` explicitly bypasses SW via `patrol_nosw` flag | P3 |
| Beta release-channel banner | none | none | P3 |

---

## TSR non-negotiable test gates

Mapped from `CLAUDE.md` §"HARD RULES" and `PRODUCT.md` §"TSR rules compliance snapshot".

| Rule | Test exists? | File | Verdict |
|---|---|---|---|
| **Rule 1** Offline-first (write to IndexedDB before server) | YES | `tests/unit/offline-queue-payload.test.js` + `tests/e2e/04-offline.spec.ts` (queue durability + photo_base64) | **PROTECTED** |
| **Rule 2** Photos compressed to ~50KB / 640x480 / q=0.5 | NO — `capturePhoto`/`uploadPhoto` are **stubbed in e2e** (return fake Blob); no unit test of `js/camera.js` compression pipeline | none | **P0 GAP** |
| **Rule 3** 64px minimum touch targets on TSR screens | NO — only one CSS assertion exists (`08-navigation.spec.ts` asserts `min-height: 52px` on **DSM** Sales tab, not 64px on TSR). `PRODUCT.md` itself notes "⚠️ Partial — 36px header buttons, 52px FAB, ~56px bottom nav in places" | none | **P0 GAP** |
| **Rule 4** No swipe gestures on TSR screens | partial — `installAppInitScripts` stubs do not introduce swipe behaviour; no positive test, but no swipe code shipped either | n/a | accepted (negative-by-design) |
| **Rule 5** Trilingual text — no English leak on TSR screens | partial — `09-language.spec.ts` proves the picker switches `patrol_locale` to `tl`. `12-assign-team.spec.ts` checks assign-page localization. Locale parity script gates key drift (191 keys × 3). But **no test scans a rendered TSR page for English-only strings** when `locale=tl`/`ceb` | n/a | **P1 GAP** |
| **Rule 6** Messenger-hybrid (TSR white + `#00A6CE`) | NO design-token test | none | P3 (visual) |
| **Rule 7** No spinners on TSR screens — skeleton instead | partial — `05-dsm.spec.ts` "skeleton-first" asserts skeleton classes for DSM; no equivalent test asserts **TSR** screens render skeletons (not spinners) | `05-dsm.spec.ts` (DSM only) | **P1 GAP** |
| **Rule 8** Leaderboard — top performers only (Filipino hiya) | partial — `05-dsm.spec.ts` line 32-35 asserts `[data-dsm-tsr-row]` has count **3** and table contains "top performers". `role-scope.test.js` proves TSRs cannot see leaderboard. Strong logical gate. | `05-dsm.spec.ts`, `role-scope.test.js` | **PROTECTED** |
| **Max 4 bottom tabs (TSR)** | YES — `08-navigation.spec.ts` "TSR mobile uses 4-tab emoji nav strip" asserts `#bottom-nav .nav-item, button` count = 4 | `08-navigation.spec.ts:18` | **PROTECTED** |
| Offline write durability (no data loss) | YES — `04-offline.spec.ts` "Queued visit remains in PatrolOffline after offline submit" + photo_base64 retention | `04-offline.spec.ts:64`, `:81` | **PROTECTED** |

---

## Findings

### P0-1 — Photo pipeline (Rule 2) is stubbed end-to-end

- **Where:** `tests/e2e/_helpers.ts:355-356`, `:511-512` — `capturePhoto` returns a 4-byte fake JPEG; `uploadPhoto` returns a hard-coded URL.
- **What:** Every visit-photo e2e test runs against fakes. No test verifies that `js/camera.js` actually:
  - resizes to 640×480 max,
  - applies JPEG quality 0.5,
  - produces a Blob ≤ ~50KB.
- **Why it matters:** Rule 2 is a literal cost-per-byte rule for prepaid TSRs ("6MB/month total"). A regression in `js/camera.js` (e.g. compression silently disabled, full-resolution uploaded) would not be caught by any current test, would not break visually, and would land in pilot.
- **Fix:** Add `tests/unit/camera-compress.test.js` that loads `compressImage`/`capturePhoto` from `js/camera.js` (via vm-extract pattern already used in `offline-queue-payload.test.js`), feeds a synthetic large canvas, asserts output blob `size < 80_000` and dimensions ≤ 640.
- **Effort:** 1–2 h (vm-extract is well-trodden in this repo).

### P0-2 — 64px TSR touch-target rule (Rule 3) has zero automated gate

- **Where:** all of `tests/e2e/0[1-9]-*.spec.ts`. The only `min-height` assertion is `08-navigation.spec.ts:26` which asserts `52px` on the **DSM Sales tab** — explicitly not the TSR rule.
- **What:** `PRODUCT.md` lists this as **P0** in the UI backlog and notes "⚠️ Partial" today. There is no Playwright pixel-measure check against `#bottom-nav .nav-item`, `#btn-new-store`, visit-submit CTA, `.hdr-btn`, FAB, or outcome chips.
- **Why it matters:** This is the explicit rule that determines whether a calloused-hand field user can tap reliably. Without a gate, every CSS refactor can silently regress it.
- **Fix:** Add `tests/e2e/19-tsr-touch-targets.spec.ts` — login as TSR on Pixel 5 viewport, iterate a list of TSR-facing selectors, assert `boundingBox().height >= 64` (or >= 56 with a tolerance line). Document the canonical list in `_helpers.ts`.
- **Effort:** 2 h.

### P1-1 — Google OAuth path has no e2e

- **Where:** `tests/e2e/01-auth.spec.ts` covers PIN; `loginAsDsm/Rsm/Ceo` in `_helpers.ts:581-651` all bypass auth by seeding `patrol_session` directly into localStorage.
- **What:** The `@vienovo.ph` domain lock, `users.email` matching, and "No email — Google login blocked" UI state for manager rows are entirely untested. `PRODUCT.md` flags missing email as a real blocker for Sales Admin.
- **Why it matters:** PIN path is well-tested; manager path that protects every admin surface is not. A regression in `js/auth.js` `GOOGLE_MANAGER_ROLES` filter would not be caught.
- **Fix:** Mock the Supabase Auth `/auth/v1/callback` route and assert (a) `@gmail.com` is rejected, (b) `@vienovo.ph` with no `users.email` row shows the documented error, (c) matched manager row lands on correct role home.
- **Effort:** 3–4 h.

### P1-2 — Trilingual leak on rendered TSR screens not gated

- **Where:** Locale parity protects only **dictionary key existence**, not which strings actually paint. `PRODUCT.md` §"UI quality backlog" itself lists "Trilingual gaps on first paint" as **P0–P1**.
- **What:** No e2e walks a TSR session in `locale=tl` and asserts the absence of stock English strings (`Loading…`, `Stores`, `Profile`, `Logout`, etc.) on `#page-home-tsr`, `#page-stores`, `#page-visits`.
- **Fix:** New spec that sets `patrol_locale=tl` before goto, visits each TSR page, and grep-asserts an English denylist against `document.body.innerText`.
- **Effort:** 2 h.

### P1-3 — Admin user-CRUD write paths not covered

- **Where:** `tests/e2e/17-admin-html.spec.ts` covers list/search and modal Cancel/Escape focus trap — strong A11y coverage — but **does not exercise Save**, Add User, or Delete.
- **What:** A regression in `js/admin.js` that breaks PATCH `/users` (e.g. silently drops `email`) would land. Given `PRODUCT.md` and `CLAUDE.md` both spotlight `users.email` as the new gate for Google manager login, this is exactly the surface that needs a happy-path write test.
- **Fix:** Mock PATCH/POST `/rest/v1/users` (`installAdminHtmlUserListMock` already mocks GET) and assert the modal submit sends the expected body and updates the list optimistically.
- **Effort:** 2 h.

### P2-1 — Sync-bar status states not asserted

- **Where:** `tests/e2e/13-map-sync.spec.ts` asserts only that `#global-sync-bar` exists. No test verifies the four documented states from `CLAUDE.md` §16 (`Naka-sync na ✓✓`, `Offline · N pending`, `Nag-sisync...`, `Hindi na-sync · I-retry`).
- **Fix:** Spec that toggles `navigator.onLine`, seeds pending IndexedDB rows, and asserts visible label per state.
- **Effort:** 2 h.

### P2-2 — Offline→reconnect drain is not exercised end-to-end

- **Where:** `tests/e2e/04-offline.spec.ts` "Reconnect after offline does not crash shell" stops at `expect(body).toBeVisible()` — it never asserts that the queued visit actually leaves `pendingVisits` after coming back online. The strongest offline test (`pending > before`) only proves the queue **received** the write.
- **What:** A regression in `js/offline.js` `syncPending()` that silently drops rows (or repeats the 2026-04-25 silent-eject pattern at a different layer) would not be caught by an e2e — only the existing unit test which covers `_queuePayload` shape, not drain orchestration.
- **Fix:** After reconnect, poll `countPendingVisits` until 0, with a timeout, and assert.
- **Effort:** 1 h.

### P2-3 — Sales tab KPI render not asserted (only lazy-load is)

- **Where:** `08-navigation.spec.ts` proves chart.js/xlsx are not loaded until Sales is opened — excellent bundle-budget test. But no spec asserts that on `#pg-sales.active`, KPI numbers, charts, or empty-state fall through correctly with `sapFetch` returning `{ kpis: { bags: 1200 } }`.
- **Fix:** Spec that asserts at least one KPI value renders against the stubbed `sapFetch` response.
- **Effort:** 1 h.

### P2-4 — Store detail page silently skipped when list empty

- **Where:** `tests/e2e/02-stores.spec.ts:58-68` — branch only executes `if (await storeRow.isVisible())`. With the current mocks, this should be true (`installApiRouteMocks` returns `[SAMPLE_STORE]`), but the branch silently passes when empty rather than failing — so a regression that empties the list also disables the only store-detail test.
- **Fix:** Remove the conditional; let the test fail loudly if the row is missing. Or guard the precondition with `await expect(storeRow).toBeVisible()`.
- **Effort:** 5 min.

### P3-1 — Cebuano locale path is not e2e-tested

- **Where:** `09-language.spec.ts` only switches to `tl`. `ceb.json` parity is enforced, but no test proves the picker can land on `ceb`.
- **Fix:** Parameterize the existing test.
- **Effort:** 15 min.

### P3-2 — Beta-channel banner and PWA "Add to Home Screen" prompt are unverified

- **Where:** `config.js` `RELEASE_CHANNEL: 'beta'` is documented to show an orange bar that persists per session; no test. PWA install prompt after 2nd visit (`CLAUDE.md` §14): no test.
- **Effort:** 1 h combined.

---

## Flakiness / anti-pattern signals

- **5 hard `waitForTimeout` calls** (acceptable count but worth pruning):
  - `02-stores.spec.ts:60` — 2 s before checking store row visibility
  - `03-visit.spec.ts:70` — 3 s after granting geolocation
  - `04-offline.spec.ts:56` — 2 s after reconnect
  - `06-more-sheet-profile.spec.ts:82` — 600 ms before reading bounding-box
  - `13-map-sync.spec.ts:17` — 2 s after clicking map tab
  Each should be replaced with `waitForFunction`/`expect(locator).toBeVisible({ timeout })`. **P3.**
- **`reuseExistingServer: false`** in `playwright.config.ts:23` — flagged as intentional per task brief; not flagged.
- **Production baseURL** (`https://vieforce-patrol.vercel.app`) is the default in `playwright.config.ts:13` when neither `PATROL_E2E_LOCAL` nor `PATROL_E2E_PROD` is set explicitly. Locally a developer typing `npm test` will hit production — and there is no read-only guard. The `@smoke` tag filter is **not** applied at config level, so a full `npm test` without env vars points the entire suite at prod. Mitigated in CI by `PATROL_E2E_LOCAL=1`. **P2 ergonomics issue** — already acknowledged in `_helpers.ts` design (all writes stubbed) but the foot-gun remains.
- **`workers: 1`** (`playwright.config.ts:9`) — single-threaded; tests do not race. Strong for stability, slow for CI. Acceptable.
- **No test-order dependence detected** — every spec calls its own `loginAs*` in `beforeEach`; helpers seed clean state via `addInitScript`.
- **Mock drift risk:** `tests/e2e/_helpers.ts` hard-codes mock responses for `/rest/v1/stores`, `/rest/v1/visits`, `/api/admin/sap-reps`, `/api/user/language`. There is no contract test that compares mock shape to live PostgREST shape. If `js/db.js` adds a column requirement, e2e stays green while production breaks. **P2.**
- `_helpers.ts:308-315` asserts hard-coded stat values (`#admin-stat-users = 3`, `#admin-stat-stores = 10`, `#admin-stat-visits = 4`) — these are tied to mocked counts (`content-range: */10` for stores, `*/4` for visits). Brittle but documented.

---

## CI scorecard

- CI configured: **YES** — `.github/workflows/e2e.yml` (2 jobs).
- PR gates tests: **YES** — `e2e-local` job runs `npm run test:unit` then `npm run test:e2e:all` on every PR with `PATROL_E2E_LOCAL=1`. Uploads `playwright-report/` artifact on failure (7-day retention).
- Locale parity gated: **YES** — first step of `npm run test:unit` (`scripts/check-locale-parity.mjs`), which the CI job runs.
- Prod smoke gated on main: **YES** — `e2e-prod-smoke` job runs `@smoke` against `https://vieforce-patrol.vercel.app` only on push to `main`/`master`.
- Missing CI scorecard items:
  - No `npm run check:supabase-auth` step (it's an optional manual gate per `TESTING.md`).
  - No Lighthouse / accessibility gate.
  - No bundle-size budget gate (relevant for `CLAUDE.md` Rule 2's 500KB cached app budget — the lazy-load test in `08-navigation.spec.ts` partially compensates).
- Playwright config uses `retries: 2` only when `CI`, `retries: 1` locally — appropriate for the offline/sync timing-sensitive flow.

### Test commands sanity

All scripts in `package.json` resolve to files that exist:
- `test:unit` enumerates 17 unit files explicitly — every one of them exists in `tests/unit/` and is wired. **No orphans** in either direction (script vs filesystem).
- `test:e2e:all` runs everything; `test:e2e` is desktop only; `test:e2e:mobile` is Pixel 5 only; `test:e2e:prod-smoke` filters `@smoke` against desktop.
- `check:locales` is a hard prefix of `test:unit` (good — cannot be skipped).
- `test:e2e:live` is identical to `test:e2e:all` — **orphan/duplicate command, P3**.

---

## What protects the pilot today

- Strong: offline queue payload shape (`PGRST204` regression covered), SQL injection / destructive token denylist in SAP query builders, margin stripping unit test, focus-trap modal a11y, role-scope visibility logic, 4-tab TSR nav assertion, locale key parity.
- Weak: photo compression (real pipeline never tested), 64px touch targets (zero assertion), Google OAuth path (zero assertion), Sync drain after reconnect (only `crash` checked), trilingual paint on real TSR screens.

---

*Audit E — read-only — 2026-05-23 — `vieforce-patrol@3.1.0-beta.1` — commit `7125959` (per handoff).*

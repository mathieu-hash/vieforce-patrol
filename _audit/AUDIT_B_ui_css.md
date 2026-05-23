# Audit B — UI / CSS / Phase Completion

**Auditor:** Agent B (read-only)
**Date:** 2026-05-21
**Scope:** `index.html`, `app.html`, `admin.html`, `admin-org.html`, `admin-users-sap.html`, all `css/*.css`.
**Excluded:** `patrol-fb-mockup.html`, `prototype-demo-reference.html`.

---

## Summary

- **Phase A status:** All 7 items shipped (A1 partially — small inline `style="..."` attrs remain on admin pages, but the big `<style>` block was consolidated into `admin-page.css`).
- **Phase B status:** All 8 items shipped, with caveats (B3 leaves DSM/manager first-paint English in inline placeholders; B6 only lazy-loads `sales-tab-v2.css` + Chart + xlsx — `rsm.css`, `phase4-social.css`, `phase3-sales-stores.css` still eager).
- **Phase C status (uncommitted):** C2/C3/C4/C5 done in `js/sales-tab.js`, `js/home-dsm.js`, `js/assign.js`, `js/export.js`. **C6 NOT done — leaderboard exposes all ranks (4..N) in `js/phase4-social.js` `renderRankingsRest` and `renderRankingsTiered`.** C1 partially done (manager nav touch ≥52px from `density-pass.css` / `dsm-rsm-mobile.css`, but manager `.hdr-btn` icons inline ~36px).
- **Findings:** P0=2, P1=4, P2=7, P3=3
- **Top 3 visual / TSR-rule risks:**
  1. **Leaderboard violates Filipino hiya rule (C6 P0):** Bottom-ranked managers and TSRs render with rank + bags + delta in `renderRankingsRest` / `renderRankingsTiered`. Direct violation of `CLAUDE.md` §15.2 and `PRODUCT.md` C6.
  2. **DSM home seeds English "Loading..." first paint** (B3 partial on manager surfaces) + store-detail page (TSR path) injects `Loading...` text instead of skeleton when navigating into a store (`app.html:1898,1902`).
  3. **CSS bundle weight on TSR critical path (B6 partial):** ~12 CSS files + 2 Google Font requests load on `app.html` regardless of role. `rsm.css` (436 lines), `phase4-social.css` (511 lines), `phase3-sales-stores.css` (432 lines) are manager-only by intent but eagerly loaded for TSR.

---

## Phase backlog truth-check

| Item | PRODUCT.md says | Actual code | Verdict |
|------|-----------------|-------------|---------|
| **A1** | Consolidate `admin.html` inline CSS into `admin-page.css` | Big `<style>` block gone; comment "From admin.html shell (consolidated)" at `css/admin-page.css:137`; 10 inline `style="..."` attrs remain (`back-btn`, hints, kbd boxes) | **DONE** (minor inline attrs remain) |
| **A2** | Skeleton loaders on `admin-org.html` + `admin-users-sap.html` | `admin-skeleton-wrap` blocks at `admin-org.html:43` and `admin-users-sap.html:64`; `.admin-skeleton-*` classes in `admin-page.css:628`+ | **DONE** |
| **A3** | SAP roster mobile card stack <640px | `@media (max-width:639px)` in `css/admin-sap.css:264` hides table, shows `.sap-cards` | **DONE** |
| **A4** | Admin actions min-height 44–48px | `css/admin-page.css:665`–`672` enforces `min-height: 48px` on `.tbl-btn`, `.btn-action`, `.org-btn`, `.action-btn`, modal footer buttons at ≤640px | **DONE** |
| **A5** | `index.html` titles + Google error strings via `LABELS` | `applyLoginLang()` covers `tsrLoginSection`, `managerLoginSection`, `googleSignIn`. Google error fallback uses `L.googleLoginFailed`. Line 360 raw `oauthResult.error` is a minor leak | **DONE** (1 raw error path P3) |
| **A6** | Revisit `user-scalable=no` on auth + admin | No `user-scalable=no` anywhere except `prototype-demo-reference.html` (out of scope). `app.html` viewport: `width=device-width, initial-scale=1.0, viewport-fit=cover` | **DONE** |
| **A7** | Shared admin subnav across admin shells | `<nav class="admin-subnav">` present at `admin.html:25`, `admin-org.html:25`-ish, `admin-users-sap.html:25`-ish (verified at top of each) | **DONE** |
| **B1** | TSR tap targets 64px min | `css/tsr-field.css` enforces 64px on `body.role-tsr` / `body.role-champion` for: `#bottom-nav .nav-item`, `.hdr-btn`, `.fab`, `.outcome-chip`, `.outcome`, `.sub-btn`, `#btn-visit-submit`, `.more-sheet-item`, `.fab-pick-btn` | **DONE** |
| **B2** | Bottom nav 4 tabs max for TSR | `app.html:1296`-1313 has 4 TSR tabs (Home/POS/Mapa/Higit pa). `js/nav-role-device.js:31` `NAV_CONFIGS.tsr.mobile` = 4 entries (More opens sheet) | **DONE** |
| **B3** | Replace HTML `Loading...` / English with `data-i18n` / `T.*` at first paint | TSR-facing first paint largely uses `data-i18n` (30 occurrences in `app.html`). Remaining English `Loading...` at `app.html:242` (`dsmHdrName` — manager surface, B3 still relevant per spec wording), `app.html:1898,1902` (store-detail TSR path) | **PARTIAL** |
| **B4** | Store empty state trilingual + CTA matches visible control | `js/stores.js:574,683,691,697` uses `t('tindahan.empty_*')` keys + per-role CTA hint (`empty_cta_fab` vs `empty_cta_hdr`) | **DONE** |
| **B5** | Remove "Loading from Supabase…" copy | No `Loading from Supabase` matches in `app.html` or `js/` | **DONE** |
| **B6** | Lazy-load manager-only CSS/JS off TSR critical path | `window.ensureManagerSalesAssets` (Chart.js + sales-tab-v2.css) and `window.ensureManagerExportAssets` (xlsx) added in uncommitted `app.html` diff + `js/export.js`. But `rsm.css`, `phase4-social.css`, `phase3-sales-stores.css` still eagerly loaded in `app.html:24,28,29` | **PARTIAL** |
| **B7** | Visit list skeleton-only | `js/visits.js:118`–123 emits `.skeleton-row` block; no spinner | **DONE** |
| **B8** | Submit visit full-width Messenger blue 64px | `#btn-visit-submit` at `app.html:1251`; `css/tsr-field.css:54`–63 forces 64px min, Messenger blue `#00a6ce`, 17/700 typography on TSR/champion | **DONE** |
| **C1** | Manager nav overflow + i18n labels; 48px+ targets | DSM/RSM/CEO `.nav-item` `min-height: 52px` (`css/dsm-rsm-mobile.css:28`, `css/density-pass.css:32`). Labels via `labelKey` in `js/nav-role-device.js`. **Manager `.hdr-btn` icons in `app.html:545,546,658,662` have inline `padding:0; border-radius:50%` with NO width/height set → renders ~36px for DSM/RSM (TSR-only override in `tsr-field.css` covers TSR)** | **PARTIAL** |
| **C2** | Sales tab skeleton KPI instead of `.sales-sap-spinner` | `js/sales-tab.js:462`–471, 539, 574–583 emits `sales-skeleton-stack` / `sales-skeleton-bars` / `sales-skeleton-pill`. `.sales-sap-spinner` CSS rule (`css/dsm-rsm-mobile.css:434`) now appears dead | **DONE** |
| **C3** | DSM Pulse / feed skeleton-first | `js/home-dsm.js:344`–373 emits `.dsm-skeleton.kpi` / `.dsm-skeleton.line` / `.dsm-skeleton-card`; CSS at `css/elite-action.css:746`–773 (uncommitted) | **DONE** |
| **C4** | Assign UI localized stats + placeholders | `js/assign.js` (uncommitted) routes `_assignT(...)` for title, stats, search placeholder, "all assigned" empty, and "no TSRs"; locale keys added in `locales/{en,tl,ceb}.json` | **DONE** |
| **C5** | Lazy-load Chart.js / xlsx on demand | `window.ensureManagerSalesAssets` (Chart.js) wired at `app.html:2981`,3020 and `js/export.js` calls `ensureManagerExportAssets()` before each export | **DONE** |
| **C6** | Leaderboard top performers only (Filipino hiya) | `js/phase4-social.js:1015`–1056 `renderRankingsRest` renders every row from rank 4 to bottom with name + bags + delta. `renderRankingsTiered` (line 1058) does the same per-tier. **No top-N truncation.** Podium correctly shows only top 3, but the "rankings list" exposes the entire tail. | **MISSING (P0)** |

---

## Findings (severity + file:line + what + fix + effort)

### P0 — TSR/strategic non-negotiable

1. **C6 leaderboard exposes low performers** — `js/phase4-social.js:1015`–1056 `renderRankingsRest` and `renderRankingsTiered`. Violates `CLAUDE.md` Rule 8 ("Leaderboard shows TOP performers only") and `PRODUCT.md` C6 backlog. **Fix:** Cap rendered rows to top N (3–5); render the viewer's own rank separately ("Ikaw: #8 · 9 visits"); hide everyone else. **Effort:** S (~30 min, one slice + one me-row block).
2. **Store detail seeds raw "Loading..." on TSR navigation path** — `app.html:1898,1902`. Violates `CLAUDE.md` Rule 7 (no spinners for TSRs — and text-only "Loading..." is the placeholder version of the same anti-pattern) and B3. Patrol skeleton primitives (`.skeleton-row`, `.skeleton-line`) already exist in `patrol.css:1970`. **Fix:** Replace innerHTML with skeleton block and use `T.loading` only as aria-label. **Effort:** S.

### P1 — Visible breakage / spec gap

3. **Manager `.hdr-btn` icons render ~36px (sub-48 target)** — `app.html:545,546,658,662`. Inline styles set `padding:0; border-radius:50%` but never set width/height. `tsr-field.css` enforces 64px for TSR/champion only. DSM/RSM users get tiny icon buttons. **Fix:** Add `.hdr-btn { min-width: 40px; min-height: 40px; }` base in `patrol.css` and bump to 48px in a manager-scoped block in `density-pass.css`. **Effort:** S.
4. **DSM home seeds English "Loading..."** — `app.html:242` `<div ... id="dsmHdrName">Loading...</div>`. Manager-facing but PRODUCT.md flags first-paint English under B3. **Fix:** `data-i18n="home.greeting_loading"` or empty text + skeleton class. **Effort:** S.
5. **B6 manager-only CSS still eager on TSR path** — `app.html:24,28,29` load `rsm.css` (436 LOC), `phase4-social.css` (511 LOC), `phase3-sales-stores.css` (432 LOC) for every role. Roughly +50KB CSS on TSR data budget. **Fix:** Wrap these in the same `_loadCssOnce` pattern, gated by role detection. **Effort:** S.
6. **Inline assignment-page CSS (177 LOC) in `app.html`** — `app.html:308`–485. Mostly hard-coded Vienovo navy `#004D71` and `#fff`, no tokens. **Fix:** Move to `css/assign.css`, switch to tokens (`--brand-navy`, `--bg-elevated`). **Effort:** M.

### P2 — Drift / debt

7. **CSS duplication between `density-pass.css` and `dsm-rsm-mobile.css`** — both set `body.role-dsm/rsm/ceo #bottom-nav .nav-item { min-height: 52px; ... font-size: 9px }` for the manager bottom nav (`density-pass.css:29`–58 vs `dsm-rsm-mobile.css:23`–67). Either file silently winning makes future tweaks brittle. **Fix:** Collapse to a single source-of-truth file. **Effort:** S.
8. **Admin pages do not load `tokens.css`** — `admin.html:7`–9, `admin-org.html`, `admin-users-sap.html` only import `patrol.css` + `admin-page.css`. Per `PRODUCT.md` "Cross-cutting themes — CSS / token drift" (P2). Admin variables (`--navy`, `--blue`) come from `patrol.css` only, not the OKLCH stack. **Fix:** Add `<link rel="stylesheet" href="css/tokens.css?v=1">` to admin shells, then migrate selected admin colors. **Effort:** M.
9. **Dead CSS — `.sales-sap-spinner` + `.sales-sap-loading`** — `css/dsm-rsm-mobile.css:424`–446 + `@keyframes sales-spin`. No longer emitted by `js/sales-tab.js` (replaced by skeleton classes in C2). **Fix:** Delete. **Effort:** XS.
10. **`feed-toast` lacks `role="status"`** — `js/activity-feed.js:151`–161 creates a transient div with `className='feed-toast'` and no ARIA. `DESIGN.md` requires `role="status"` on toasts. **Fix:** `t.setAttribute('role','status'); t.setAttribute('aria-live','polite');`. **Effort:** XS.
11. **Z-index chaos** — values span `0`, `1`, `2`, `10`, `40`, `50`, `80`, `90`, `100`, `150`, `500`, `600`, `900`, `1000`, `5000`, `5100`, `5200`, `5300`, `9999`, `10000`, `99999` across files. `patrol.css:457` and `activity-feed.css:510` both use `99999`. No documented stacking layer convention. **Fix:** Define a 4-tier z-index scale in `tokens.css` (base / overlay / sheet / toast / debug). **Effort:** M.
12. **`!important` storm in `patrol.css` (51 occurrences)** — fights inline styles and cascade order. **Fix:** Audit once tokens.css migration begins; remove on Phase-2 rewrites only. **Effort:** L.
13. **A1 incomplete inline `style="..."` cleanup on admin pages** — 10 attrs on `admin.html`, 5 on `admin-org.html`, 7 on `admin-users-sap.html`. Mostly margin/color polish. Below P1 since the big block is gone. **Fix:** Replace with utility classes in `admin-page.css`. **Effort:** S.

### P3 — Polish / accessibility

14. **Color contrast on `.chip-o` and similar warn chips** — `css/patrol.css:1711` uses `color: var(--status-warn)` (`#F7B928`) on `rgba(247,179,40,0.12)` background ≈ 3:1 contrast, below WCAG AA 4.5:1 for body text. **Fix:** Use a darker text color (`#8a5a00`) for warn chip text. **Effort:** XS.
15. **`oauthResult.error` raw upstream string surfaced on `index.html:360`** — minor i18n leak when Supabase returns a localized error. **Fix:** Map known error codes to `L.googleLoginFailed`. **Effort:** S.
16. **`Loading...` strings sprinkled in static HTML for DSM/manager headers (`app.html:242`)** also tagged under P1#4 above — duplicated mention for completeness.

---

## Dead CSS / token drift / cleanup

- **Dead:** `.sales-sap-spinner`, `.sales-sap-loading`, `@keyframes sales-spin` in `css/dsm-rsm-mobile.css:424`–446 (replaced by C2 skeleton).
- **Drift:** Admin shells skip `tokens.css`; assignment page hard-codes `#004D71`/`#fff`/`#eee` instead of tokens; multiple `9999`/`99999` z-index uses.
- **Duplication:** Manager bottom-nav sizing duplicated across `density-pass.css` and `dsm-rsm-mobile.css`.
- **Heavy bundle on TSR critical path:** `rsm.css` (436), `phase4-social.css` (511), `phase3-sales-stores.css` (432) — should be lazy-loaded per role like `sales-tab-v2.css`.
- **Inline blob:** 177-line `<style>` block in `app.html:308`–485 for the assign page should become `css/assign.css`.

---

## TSR non-negotiable scorecard

| Rule | Status | Evidence |
|------|--------|----------|
| **64px taps** | **PASS** | `css/tsr-field.css` enforces 64px on all TSR-facing controls: `#bottom-nav .nav-item`, `.hdr-btn`, `.fab`, `.outcome-chip`, `.outcome`, `#btn-visit-submit`, `.more-sheet-item`, `.fab-pick-btn`. Bottom nav also has inline `min-height:64px` per button at `app.html:1297`-1309 as belt-and-braces. |
| **≤4 bottom tabs for TSR** | **PASS** | `app.html:1296`-1313 = exactly 4 buttons; `js/nav-role-device.js:31`-37 `NAV_CONFIGS.tsr.mobile` has 4 entries with `more` opening a bottom sheet (Profile/Visits/Logout live inside). |
| **No TSR spinners** | **FAIL (degraded)** | TSR-side spinners removed (no `.spinner` class served to TSR; visits page uses `.skeleton-row`; stores use skeletons). **BUT:** Store detail page on TSR sets `textContent = 'Loading...'` at `app.html:1898,1902` — text placeholder same anxiety category. |
| **Trilingual first-paint** | **PASS (with caveats)** | 30× `data-i18n` attrs in `app.html`; bottom nav has both inline Tagalog text ("Bahay", "POS", "Mapa", "Higit pa") AND `data-i18n` keys. Login `index.html` applies `LABELS[lang]` synchronously before user interaction. **Caveat:** `app.html:242` DSM hdr seeds English "Loading..." (manager surface). |
| **No swipe-only actions** | **PASS** | No swipe-to-delete or swipe-to-reveal in TSR shell; More sheet opens via explicit tap; refresh is via explicit button (no pull-to-refresh wiring found). |
| **No `user-scalable=no`** | **PASS** | None in any in-scope HTML shell; `app.html:5` is `width=device-width, initial-scale=1.0, viewport-fit=cover`; admin/login likewise use no zoom lock. Only out-of-scope `prototype-demo-reference.html` carries the lock. |

**Score:** 5 PASS / 1 FAIL → 5 of 6 TSR non-negotiables pass.

---

*End of Audit B.*

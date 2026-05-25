# Round 8 — Accessibility
**Date**: 2026-05-25 (post-R7)
**Mode**: A — static analysis (no browser screenshots / no axe-core run in this pass)

## Score: 6 / 10

Foundations are present (headings, ARIA on key controls, `prefers-reduced-motion`, `role="dialog"` modals, TSR 64px touch). But three structural a11y gaps are real and pilot-relevant: (1) no skip-to-content link, (2) `<html lang="en">` never switches with active locale on a trilingual app, and (3) many `<label>` elements in admin + login are not paired via `for=` (label-by-proximity only). Bottom nav uses `<div>` not `<nav>`.

## Checklist results

| Item | Status | Evidence (file:line) | Note |
|---|---|---|---|
| h1/h2/h3 hierarchy | ⚠️ PARTIAL | `app.html:144,158,318,436,792` (multiple `<h1>` per shell across pages); `index.html:168`; `admin.html:17,36,86,125,156,196,235` | Each "page" div has its own `<h1>` — defensible for a SPA with route swaps but landmarks unclear |
| `<main>` landmark | ⚠️ PARTIAL | `app.html:183,245` — only on TSR home + DSM home | Missing on `#page-stores`, `#page-assign`, `#page-map`, `#page-visits`, `#page-profile`, sales pages |
| `<nav>` landmark | ❌ FAIL | `app.html:1129` bottom nav uses `<div class="bottom-nav">` | Should be `<nav>` for AT users |
| `<aside>` / `<footer>` where appropriate | ⚠️ PARTIAL | `admin.html:35` has `<aside aria-label="...">`; no `<footer>` anywhere in shipped HTML | Admin OK; TSR shells skip |
| `aria-label` on icon-only buttons | ✅ PASS | `app.html`: 23 occurrences (e.g. `app.html:176-181` Notifications, Profile); `admin.html`: 10 | Coverage on TSR home icon buttons confirmed |
| Focus styles on interactive elements | ⚠️ PARTIAL | 18 `:focus` / `:focus-visible` rules across 7 CSS files (`admin-page.css:185,507-508`, `admin-sap.css:37`, `admin-org.css:171`, `assign-page.css`, `patrol.css`, `visits-page.css`) | Focus styles exist but scoped to specific inputs; many TSR `.hdr-btn` / `.nav-item` / `.outcome-chip` lack explicit `:focus-visible` rings |
| Color contrast (5 spot-checks) | ✅ PASS | `--text-primary: #050505` on `--bg-main: #FFFFFF` ≈ 20:1; `--text-secondary: #65676B` on white ≈ 5.8:1; `--accent: #00A6CE` on white ≈ 3.1:1 (large text only); `.btn-reset-pin` #5a3a00 on #F1B11D ≈ 7.5:1; `--text-muted: #8A8D91` on white ≈ 3.5:1 (large text only) | Body + heading text contrast strong; `--text-muted` is borderline for small text |
| `<label>` paired with `<input>` | ❌ FAIL | `app.html`: only 2 `for=` pairings (`tindahan-search`, `vf-visits-search-label`) vs 8+ inputs; `index.html:173,180` labels lack `for=` (login phone + PIN); `admin.html:91,95,104,109,162,166,175,180,216` many labels without `for=` | High failure rate; screen reader users can't click label to focus input |
| `:focus-visible` rules in CSS | ⚠️ PARTIAL | 5 explicit `:focus-visible` rules (`admin-sap.css:37`, `admin-page.css:185,507-508`, `admin-org.css:171`) | Admin forms covered; TSR shell relies on browser default |
| `prefers-reduced-motion` honored | ✅ PASS | `css/patrol.css:3695`, `css/tsr-field.css:260-277` | Dual-layer guard |
| Touch targets TSR 64px | ✅ PASS | See Round 2 — `tsr-field.css` enforces comprehensively | |
| Touch targets manager 48px | ✅ PASS | Per `PRODUCT.md:104,142`, W5 bumped `.hdr-btn` to 48px; sample at `css/tsr-field.css:117` confirms `min-height: 48px` for `.tsr-section-action` (a manager-shareable secondary) | |
| Skip-to-content link | ❌ FAIL | Zero matches for `skip-to-content`, `skip to content`, or `.sr-only` in `app.html` | Keyboard / screen-reader users must tab through full header on every page change |
| `<html lang>` switches with active locale | ❌ FAIL | `app.html:2` static `lang="en"`; `index.html:2` static `lang="en"`; `admin.html:2` static `lang="en"`. No JS path sets `documentElement.lang` (`js/phase4-social.js:1186,1232` were the only matches and are unrelated content-strings) | Trilingual TSR app announces all content as English to screen readers |

## Findings — must fix
1. **Add skip-to-content link** at the top of `app.html`, `index.html`, `admin.html` (a hidden `<a href="#main" class="sr-only sr-only-focusable">`). Pilot blocker for keyboard users.
2. **Switch `<html lang>` on locale change**. Add `document.documentElement.lang = currentLocale` everywhere `T` is rehydrated (likely `js/labels-v2.js` / wherever `setLocale` lives). Set to `tl`, `ceb`, or `en` to match.
3. **Pair `<label for="...">` with input `id`** across `admin.html` (lines 91, 95, 104, 109, 162, 166, 175, 180, 216) and `index.html` (lines 173, 180). Trivial change, large screen-reader payoff.
4. **Wrap bottom nav in `<nav aria-label="...">`** (`app.html:1129`). One-line semantic upgrade.

## Findings — recommended
1. Add `:focus-visible` outline rules for `.nav-item`, `.hdr-btn`, `.outcome-chip`, `.fab` in `css/tsr-field.css`. Browser-default rings are inconsistent across Chromium/Firefox/Safari and can be invisible on `#00A6CE` backgrounds.
2. Add `<main>` to the remaining pages in `app.html` (Stores `#page-stores`, Assign `#page-assign`, Map `#page-map`, Visits `#page-visits`, Profile `#page-profile`, Sales `#sales-v2-root`). Most use `<div class="app-content">` — easy swap.
3. `--text-muted: #8A8D91` on white is 3.5:1 — under WCAG AA (4.5:1) for body text. Acceptable for non-essential hints / timestamps; audit any use on prose ≥14px regular.
4. Multiple `<h1>` per shell is defensible in an SPA with full page swaps, but consider `aria-labelledby` on each `.page` to make the active heading discoverable. Alternatively rename non-active `<h1>` to `<h2>` per ARIA landmark heuristics.

## What's strong
1. `aria-label` discipline on icon buttons in `app.html` is consistent (23 instances) — Notifications, Profile, Search, etc. all labeled.
2. Modal a11y in `admin.html` already follows DESIGN.md spec: `role="dialog"`, `aria-modal`, labelled title, focus trap (per DESIGN.md:39).
3. `prefers-reduced-motion` guard is dual-layered (`patrol.css:3695` global + `tsr-field.css:260` TSR scope) — gentle 3s shimmer kept for skeletons under WCAG 2.3.3.
4. WCAG 2.3.3 contrast fixed on `.btn-reset-pin` with an inline comment proving 7.5:1.
5. TSR 64px touch targets are exemplary — `tsr-field.css` covers 14+ control families with `!important`.

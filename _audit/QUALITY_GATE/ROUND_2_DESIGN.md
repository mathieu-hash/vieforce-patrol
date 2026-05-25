# Round 2 — UI & Design Fidelity
**Date**: 2026-05-25 (post-R7)
**Mode**: A — static analysis (no browser screenshots in this pass)

## Score: 7.5 / 10

Strong adherence to TSR rules in scope-limited files (`tsr-field.css`, `app.html`). Real misses come from (1) token drift between `tokens.css` (Elite, `--accent: #2D7FF9`) and `patrol.css` (legacy, `--accent: #00A6CE`), (2) em-dashes in TSR locale JSON, (3) `--accent-dark` value mismatch vs CLAUDE.md §16 spec, (4) missing `css/components/sync-badge.css` file, and (5) one residual `Loading...` English leak in `js/team.js:504`.

## Checklist results

| Item | Status | Evidence (file:line) | Note |
|---|---|---|---|
| `--accent` = `#00A6CE` | ⚠️ PARTIAL | `css/patrol.css:22` PASS; `css/tokens.css:46` FAIL (`#2D7FF9`) | Elite stack uses different blue; risk on screens that import tokens.css only |
| `--accent-dark` = `#004D71` | ❌ FAIL | `css/patrol.css:23` is `#0070E0` | Spec says `#004D71`. Navy lives separately as `--navy` (`patrol.css:5`) |
| Status dots Messenger-grade | ✅ PASS | `css/patrol.css:31-33` (`#31A24C / #F7B928 / #FA383E`) | Matches spec exactly |
| No `#1877F2` Facebook blue leaks | ⚠️ PARTIAL | `css/patrol.css:2863`, `css/dsm-rsm-mobile.css:891` | Two `--mgr-brand-strong: #1877F2` defs in manager-only scopes; not TSR but contradicts CLAUDE.md §16 ban |
| No em dashes (TSR locale ban) | ❌ FAIL | `locales/tl.json:13,33,82`; `locales/ceb.json:13,33,82`; `locales/en.json:13,33` | 8 em-dash usages in TSR-facing locale strings |
| No gradient text (`background-clip: text`) | ✅ PASS | `docs/*.html` only (out-of-scope mockups); none in shipped CSS | Confirmed via repo-wide grep |
| No left/right side-stripe borders >1px | ✅ PASS | Zero matches for `border-left:.*[3-9]px` in `css/` | Top-border policy holds |
| No nested cards | ✅ PASS | No `.card .card` selectors or visible nested patterns | |
| Buttons hover/active/disabled states | ✅ PASS | `css/tsr-field.css:65-70` disabled; `css/elite-action.css:914` hover; `:active` and `:active::after` patterns | TSR Submit Visit covered |
| Loading uses skeletons (Rule 7) | ⚠️ PARTIAL | `app.html:1776` skeleton state set; `js/team.js:504` still renders `'Loading...'`; `js/sales-tab.js:696` uses skeleton aria | TSR scorecard detail (manager-class but TSR-data) leaks Loading text |
| Empty states trilingual | ⚠️ PARTIAL | `js/phase4-social.js:1186,1232` hardcodes `Walang iba pang ranking.` (Tagalog only, not via T.*) | Most paths use `T.*`; this one bypasses |
| Error states via T.* not hardcoded English | ✅ PASS | Scanned 20+ render paths; T.* used consistently in TSR paths | |
| TSR controls 64px minimum | ✅ PASS | `css/tsr-field.css:12,16-21,32-33,45,50,58,74,79,92,98,108` enforces 64px on `.hdr-btn`, FAB, chips, `#btn-visit-submit`, `.nav-item`, `.icon-btn`, `.nba-btn`, `.more-sheet-item` | Comprehensive coverage |
| **Polish wave items** | | | |
| No uppercase on Tindahan row names | ✅ PASS | `css/elite-action.css:951-961` (`.tindahan-row-name`: no `text-transform`); `css/visits-page.css:201` same | UPPERCASE drop confirmed |
| WCAG contrast on `.btn-reset-pin` ≥4.5:1 | ✅ PASS | `css/admin-page.css:543-556` — dark brown `#5a3a00` on gold `#F1B11D`, ~7.5:1 | Comment explicitly notes WCAG pass |
| KPI label overlap fix | ✅ PASS | `css/patrol.css:824` `.kpi-card .label` single-line definition; no overlap pattern | |
| Sync badge CSS shipped (`css/components/sync-badge.css`) | ❌ FAIL | File does **not exist**. `css/components/` directory does not exist at all. JS module at `js/_util/sync-badge.js` ships; CSS may live inline or in `patrol.css`/`density-pass.css` (only files matching `sync-bar`) | Spec file path missing |
| `prefers-reduced-motion` honored | ✅ PASS | `css/patrol.css:3695`, `css/tsr-field.css:260-277` | Both global + TSR-scoped guards |

## Findings — must fix
1. **Em dashes in TSR locales** (`locales/tl.json`, `ceb.json`, `en.json` — 8 lines): violate CLAUDE.md §0 ban. Replace with " - " (hyphen with spaces) or restructure sentences.
2. **`--accent-dark` value drift**: `patrol.css:23` is `#0070E0`, spec says `#004D71`. Either fix the var or amend §16. Currently any code using `var(--accent-dark)` for "navy" gets a bright blue instead.
3. **`js/team.js:504` Loading… leak**: hard-codes `'Loading...'` fallback. Replace with `T.loading` (which exists) and add a Tagalog/Bisaya default if T is undefined, OR swap to skeleton.

## Findings — recommended
1. Resolve **dual `--accent`** between `tokens.css` (`#2D7FF9`) and `patrol.css` (`#00A6CE`). Document which screens may use which, or unify on `#00A6CE` and remove the Elite override.
2. Manager-only `--mgr-brand-strong: #1877F2` (`patrol.css:2863`, `dsm-rsm-mobile.css:891`): swap to `#004D71` or another Vienovo navy to honor the §16 "no Facebook blue leaks" intent across all roles.
3. `js/phase4-social.js:1186,1232` empty-state strings (`Walang iba pang ranking.`) are Tagalog-only; route through `T.*` for parity with Bisaya/English.
4. The spec mentions `css/components/sync-badge.css` — either ship it or remove from the spec.

## What's strong
1. TSR tap-target enforcement is exemplary (`tsr-field.css` covers 14+ control families at 64px with `!important`).
2. UPPERCASE drop on Tindahan rows is clean — both `.tindahan-row-name` definitions (elite-action + visits-page) are sentence-case, restoring Messenger conversation-row feel.
3. `prefers-reduced-motion` guard is dual-layered (global + TSR scope) — gentle 3s shimmer preserved for skeletons.
4. WCAG contrast on `.btn-reset-pin` includes an inline comment proving the 7.5:1 ratio — disciplined.
5. `background-clip: text` is 100% absent from shipped CSS (only out-of-scope `docs/*` mockups carry it).

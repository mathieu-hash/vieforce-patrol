# Coding Conventions

**Analysis Date:** 2026-05-04

## Naming Patterns

**Files:**
- **Browser scripts:** kebab-case filenames under `js/` (e.g. `sales-tab.js`, `phase4-social.js`, `labels-v2.js`, `admin-users-sap.js`).
- **API handlers:** `camelCase.js` for leaf routes (`sales.js`, `customers.js`) or bracket dynamic segments (`api/sap/customer/[cardcode].js`).
- **Shared server libs:** snake-free descriptive names in `api/_lib/` (`auth.js`, `hq-client.js`, `scope.js`, `sales-queries.js`).
- **Locales:** ISO-style codes `en.json`, `tl.json`, `ceb.json` in `locales/`.
- **CSS:** kebab-case feature bundles in `css/` (`phase3-sales-stores.css`, `sales-tab-v2.css`, `dsm-rsm-mobile.css`).

**Functions:**
- Prefer **camelCase** for named helpers (`verifySession`, `callHqProxy`, `stripMarginsIfNeeded`, `wrapPatrolMeta`).
- Browser bundles often expose **PascalCase** namespaces on `window` (`PatrolI18n`, `PatrolSession` references).

**Variables:**
- Server code uses **const**/**let** and camelCase (`session`, `params`, `_hqBase`).
- Legacy browser modules use **var** inside IIFEs and `function` keyword (no ES modules in those files).

**Types:**
- No TypeScript in `js/` or `api/`; E2E only uses TypeScript in `tests/e2e/*.spec.ts`. Use JSDoc occasionally in `api/_lib/hq-client.js` and `js/i18n.js` for public functions.

## Code Style

**Formatting:**
- Not detected — no `.eslintrc`, `eslint.config.*`, `.prettierrc`, or `biome.json` in repo root.
- Rely on consistent patterns per layer (see below).

**Linting:**
- Not applicable — no ESLint/Biome config checked in.

## Import Organization

**Order:**
1. **API routes:** CommonJS `require` for sibling `_lib` modules first, then logic (`api/sap/sales.js`).
2. **Unit tests:** `node:test` + `node:assert/strict`, then project paths (`../../api/...`), then optional `./_helpers`.

**Path Aliases:**
- Not used — relative paths only (`../../api/_lib/scope.js`).

## JavaScript: IIFE and Globals

**Pattern — attach API to `window` without polluting scope:**
- Wrap file body in `(function () { 'use strict'; ... })();` and assign exports to `window` at the end.
- **Canonical example:** `js/i18n.js` defines `window.PatrolI18n = { t, load, init, setLocale, ... }` and convenience globals `window.t`, `window.applyI18nLabels`.
- **Other IIFE modules:** `js/sales-tab.js`, `js/phase4-social.js`, `js/admin-users-sap.js` (grep `(function ()` under `js/`).

**Inter-module integration:**
- Read/write **`window.PatrolSession`**, **`window.getSession`**, **`window.setLanguage`**, **`window.patchPatrolSession`** when bridging i18n and legacy `labels-v2` (`js/i18n.js`).
- Dispatch **`CustomEvent`** namespaced events (e.g. `patrol:locale-changed`) for cross-module hooks.

**Prescriptive rule:** New browser features that must stay script-tag compatible should follow the same IIFE + `window.*` namespace pattern unless the file is intentionally migrated to ES modules.

## CSS Organization

**Load order (shell example — `app.html`):**
1. `css/tokens.css` — design tokens (`:where(:root[data-theme="light"])`, dark theme blocks); documents coexistence with legacy `patrol.css` variables.
2. `css/patrol.css` — core shell, navigation, pages.
3. Role/layout layers: `css/rsm.css`, `css/dsm-rsm-mobile.css`, `css/density-pass.css`.
4. Feature CSS: `activity-feed.css`, `phase4-social.css`, `phase3-sales-stores.css`, `elite-components.css`, `elite-action.css`, `visits-page.css`, `sales-tab-v2.css`.
5. Third-party: MapLibre CSS from CDN.

**Cache busting:** Query params on links (`?v=33` on `patrol.css` in `app.html`) — bump when shipping visible CSS changes.

**Conventions:**
- **Tokens vs legacy:** `tokens.css` uses `:where()` for light theme so legacy `:root` in `patrol.css` keeps specificity where needed (comment at top of `tokens.css`).
- **Feature naming:** Phase-prefixed files (`phase3-*`, `phase4-*`) for milestone-sized UI areas.
- **Admin surfaces:** `admin.html` / `admin-users-sap.html` often load only `css/patrol.css` — keep shared primitives there if admin must stay lightweight.

## Internationalization (`locales/`, `js/i18n.js`)

**Locale files:**
- Static JSON dictionaries: `locales/en.json`, `locales/tl.json`, `locales/ceb.json`.
- **Parity gate:** `npm run check:locales` runs `scripts/check-locale-parity.mjs` — all three files must have identical key sets (sorted key diff).

**Runtime (`js/i18n.js`):**
- **Supported codes:** `en`, `tl`, `ceb` with normalization from legacy (`BIS`/`ceb`, `TL`/`fil`, etc.).
- **Loading:** `fetch('/locales/' + code + '.json', { cache: 'no-store' })` with fallback chain to English on failure (`console.warn` / `console.error`).
- **API:** `PatrolI18n.t(key, vars)`, `{key}` replacement in strings, `data-i18n` attribute scanning via `applyI18nLabels(root)`.
- **Persistence:** `localStorage.patrol_locale` (and legacy `patrol_lang`), optional PATCH `PATCH /api/user/language` with `x-session-id` (`saveUserLocale`).

**Prescriptive rule:** Add keys to all three JSON files in lockstep; run `npm run check:locales` before commit.

## Error Handling in API Routes

**Common patterns:**
- **JSON responses:** Set `Content-Type: application/json` early where routes return JSON (`api/sap/sales.js`).
- **Auth:** `const session = await verifySession(req); if (!session) return unauthorized(res);` — `unauthorized` in `api/_lib/auth.js` returns **401** with `{ error, message }`.
- **Upstream HQ (`callHqProxy`):** Treat `status >= 400` as failure; map to **502** for generic HQ errors and **504** when HQ path signals timeout (`api/sap/sales.js` pattern). Include `hq_status` when proxying failure context.
- **`hq-client`:** Returns structured `{ status, body }` — handles AbortError as timeout **504**, network errors as **502**, retries once on **5xx** (not on timeout).
- **Auth module:** Logs with `console.error` prefix `[auth]`; returns `null` on missing service key, bad Supabase response, or exceptions (`api/_lib/auth.js`).
- **User language route:** **405** wrong method, **503** missing `SUPABASE_SERVICE_ROLE_KEY`, **400** invalid language, parsed upstream errors from Supabase text body (`api/user/language.js`).

**Prescriptive rule:** New SAP proxy routes should follow `api/sap/sales.js`: verify session → call `callHqProxy` → map 4xx/5xx to 502/504 with explicit JSON body → success path uses `scope.js` helpers (`wrapPatrolMeta`, `stripMarginsIfNeeded`).

## Logging

**Framework:** Node/Vercel functions use **`console.error`** / **`console.warn`** with bracketed tags (`[auth]`, `[i18n]`). Browser i18n uses `console.warn` for recoverable issues.

**Patterns:**
- Log and return `null` or structured HTTP error — do not throw from auth for expected failures.

## Comments

**When to Comment:**
- File-level purpose and HTTP method/path (`api/sap/sales.js`, `api/user/language.js`).
- Phase/refactor history and deprecation notes (`api/_lib/hq-client.js`, `tests/unit/scope.test.js`).

**JSDoc/TSDoc:**
- Used for exported helpers in `hq-client` and public i18n functions where behavior is non-obvious (timeouts, retries).

## Function Design

**Size:** Handlers stay small; shared logic lives in `api/_lib/`.

**Parameters:** `req, res` default export async function for Vercel-style handlers.

**Return Values:** Prefer **`return res.status(...).json(...)`** and early returns after auth failures.

## Module Design

**Exports:** CommonJS `module.exports` for all `api/**/*.js` checked.

**Barrel Files:** Not used — import `_lib` modules explicitly.

---

*Convention analysis: 2026-05-04*

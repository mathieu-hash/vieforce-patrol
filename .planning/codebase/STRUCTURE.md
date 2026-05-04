# Codebase Structure

**Analysis Date:** 2026-05-04

## Directory Layout

```text
vieforce-patrol/
├── app.html              # Main authenticated SPA shell (pages, nav, inline nav() bootstrap)
├── index.html            # Login / OAuth entry; OAuth bounce target from app.html
├── admin.html            # Admin HTML entry (if used for admin flows)
├── admin-users-sap.html  # SAP users admin surface
├── config.js             # Runtime config (loaded early in app.html)
├── manifest.json         # PWA manifest
├── vercel.json           # Aliases (patrol.vienovo.ph), security headers
├── package.json          # Scripts: Playwright e2e, Node unit tests, Supabase CLI helpers
│
├── api/                  # Vercel serverless (Node). Path = URL path.
│   ├── _lib/             # Shared: auth, HQ client, scope/margin strip (not routed)
│   ├── admin/
│   ├── sap/
│   ├── user/
│   ├── farms.js
│   ├── health.js
│   └── whoami.js
│
├── css/                  # Design tokens + feature stylesheets (linked from app.html)
├── docs/                 # HTML mockups / internal docs (non-runtime)
├── icons/                # PWA / branding assets
├── js/                   # All client-side application logic (no bundler)
├── locales/              # i18n JSON (en, tl, ceb, …)
├── migrations/           # Additional SQL migrations (if present beside supabase/)
├── scripts/              # Node maintenance (locale parity, Supabase auth checks)
├── server/               # Non-Vercel helpers (e.g. store matcher — see repo)
├── supabase/             # config.toml, schema, migrations, Edge Functions
├── tests/
│   ├── e2e/              # Playwright specs (*.spec.ts)
│   └── unit/             # Node native test runner (*.test.js)
└── playwright-report/    # Generated e2e reports (artifact)
```

## Directory Purposes

**Root HTML:**
- Purpose: Entry pages for login vs authenticated app vs specialized admin HTML.
- Contains: `index.html`, `app.html`, `admin.html`, `admin-users-sap.html`
- Key files: `app.html` (primary shell), `index.html` (login)

**`api/`:**
- Purpose: HTTP API implemented as one handler file per route segment on Vercel.
- Contains: JSON REST handlers; `api/_lib/*.js` shared modules with `_` prefix so Vercel does not expose them as routes.
- Key files: `api/_lib/auth.js`, `api/_lib/hq-client.js`, `api/_lib/scope.js`, `api/sap/README.md`, `api/sap/sales.js`, `api/health.js`

**`js/`:**
- Purpose: Feature modules loaded by `app.html` in a fixed order (auth → db → i18n → feature pages).
- Contains: Plain `.js` files attaching to `window`.
- Key files: `js/auth.js`, `js/supabase.js`, `js/db.js`, `js/nav-role-device.js`, `js/role-scope.js`, `js/stores.js`, `js/visits.js`, `js/sales-tab.js`, `js/offline.js`

**`css/`:**
- Purpose: Global tokens and feature-specific styles.
- Contains: `css/tokens.css`, `css/patrol.css`, plus phase/feature sheets (`css/sales-tab-v2.css`, `css/dsm-rsm-mobile.css`, etc.)

**`locales/`:**
- Purpose: JSON message catalogs for `js/i18n.js` / `PatrolI18n`.
- Contains: `locales/en.json`, `locales/tl.json`, `locales/ceb.json`, …

**`supabase/`:**
- Purpose: Local Supabase project config, SQL migrations, seeds, Edge Functions.
- Contains: `supabase/config.toml`, `supabase/migrations/*.sql`, `supabase/functions/verify-pin/`, `supabase/schema.sql`

**`tests/`:**
- Purpose: Automated tests — unit (Node `--test`) and e2e (Playwright).
- Contains: `tests/unit/*.test.js`, `tests/e2e/*.spec.ts`, `tests/unit/_helpers.js`

**`scripts/`:**
- Purpose: Developer tooling (locale checks, Supabase URL patching).
- Key files: `scripts/check-locale-parity.mjs`, `scripts/patch-supabase-auth-url.mjs`

**`server/`:**
- Purpose: Optional Node services/helpers outside Vercel route tree (e.g. matching logic). Not the primary request path for Patrol web.

## Key File Locations

**Entry Points:**
- `index.html` — Login and OAuth completion.
- `app.html` — Post-login SPA; loads entire script list and defines `window.nav`.
- `api/*.js` — Vercel serverless entry per HTTP path.

**Configuration:**
- `config.js` — Client configuration (Supabase URL/key placeholders as applicable — do not commit secrets).
- `vercel.json` — Deployment aliases and headers.
- `package.json` — `test`, `test:unit`, `test:e2e`, Supabase scripts.
- `supabase/config.toml` — Local Supabase CLI configuration.

**Core Logic:**
- `js/auth.js` — Session lifecycle.
- `js/db.js` — Supabase data access + `sapFetch`.
- `api/_lib/hq-client.js` — HQ integration.

**Testing:**
- `tests/e2e/*.spec.ts` — Playwright flows (auth, stores, visit, offline, DSM).
- `tests/unit/hq-client.test.js`, `tests/unit/scope.test.js`, `tests/unit/sap-*.test.js` — API helpers and SAP handlers.

## Naming Conventions

**Files:**
- Client modules: `kebab-case.js` or descriptive compound (`nav-role-device.js`, `sales-tab.js`).
- API routes: match URL (`customer/[cardcode].js` for dynamic segment on Vercel).
- Tests: `*.test.js` (unit), `NN-topic.spec.ts` (e2e numbered flows).

**Directories:**
- `api/_lib` — underscore convention for non-route shared code.
- `tests/unit` vs `tests/e2e` — separation by runner.

## Where to Add New Code

**New featured “page” in the SPA:**
- Markup: add a `<section class="page" id="page-...">` (or agreed id) in `app.html`.
- Logic: add `js/<feature>.js` and include `<script src="js/<feature>.js?v=..."></script>` after dependencies in `app.html` (follow existing order: auth/db before data features).
- Navigation: extend `_mainPages` array in `app.html` `nav()` if the page should sync bottom-nav; add tab config in `js/nav-role-device.js` `NAV_CONFIGS` if role-specific tabs should appear.
- Styles: add `css/<feature>.css` and link in `app.html` `<head>`.

**New REST endpoint:**
- Add `api/<segment>/<name>.js` exporting default `async function (req, res)` (or matching Vercel Node convention used in repo).
- Shared logic → `api/_lib/<name>.js`.
- Document env vars in `api/sap/README.md` if SAP/HQ-related.

**New i18n keys:**
- Update all locale files under `locales/` (run `npm run check:locales` per `package.json`).

**New tests:**
- Unit: `tests/unit/<topic>.test.js`, register in `package.json` `test:unit` list if using explicit file list.
- E2e: `tests/e2e/<name>.spec.ts`; run `npm run test:e2e`.

## Special Directories

**`api/_lib/`:**
- Purpose: Shared server-only modules.
- Generated: No
- Committed: Yes

**`supabase/.temp/`:**
- Purpose: CLI cache (may exist locally).
- Generated: Yes
- Committed: Typically gitignored — verify `supabase/.gitignore`

**`node_modules/`, `playwright-report/`, `test-results/`:**
- Purpose: Dependencies and test artifacts.
- Generated: Yes

---

*Structure analysis: 2026-05-04*

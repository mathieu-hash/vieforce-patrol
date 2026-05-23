# Technology Stack

**Analysis Date:** 2026-05-04

## Languages

**Primary:**
- **JavaScript (ES5/ES6)** — Browser app (`js/*.js`), Vercel Node serverless handlers (`api/**/*.js`), unit tests (`tests/unit/*.js`).
- **TypeScript** — Playwright config (`playwright.config.ts`); Supabase Edge Function (`supabase/functions/verify-pin/index.ts`, Deno runtime).

**Secondary:**
- **SQL** — Supabase migrations (`supabase/migrations/*.sql`).
- **CSS** — Static stylesheets (`css/*.css`).

## Runtime

**Environment:**
- **Node.js** — Vercel builds and runs `api/**/*.js` as serverless functions (typical requirement Node 18+; lockfile-transitive engines include `>=18` for some deps).
- **Deno** — Supabase Edge Functions (`supabase/functions/verify-pin/index.ts`) via Supabase-hosted runtime.

**Package Manager:**
- **npm** — Primary.
- **Lockfile:** `package-lock.json` present (`lockfileVersion`: 3).

## Frameworks

**Core:**
- **Static SPA + Vercel Serverless** — HTML shells (`index.html`, `app.html`, `admin.html`, …) load vanilla JS; `/api/*` maps to `api/**/*.js` per Vercel conventions (`api/sap/sales.js` → `/api/sap/sales`).
- **No React/Vue/Svelte** in-repo for the main UI.

**Testing:**
- **Playwright** — `@playwright/test` **1.59.1** (pinned in lockfile; range `^1.59.1` in `package.json`).
- **Node.js built-in test runner** — `node --test` for unit tests (`package.json` script `test:unit`).

**Build/Dev:**
- **Supabase CLI** — `supabase` **2.98.0** (devDependency; npm script wrapper `sb`, `sb:link`, `sb:push`, etc.).
- **sharp** — **0.34.5** (devDependency; image tooling if used by scripts).
- **Vercel CLI** — Invoked via `npm run deploy:vercel` (no version pin in repo; global/`npx vercel`).

## Key Dependencies

**Critical (from `package.json` / lockfile):**

| Package | Version (effective) | Purpose |
|---------|---------------------|---------|
| `@playwright/test` | **1.59.1** | E2E tests (`tests/e2e/`, config `playwright.config.ts`). |
| `supabase` (CLI) | **2.98.0** | DB migrations, link project, deploy Edge Functions. |
| `sharp` | **0.34.5** | Dev image processing (optional tooling). |

**Browser (CDN, not npm):**
- `@supabase/supabase-js@2` — Loaded from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` in `index.html`, `app.html`, `admin.html`, `admin-users-sap.html`; initialized in `js/supabase.js`.

**Edge Function (remote imports):**
- Deno std `http/server` — `https://deno.land/std@0.168.0/http/server.ts` in `supabase/functions/verify-pin/index.ts`.
- `@supabase/supabase-js@2` — via `https://esm.sh/@supabase/supabase-js@2` in same function.

**Implicit / gap:**
- `server/services/store-sap-matcher.js` calls `require('@supabase/supabase-js')` but **`@supabase/supabase-js` is not declared in `package.json` or `package-lock.json`** — any Node script importing this file must install that dependency explicitly or it will fail at runtime.

## Application Version

- **`package.json`:** `"version": "3.2.0-beta.1"`.
- **`config.js`:** `VERSION: '3.2.0-beta.1'`, `RELEASE_CHANNEL: 'beta'`.

## Configuration

**Environment:**
- **Vercel Project** — Production deployment; `vercel.json` sets alias `patrol.vienovo.ph` and security headers.
- **Supabase** — Project ref **`yolxcmeoovztuindrglk`** (see `package.json` script `sb:link`, `scripts/patch-supabase-auth-url.mjs`, `scripts/check-supabase-auth-config.mjs`).
- **Do not commit secrets** — `.env` files exist only locally/Vercel dashboard; never paste values into docs.

**Required / common env var names (values omitted):**

| Variable | Where used |
|----------|------------|
| `HQ_API_BASE_URL` | Preferred HQ Cloud Run base URL (`api/_lib/hq-client.js`). |
| `HQ_API_BASE` | Legacy alias for HQ base URL (`api/_lib/hq-client.js`). |
| `HQ_SERVICE_TOKEN` | Bearer token for Patrol → HQ (`api/_lib/hq-client.js`). |
| `SUPABASE_URL` | Serverless + scripts (`api/_lib/auth.js`, `api/farms.js`, `api/user/language.js`, `server/services/store-sap-matcher.js`). |
| `SUPABASE_SERVICE_ROLE_KEY` | REST auth lookup + admin reads (`api/_lib/auth.js`, `api/farms.js`, `api/user/language.js`). |
| `SUPABASE_SERVICE_KEY` | Fallback alias in `server/services/store-sap-matcher.js` only. |
| `SUPABASE_ACCESS_TOKEN` | Supabase Management API for CLI scripts (`scripts/patch-supabase-auth-url.mjs`, `scripts/check-supabase-auth-config.mjs`). |
| `SUPABASE_PROJECT_REF` | Optional override for scripts (default same project ref). |
| `PATROL_SITE_URL` | Auth URL tooling / redirect alignment (`scripts/*.mjs`). |
| `PATROL_URI_ALLOW_LIST` | Supabase auth URL patch script. |
| `PATROL_URI_SUBSTRINGS` | Auth config check script. |
| `VERCEL_*` | Telemetry on `/api/whoami` (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_REGION`, `VERCEL_URL`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_GIT_COMMIT_SHA` — see `api/whoami.js`). |

**Edge Function secrets (set in Supabase dashboard):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — `supabase/functions/verify-pin/index.ts`.

**Build:**
- **`vercel.json`** — Rewrites passthrough, headers (`X-Content-Type-Options`, `X-Frame-Options`), `sw.js` cache rules.
- **`config.js`** — Client bootstrap: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OAUTH_PUBLIC_ORIGIN`, branding — consumed by HTML pages + `js/supabase.js`.

## Platform Requirements

**Development:**
- Node.js **18+** recommended (matches transitive engine hints and Vercel defaults).
- Supabase CLI for migrations (`npm run sb:link`, `sb:push`).
- No `.nvmrc` in repo.

**Production:**
- **Vercel** — Primary hosting; custom domain `patrol.vienovo.ph`; OAuth/public origin defaults include `https://vieforce-patrol.vercel.app` (`config.js`, `js/auth.js`).
- **Supabase** — Auth, Postgres/REST, Edge Functions.
- **Google Cloud Run** — HQ API (`api/_lib/hq-client.js` default host `vieforce-hq-api-*.asia-southeast1.run.app`); SAP B1 access is **only** through HQ, not from Patrol directly (`api/sap/README.md`).

---

## `package.json` scripts

| Script | Purpose |
|--------|---------|
| `test` | `playwright test` |
| `test:e2e` | Same as `test` |
| `test:e2e:report` | Playwright HTML reporter |
| `check:locales` | `node scripts/check-locale-parity.mjs` |
| `test:unit` | Locale check + `node --test` on listed unit tests under `tests/unit/` |
| `fix:supabase-auth-url` | `node scripts/patch-supabase-auth-url.mjs` |
| `check:supabase-auth` | `node scripts/check-supabase-auth-config.mjs` |
| `sb` | `supabase` CLI passthrough |
| `sb:login` | `supabase login` |
| `sb:link` | `supabase link --project-ref yolxcmeoovztuindrglk` |
| `sb:push` | `supabase db push` |
| `sb:migration:list` | `supabase migration list` |
| `sb:fn:deploy-verify-pin` | `supabase functions deploy verify-pin` |
| `deploy:vercel` | `vercel deploy --prod --yes` |

---

*Stack analysis: 2026-05-04*

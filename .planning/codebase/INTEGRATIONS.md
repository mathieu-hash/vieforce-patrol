# External Integrations

**Analysis Date:** 2026-05-04

## APIs & External Services

**HQ Cloud Run (SAP B1 proxy):**
- **Role:** Single upstream for all SAP-backed JSON APIs. Patrol serverless calls HQ with **Bearer `HQ_SERVICE_TOKEN`** and **`scope=user:<uuid>`** query param; HQ enforces territory/SlpCode scope and reads MSSQL SAP B1.
- **Client:** `callHqProxy()` in `api/_lib/hq-client.js` (uses `fetch`, 10s timeout, one retry on 5xx).
- **Base URL:** `process.env.HQ_API_BASE_URL` or `process.env.HQ_API_BASE`, else built-in default hostname in `api/_lib/hq-client.js` (asia-southeast1 Cloud Run).
- **Auth:** **`HQ_SERVICE_TOKEN`** — server-side only; never exposed to browser.
- **Call sites:** `api/sap/sales.js`, `api/sap/sales/all.js`, `api/sap/ar.js`, `api/sap/customers.js`, `api/sap/customer/[cardcode].js`, `api/sap/inventory.js`, `api/sap/speed.js`, `api/admin/sap-reps.js`.
- **Contract / troubleshooting:** `api/sap/README.md`, `docs/HQ_API_CONTRACT.md`.

**Supabase:**
- **Auth (browser):** `@supabase/supabase-js@2` from CDN; session persistence PKCE — `js/supabase.js`, flows in `js/auth.js`.
- **Google OAuth:** `supabaseClient.auth.signInWithOAuth({ provider: 'google', ... })` in `js/auth.js`; **`hd: 'vienovo.ph'`** hosted-domain hint; post-login email must end with **`@vienovo.ph`**. Redirect URL built by `getOAuthRedirectUrl()` (uses `CONFIG.OAUTH_PUBLIC_ORIGIN` from `config.js`).
- **Phone + PIN:** Edge Function **`verify-pin`** — `supabase/functions/verify-pin/index.ts`; public URL referenced in `js/auth.js` as `https://yolxcmeoovztuindrglk.supabase.co/functions/v1/verify-pin`.
- **REST data:** Server routes use service role + PostgREST (`api/_lib/auth.js`, `api/farms.js`, `api/user/language.js`).

**Public IP lookup (diagnostics):**
- **`https://api.ipify.org?format=json`** — Used by `api/whoami.js` to expose egress IP for firewall allowlisting (no auth by design — see file header comments).

**Fonts:**
- **Google Fonts** — `fonts.googleapis.com` / `fonts.gstatic.com` linked from HTML shells (e.g. `index.html`).

**HQ web app (human):**
- **`js/nav-role-device.js`** — Opens `https://vieforce-hq.vercel.app` in new window for manager navigation (not an API integration).

## Data Storage

**Databases:**
- **Supabase Postgres** — Primary app data; accessed via REST with **`SUPABASE_SERVICE_ROLE_KEY`** from Vercel functions and **`SUPABASE_ANON_KEY`** in browser (`config.js` → `js/supabase.js`).
- **SAP B1 (MSSQL)** — **Not accessed from Patrol.** Access path: Patrol → **HQ Cloud Run** → MSSQL (`api/sap/README.md`).

**File Storage:**
- **Local / static assets** — `icons/`, `css/`, PWA `manifest.json`; no R2/S3 client in-repo.

**Caching:**
- **In-memory session cache** — `api/_lib/auth.js` (`verifySession`, ~30s TTL).
- **HTTP caching** — SAP proxy routes set cache headers per `api/sap/README.md` (e.g. `private, max-age=30`).

## Authentication & Identity

**Primary:** Supabase Auth + **`public.users`** profile rows keyed by user id.

**Session transport (SAP APIs):**
- Browser sends **`x-session-id: <uuid>`** matching `users.id`; **`verifySession()`** in `api/_lib/auth.js` validates via Supabase REST (`/rest/v1/users?...`).
- Failure responses via **`unauthorized()`** in same module.

**Google (managers):**
- Enabled/disabled checked via Supabase Auth settings endpoint — `js/auth.js` (`isGoogleProviderEnabled`).
- Domain restriction enforced in client after OAuth — `js/auth.js`.

**PIN login:**
- **Edge Function** `verify-pin` uses **`SUPABASE_SERVICE_ROLE_KEY`** in Deno env — `supabase/functions/verify-pin/index.ts`.

## Monitoring & Observability

**Error Tracking:**
- **Not integrated** in-repo (no Sentry/Datadog SDK detected).

**Logs:**
- **`console.error`** in `api/_lib/auth.js` for verification failures.

## CI/CD & Deployment

**Hosting:**
- **Vercel** — `vercel.json`; production alias `patrol.vienovo.ph`; deploy via `npm run deploy:vercel`.

**CI Pipeline:**
- **No `.github/workflows`** in repository — CI not defined as code here.

**Supabase:**
- Migrations under `supabase/migrations/`; CLI scripts in `package.json` (`sb:push`, etc.).

## Environment Configuration

**Required env vars (Vercel production — names only):**
- `HQ_SERVICE_TOKEN`
- `HQ_API_BASE_URL` or `HQ_API_BASE` (optional if default HQ host is acceptable)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Secrets location:**
- **Vercel** — Project Environment Variables.
- **Supabase Dashboard** — Edge Function secrets; Auth provider keys (Google); DB keys.

## Webhooks & Callbacks

**Incoming:**
- **None implemented** under `api/` (no webhook routes). OAuth uses Supabase hosted redirect to **`/index.html`** with `?code=` PKCE exchange — `js/auth.js` (`maybeHandleGoogleLoginOnLoad`).

**Outgoing:**
- Patrol serverless **GET** requests only to **HQ** (`api/_lib/hq-client.js`) and **Supabase REST**; no user-configured outbound webhooks in code.

---

## Key file index (integrations)

| Concern | Path |
|---------|------|
| HQ HTTP client | `api/_lib/hq-client.js` |
| Session verification | `api/_lib/auth.js` |
| Scope / role helpers | `api/_lib/scope.js` |
| SAP proxy README | `api/sap/README.md` |
| Farms REST | `api/farms.js` |
| User language | `api/user/language.js` |
| Admin SAP reps | `api/admin/sap-reps.js` |
| Deploy metadata / egress IP | `api/whoami.js` |
| Health | `api/health.js` |
| Browser Supabase init | `js/supabase.js`, `config.js` |
| OAuth + PIN auth flows | `js/auth.js` |
| PIN Edge Function | `supabase/functions/verify-pin/index.ts` |
| Store–SAP matcher (Node, Supabase JS) | `server/services/store-sap-matcher.js` |

---

*Integration audit: 2026-05-04*

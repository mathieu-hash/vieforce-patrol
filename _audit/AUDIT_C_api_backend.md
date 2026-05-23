# Audit C — API / Backend

**Date:** 2026-05-21
**Auditor:** Agent C (read-only)
**Scope:** `api/**`, `server/services/**`, `supabase/functions/**`, `supabase/migrations/**`, `supabase/schema.sql`, root `migrations/**`, `vercel.json`
**Out of scope:** browser JS, CSS/HTML, tests, RLS-enforcement deep-check (flagged for Agent F).

---

## Summary

- **Endpoint count:** **14** total
  - Vercel serverless: **13** (`api/health.js`, `api/whoami.js`, `api/farms.js`, `api/user/language.js`, `api/admin/org.js`, `api/admin/sap-reps.js`, `api/sap/sales.js`, `api/sap/sales/all.js`, `api/sap/ar.js`, `api/sap/customers.js`, `api/sap/customer/[cardcode].js`, `api/sap/inventory.js`, `api/sap/speed.js`)
  - Supabase Edge: **1** (`verify-pin`)
- Internal `server/services/store-sap-matcher.js` is not Vercel-routed; imported as a library.
- **Findings:** **P0=4, P1=9, P2=6, P3=3** (22 total)

### Top 3 must-fix risks

1. **P0 — PINs are stored in plaintext** in `public.users.pin_hash`. `supabase/functions/verify-pin/index.ts:183` does a direct string compare `user.pin_hash === pin`. Schema seed (`schema.sql:128–133`, `sprint-a-test-accounts.sql`) inserts literal `'1234'`. Any DB read (anon RLS on `users` is `USING (true)` — line 150) leaks every TSR's PIN. This is the single largest exposure in the repo.
2. **P0 — `public.users` SELECT RLS is `USING (true)` for `anon`** (`schema.sql:148–151`). Combined with item 1, the anon Supabase key (which is published in `config.js:4` and lands in the static bundle) can `SELECT id, phone, name, role, pin_hash, email, sap_slpcode, manager_id, …` for every user, with no auth. Even excluding `pin_hash`, this is a directory dump (PII + org tree). The schema comment acknowledges this is for the login flow — but login goes through `verify-pin`, not anon select, so the policy can be tightened.
3. **P0 — `x-session-id` is a bearer-equivalent UUID with no signature, no expiry, no rotation.** `api/_lib/auth.js:22–67` looks up the user by raw UUID. Any attacker who learns a user's UUID (URL log, support screenshot, JS console, browser storage, network capture) is that user forever. There is no link to the original PIN-verify or Google-OAuth session. Even `users.is_active=false` only blocks new resolves — `auth.js:31` returns a cached user for up to 30s after deactivation. The session model is acknowledged as pilot-grade in `SESSION_HANDOFF_2026-05-21-complete.md:559` but the actual security implication is P0 for any production use.

---

## Endpoint surface

| Path | Method | Auth required | Role gate | Downstream | Notes |
|------|--------|---------------|-----------|------------|-------|
| `GET /api/health` | any | **NONE** | none | none | Returns version + timestamp. Safe. Method check missing (accepts POST etc.) |
| `GET /api/whoami` | any | gated by `PATROL_WHOAMI_KEY` query param in prod; **OPEN in non-prod** | none | `api.ipify.org` | Method check missing. Diagnostic only. |
| `POST /api/farms` | x-session-id | none beyond authenticated user | Supabase REST (service role) → `farms` table | Server creates farm; sets `created_by=user.id` from session. No role gate — any authenticated user (incl. TSR) can write. |
| `PATCH/POST /api/user/language` | x-session-id | self only (uses session user.id) | Supabase REST (service role) → `users.language` | OK. Inputs whitelisted to `en|tl|ceb`. |
| `GET /api/admin/org` | x-session-id | **`ceo\|admin\|evp\|marketing`** (via `assertUserAdmin`) | Supabase REST (service role) → `patrol_org_*`, `users` | Good. Returns org tree + counts. |
| `POST /api/admin/org` | x-session-id | **`ceo\|admin\|evp\|marketing`** | Supabase REST + HQ proxy (sync_sap) | Actions: `sync_sap, territory_*, region_update, district_update`. Good gate. |
| `GET /api/admin/sap-reps` | x-session-id | **`ceo\|admin\|evp\|marketing`** (duplicated set, not shared) | HQ Cloud Run `/api/admin/sap-reps` | Role set duplicated from `_lib/user-admin.js`. |
| `GET /api/sap/sales` | x-session-id | **any active user** | HQ `/api/sales` | scope=user:<uuid> at HQ. Margins stripped. |
| `GET /api/sap/sales/all` | x-session-id | any active user | HQ `/api/sales?include=whitespace,at_risk` | Re-shapes payload. Does NOT call `stripMarginsIfNeeded` (see P1-3). |
| `GET /api/sap/ar` | x-session-id | any active user | HQ `/api/ar` | OK. |
| `GET /api/sap/customers` | x-session-id | any active user | HQ `/api/customers` | OK. |
| `GET /api/sap/customer/:cardcode` | x-session-id | any active user (scope at HQ) | HQ `/api/customer?id=` | OK. cardcode length-capped at 64. |
| `GET /api/sap/inventory` | x-session-id | any active user | HQ `/api/inventory` | National pass-through. |
| `GET /api/sap/speed` | x-session-id | any active user | HQ `/api/speed` | OK. |
| Edge `POST verify-pin` | none (public) | none | Supabase REST (service role) → `users` | Rate-limited 5/15min, brute-force delay >=3 attempts. PIN compared plaintext. |

**Missing endpoints implied by other code:** none observed.

**Rate limiting:** Only `verify-pin` is rate-limited. Every other endpoint (incl. `/api/sap/*`, `/api/admin/*`, `/api/farms`) has **zero** Patrol-side rate-limiting. Relies on HQ-side limits which are not visible from this repo.

---

## Findings

### P0 — Critical

**P0-1 — PINs stored as plaintext** [secret leak / auth]
- File: `supabase/functions/verify-pin/index.ts:181–183`, `supabase/schema.sql:128–133`, `supabase/migrations/sprint-a-test-accounts.sql:1–23`, `supabase/migrations/20260428130000_seed_windel_demo_team.sql:34–38`
- What: Despite the column name `pin_hash`, the value is the literal 4–6 digit PIN. Comment on line 181: *"Plaintext PIN only (pin_hash column = digits as stored by admin / seeds). Legacy bcrypt values will not match — reset PIN in Sales Admin once."* This is a deliberate regression.
- Combined with the `users` RLS read-all (P0-2), this means a leaked anon Supabase key (already public in `config.js`) gives every field PIN.
- Fix: Re-introduce bcrypt or argon2 hashing in `verify-pin`. Add a migration that rehashes existing PINs and a one-shot UI to reset legacy users. Restrict `users` SELECT before flipping the algorithm. Effort: **M (1–2 days)** — non-trivial because admin tools (`admin.html` user-create) currently send plaintext.

**P0-2 — `users` SELECT RLS is wide open to anon** [PII / data leakage / RLS]
- File: `supabase/schema.sql:148–151`
- What: `CREATE POLICY "Users read own record" ON public.users FOR SELECT USING (true);` — any caller with the anon key can read every user row including `pin_hash`, `phone`, `email`, `role`, `sap_slpcode`, `manager_id`.
- The comment ("Allow read for login flow") is wrong — `verify-pin` uses the service role and does not need anon SELECT.
- Schema also acknowledges defer in `sprint-a-phase3-rls-align.sql:60–62`.
- Fix: Replace with `USING (auth.uid()::text = id::text)` once Patrol is on Supabase Auth, or with a `false` policy and route all `users` reads through `/api/admin/*` and `/api/whoami`-style server endpoints. Effort: **L** (touches many JS files including leaderboard / champion-team widgets per the migration comment).

**P0-3 — `x-session-id` is an unauthenticated bearer-equivalent** [auth]
- File: `api/_lib/auth.js:22–67`, every `api/sap/*.js`, `api/farms.js`, `api/user/language.js`, `api/admin/*.js`
- What: Session = raw `users.id` UUID. No HMAC, no expiry, no rotation, no binding to the original PIN/OAuth login. The 30-second cache (`SESSION_TTL_MS`, line 9) means a deactivated user keeps API access for up to 30s after deactivation on every Vercel cold instance.
- For `/api/admin/*` the cache is correctly bypassed (`_isAdminApiRoute`, lines 13–20) but SAP/farm/language reads keep the cache.
- Fix: Replace with signed JWT (HS256 with `JWT_SECRET` already declared in `CLAUDE.md:146` env block). Issue from `verify-pin` and a Google-OAuth exchange endpoint. Verify on every request. Effort: **L (2–3 days)** but unblocks production-grade auth.

**P0-4 — `/api/sap/sales/all` skips margin-stripping** [policy violation]
- File: `api/sap/sales/all.js:13, 36–73`
- What: Imports `wrapPatrolMeta` but NOT `stripMarginsIfNeeded`. The HQ response is re-shaped by hand: `total_bags`, `by_brand[]`, `by_customer[]`, `whitespace[]`, `at_risk[]`. The hand-mapping only picks `volume_bags`, but it then passes the *entire HQ `body.scope`* and untouched `body.whitespace` / `body.at_risk` arrays into `wrapPatrolMeta` — which could carry `gm_per_bag` / `gm_ton` / `gross_profit` fields that HQ adds to those subobjects.
- The README (`api/sap/README.md:120–129`) is explicit: "Every role … gets these keys deleted recursively across the entire response." This endpoint violates that contract.
- Fix: One-line change — wrap the result object in `stripMarginsIfNeeded(...)` before `wrapPatrolMeta(...)`. Effort: **XS (5 min)** + unit test.

### P1 — Robustness / Bug

**P1-1 — SAP/admin endpoints accept arbitrary HTTP methods** [robustness]
- Files: `api/sap/*.js` (all 7), `api/health.js`, `api/whoami.js`
- What: No `if (req.method !== 'GET') return 405;` check. A POST/PUT to `/api/sap/sales` is silently treated as GET. Doesn't open a vulnerability today but masks client bugs and may break under proxy/cache misbehavior.
- Fix: Add 405 guard. Effort: **XS** (one line per file).

**P1-2 — `/api/sap/*` endpoints do not call `applyPatrolCors`** [robustness / cross-surface inconsistency]
- Files: `api/sap/sales.js`, `api/sap/sales/all.js`, `api/sap/ar.js`, `api/sap/customers.js`, `api/sap/customer/[cardcode].js`, `api/sap/inventory.js`, `api/sap/speed.js`
- What: Admin + user + farms endpoints use `applyPatrolCors`; SAP endpoints don't. Today they work because the browser calls them same-origin from `vieforce-patrol.vercel.app` / `patrol.vienovo.ph`, but the inconsistency means any future cross-origin embedding (HQ deep-link, alternate domain) will silently break, and there's no preflight handler.
- Fix: Add `applyPatrolCors(req, res, 'GET, OPTIONS')` and the OPTIONS short-circuit to each handler. Effort: **S** (7 files).

**P1-3 — `api/farms.js` has no role gate** [authorization gap]
- File: `api/farms.js:25–58`
- What: Any authenticated user — including a logged-in TSR — can POST a farm. There is no check that the user is `tsr|dsm|rsm|exec|admin|champion` or scope-limited. `created_by` is set from session, but anyone can spam-create farms. Also no input length caps on `name`, `owner_name`, `phone`, `breed`, `feed_partner` — Supabase column is `text` unbounded.
- Fix: Add role allowlist + length caps. Effort: **S**.

**P1-4 — `api/farms.js` swallows non-OK upstream as a generic 500-equivalent** [robustness]
- File: `api/farms.js:48–53`
- What: Forwards Supabase's `status` upstream but returns a `detail` field that may include Supabase internal hints (PostgREST hint, position, column names). For unsanitized field validation errors this is fine; for RLS violations it could leak the policy expression.
- Fix: Map known Supabase status codes (409 / 403 / 400) and discard `detail.hint`. Effort: **XS**.

**P1-5 — `api/_lib/auth.js` session cache may serve deactivated users** [security/freshness]
- File: `api/_lib/auth.js:8–9, 30–32`
- What: 30s positive cache. If admin sets `is_active=false`, the user still has API access for up to 30s on that Vercel instance.
- Mitigation in place: admin routes bypass cache (line 26). SAP / farms / language do not.
- Fix: Either drop the cache (Supabase lookups are <50ms) or cache only the negative answer. Effort: **XS**.

**P1-6 — `req.body` is not defensively JSON-parsed in `api/farms.js`** [robustness]
- File: `api/farms.js:34`
- What: Vercel only auto-parses `application/json`. A request with a different content-type or a non-Vercel runtime (local Express harness) gets `req.body === undefined`. `cleanFarmPayload` then receives undefined → empty payload → 400. Same defensive parse exists in `api/admin/org.js:175–181` but is missing here.
- Fix: Mirror the `try { body = JSON.parse(req.body || '{}'); }` pattern. Effort: **XS**.

**P1-7 — Schema drift: `users.sap_slpcode`, `sap_district_code`, `district_label` referenced but never migrated** [schema drift]
- Files: `api/_lib/auth.js:41`, `api/_lib/org-sync.js:99–101, 117–125`, `js/admin-users-sap.js:92`, and docs (`SESSION_HANDOFF_2026-04-18-evening.md:34`, `PATROL-SESSION-RESUME-2026-05-03.md:35–37`, `api/sap/README.md:77`)
- What: No file in `supabase/migrations/` adds these three columns. Production must have them (handoff confirms they are set per user) but the migration that created them is missing from this repo. New environments built from the migrations will fail at `api/_lib/auth.js:41` (PostgREST returns 400 "column users.sap_slpcode does not exist").
- Fix: Add a migration `20260xxxxxxxxx_users_sap_mapping.sql` with `ALTER TABLE users ADD COLUMN IF NOT EXISTS sap_slpcode int / sap_district_code int / district_label text;`. Effort: **XS** (writing) but **must verify against prod first**.

**P1-8 — Schema drift: `supabase/schema.sql` is stale** [schema drift]
- File: `supabase/schema.sql`
- What: Doesn't include `is_champion` (added inline 124–125 but role list still missing `champion`, `ceo`, `evp`, `marketing`, `director`, `president`), `manager_id`, `auth_type`, `email`, `language`, store SAP-mapping columns, lifecycle columns, `patrol_org_*`, `sap_accounts`, `store_sap_matches`. Confirmed by handoff (`CONCERNS.md` reference at SESSION_HANDOFF:584).
- Fix: Either delete `schema.sql` (since migrations are source of truth) or regenerate it via `pg_dump --schema-only` after a clean migration run. Effort: **S**.

**P1-9 — RLS policies are conditioned on `auth.uid()` but Patrol does not use Supabase Auth for TSR PIN sessions** [RLS broken-by-design / for Agent F]
- File: `supabase/schema.sql:140–227`, `supabase/migrations/sprint-a-phase3-rls-align.sql`, `supabase/migrations/sprint-b-patrol-hub.sql:67–101`
- What: Every policy uses `auth.uid()::text = …`. PIN-authenticated TSRs use the anon key; `auth.uid()` is NULL for them. So policies evaluate to: `NULL = id` (false) OR `EXISTS(... NULL = id ...)` (false) → all TSR client-side reads through the anon key fail RLS — *unless the policy itself is bypassed by service-role calls*. The fact that browser data still loads strongly suggests either (a) RLS is silently disabled on those tables in prod, or (b) all browser reads now go through service-role server endpoints (some do — farms, language, admin — but not stores/visits per `db.js` per the docs).
- Cross-link: this is exactly Agent F's territory; flagging for depth-check.
- Fix: Confirm runtime state via `select tablename, rowsecurity from pg_tables where schemaname='public';` and align. Effort: **L** (architectural).

### P2 — Quality / Latent

**P2-1 — Role allow-list duplicated in two places** [maintainability]
- Files: `api/_lib/user-admin.js:3` defines `USER_ADMIN_ROLES = ['ceo', 'admin', 'evp', 'marketing']`. `api/admin/sap-reps.js:10` redefines the same set inline. They will drift.
- Fix: Import the helper. Effort: **XS**.

**P2-2 — Missing index on `visits.visited_at desc` exists but `visits.synced_at` and `assigned_tsr` patterns may be slow** [DB perf]
- File: `supabase/schema.sql:88–90`
- What: `visits_date_idx ON visited_at desc` exists; good. However filters by `tsr_id + visited_at` would prefer a compound `(tsr_id, visited_at desc)` index for DSM dashboards.
- Fix: Add `create index visits_tsr_date_idx on visits(tsr_id, visited_at desc);` if profile shows slow scans.
- Effort: **XS**.

**P2-3 — No index on `users.manager_id` only — exists already via `sprint-a-hierarchy.sql:18`** — false alarm, drop.

**P2-3 — `farms.assigned_tsr` index exists; `stores.assigned_tsr` exists; OK.**

**P2-4 — `store_products.product_group` and `store_competitors.product_group` lack indexes** [DB perf]
- Likely fine until product-mix dashboards arrive. Defer.

**P2-5 — Rate-limit storage is in-process memory** [scalability]
- File: `supabase/functions/verify-pin/index.ts:39, 47–88`
- What: Each Edge Function instance has its own `Map`. An attacker hitting 5 different instances gets 25 attempts. Supabase Edge Functions can scale to many instances. Brute-force protection is effectively weakened by N.
- Fix: Use a Supabase table or Redis. Effort: **M**.

**P2-6 — `verify-pin` returns generic `Server error` 500 with no correlation ID** [observability]
- File: `supabase/functions/verify-pin/index.ts:216–222`
- What: Hard to trace user-reported login failures back to a specific server error. Console.log includes timestamp but not a request id.
- Fix: Add a short request id. Effort: **XS**.

**P2-7 — `api/whoami.js` has gating but `egress_ip` call to `ipify` is unauthenticated and time-bounded only to 4s** [robustness]
- File: `api/whoami.js:42–52`
- What: If `ipify` is down, returns 502. Not security-critical; just noise.
- Fix: Could be defaulted to "unknown". Effort: **XS**.

### P3 — Nice to have

**P3-1 — `api/health.js` exposes hard-coded "version: '3.0'"** which is stale (package.json says `3.1.0-beta.1`). Cosmetic.

**P3-2 — Default Supabase URL hardcoded as fallback in 3 files** (`api/_lib/auth.js:5`, `api/_lib/supabase-service.js:3`, `api/farms.js:4`, `api/user/language.js:9`, `verify-pin/index.ts:47`). Not a secret but encodes the prod project ref in the source tree. If you ever build a second environment from the same repo without setting env vars, you'd silently hit prod. Centralise to one helper. Effort: **XS**.

**P3-3 — `_lib/sales-queries.js` is not imported anywhere in `api/`** (grepped). Dead code — was used by the pre-Phase D direct-MSSQL `sales/by-customer` / `whitespace` / `at-risk` endpoints documented in `api/sap/README.md:104–117` but those endpoints don't exist in the repo. README is stale.

---

## Schema / migration concerns

- **Missing migration for `users.sap_slpcode / sap_district_code / district_label`** — production has them, repo does not. New env will break (see P1-7).
- **`supabase/schema.sql` is stale** — does not reflect current schema (see P1-8). Either delete it or regenerate from pg_dump.
- **RLS policies use `auth.uid()` while sessions are PIN-based via Edge function** — operationally inert because Patrol uses the service role for server reads, but it means RLS is effectively disabled for direct browser reads via the anon key (see P1-9).
- **Demo / test PINs hardcoded as `1234`** in `sprint-a-test-accounts.sql` and `20260428130000_seed_windel_demo_team.sql`. These are committed to git. If applied to prod, these accounts are trivially compromised.
- **`patrol_org_*` RLS enabled but no policies declared** (`20260518120000_patrol_org_master.sql:48–50`). All anon reads will be denied — fine because the API uses service role. Just noting for completeness.
- **`sap_accounts` policies condition on `auth.uid()`** (same issue as P1-9) — broken for PIN sessions; only service-role reads work.
- **No FK on `visits.offline_id`** but `unique` exists; good.
- **`stores.assigned_tsr`, `farms.assigned_tsr`, `users.manager_id`, `patrol_org_districts.region_id`, `patrol_org_territories.district_id`** all have indexes. **Hot-column index coverage is good.**
- **No partial indexes on `is_active=true` for `users` / `stores`** — minor perf opportunity.

---

## Secret hygiene scorecard

| Check | Result | Evidence |
|---|---|---|
| Service role key client-exposed | **PASS** | `SUPABASE_SERVICE_ROLE_KEY` only read in `api/_lib/auth.js:6`, `api/_lib/supabase-service.js:3`, `api/farms.js:5`, `api/user/language.js:10`, `verify-pin/index.ts:49`, `server/services/store-sap-matcher.js:28`. None of these are browser-bundled (all in `api/` or Edge or `server/`). |
| HQ_SERVICE_TOKEN client-exposed | **PASS** | Read only in `api/_lib/hq-client.js:39`. The user-facing string in `js/sales-tab.js:594` is help text mentioning the variable name, not a value. |
| Hardcoded keys | **PARTIAL PASS** | Only the public Supabase **anon** JWT in `config.js:4` — by design, browser-safe. No service role / HQ token / SAP DB password in source. Supabase URL hard-coded as default in 5 places (P3-2) but not secret. |
| console.log of secrets | **PASS** | Only `console.error('[auth] SUPABASE_SERVICE_ROLE_KEY missing — cannot verify session')` in `api/_lib/auth.js:35` — logs the *name*, not the value. `verify-pin` logs phone and attempt count but not PIN. No log of HQ token or service key value found. |
| Test fixtures with real keys | **PASS** | `tests/unit/hq-client.test.js` referenced but uses env vars; not inspected here (out of scope per audit charter — Agent E). |
| `.env*` committed | unchecked here — Agent F to verify |

**Operational note:** The repo seed files (`schema.sql:128`, `sprint-a-test-accounts.sql`, `20260428130000_seed_windel_demo_team.sql`) commit plaintext PIN `'1234'`. This is git-committed credential material if those seeds were ever applied to a public/staging environment. Treat as P0-1 sub-finding.

---

## CORS / headers / vercel.json

### `vercel.json`

```json
{
  "alias": ["patrol.vienovo.ph"],
  "rewrites": [{ "source": "/(.*)", "destination": "/$1" }],
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" }
    ]},
    { "source": "/sw.js", "headers": [
      { "key": "Cache-Control", "value": "no-store, max-age=0" },
      { "key": "Service-Worker-Allowed", "value": "/" }
    ]}
  ]
}
```

**Gaps (P1/P2):**
- **No `Strict-Transport-Security`** header. P1 — Vercel terminates TLS but the app should advertise HSTS for `patrol.vienovo.ph`. Recommend `max-age=31536000; includeSubDomains; preload`.
- **No `Content-Security-Policy`** header. P1 — given the static-HTML/vanilla-JS surface there are no inline scripts to break; a strict CSP is feasible (`default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co https://patrol-api-* https://vieforce-hq-api-*; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`).
- **No `Referrer-Policy`** (recommended `strict-origin-when-cross-origin`).
- **No `Permissions-Policy`** (camera/geolocation are used — should be scoped to self).
- **`X-Frame-Options: DENY`** is good; `frame-ancestors 'none'` in CSP would be the modern equivalent.
- **`Cache-Control` per-endpoint** is set in handlers (`private, max-age=30/60, no-store`). Consistent and correct.

### CORS (`api/_lib/patrol-cors.js`)

- Reflective allow-list. Default origins: prod (`https://vieforce-patrol.vercel.app`, `https://patrol.vienovo.ph`) + localhost dev. Env-extensible via `PATROL_CORS_ORIGINS`. **No wildcard.** **Good.**
- Edge `verify-pin` mirrors the same allow-list (`index.ts:5–22`). Good.
- **Inconsistency:** All `api/sap/*` endpoints do NOT use `applyPatrolCors` (P1-2). They rely on Vercel's default same-origin assumption. This silently breaks any future cross-origin call.

---

## Endpoint-level error-handling audit

All 7 SAP proxy endpoints have consistent try-via-`callHqProxy` (which has its own try/catch + timeout) → status mapping → 401/502/504 fallback. **Good.**

- `farms.js` — single `await fetch(...)` with no try/catch around it. If Supabase REST throws (network failure), the function crashes with a Vercel `FUNCTION_INVOCATION_FAILED` 500. **P1-10 (added):** wrap in try/catch and return 502.
- `language.js` — same issue.
- `admin/org.js` — multiple internal `sbGet/sbPost/sbPatch/sbDelete` calls in `loadOrgTree` and `upsertOrgFromSap`. Each helper catches non-OK responses, but un-thrown exceptions from `fetch` itself are uncaught. Would crash the handler.
- `whoami.js` — has try/catch around ipify fetch (line 42–53). Good.
- `verify-pin` — wraps the body in try/catch (line 123, 216). Good.
- `store-sap-matcher.js` — throws on Supabase errors; the function importing it must catch. Since it's not Vercel-routed, this depends on callers (out of scope — likely a future `api/` endpoint).

**P1-10 — Missing try/catch around `fetch()` in `farms.js`, `user/language.js`, and `admin/org.js`'s `_lib/supabase-service.js` helpers.** Effort: **S** (wrap each fetch call in `try { await fetch(...) } catch (e) { return 502 }`).

---

## Notes for adjacent agents

- **Agent F (RLS):** P0-2, P1-9, and the `sap_accounts` policy are your territory. The fact that PIN-session browser reads through the anon Supabase client appear to "work" strongly suggests RLS is either disabled at runtime or all client reads of `stores`/`visits` actually go via service-role endpoints. Verify in prod.
- **Agent A (js/):** The anon key in `config.js:4` is unavoidable for direct Supabase browser calls. Confirm no service-role key landed there.
- **Agent E (tests):** Confirm `tests/unit/sap-sales-all.test.js` does not assert that margin keys survive — that would memorialise the P0-4 bug.

---

*End of Audit C.*

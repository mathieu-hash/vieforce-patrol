# Audit F — Auth + Security

**Scope:** auth flow (PIN + Google OAuth), role gating, Supabase RLS, secret exposure, headers/CSP, leaderboard hiya, margin stripping, XSS/SQLi, sessions, audit logging, photo storage.
**Mode:** READ-ONLY.
**Date:** 2026-05-21.
**Branch:** master.

## Summary

- Findings: **P0 = 6, P1 = 7, P2 = 5, P3 = 2**
- Top 3 critical risks:
  1. **P0 — PINs stored as plaintext + readable by anyone with the anon key.** `users.pin_hash` is plaintext digits (`verify-pin/index.ts:183`), the column is fetched by `js/db.js:399` over the anon client, and the RLS policy on `public.users` is `FOR SELECT USING (true)` (`supabase/schema.sql:150`). Anyone with the public anon JWT can dump every user's phone + PIN with one PostgREST call. This is a complete auth bypass for every field worker + manager who uses PIN.
  2. **P0 — Session token is just the user's UUID, no signing/expiry server-side.** `api/_lib/auth.js:22` accepts `x-session-id` as a raw UUID, looks it up in `public.users.id`. Any leaked/guessed UUID grants the holder that user's full server permissions until `is_active=false`. There is no JWT, HMAC, rotation, revocation, or even password binding. H-04 from the autopsy is acknowledged but unfixed.
  3. **P0 — `users` table SELECT RLS is `USING(true)` and `auth.uid()`-based policies are vacuous for TSRs.** TSR PIN login never establishes a Supabase Auth session (`js/supabase.js:2`), so `auth.uid()` is NULL for them. Combined with the anon-readable users row, the TSR can use the anon client to read the whole directory + every PIN. Every other RLS policy that depends on `auth.uid()` (`stores`, `visits`, `farms`, `sap_accounts`) silently degrades to deny — meaning real enforcement happens only in the Vercel API proxy, never in Supabase.

## Auth flow scorecard

| Check | Result |
|---|---|
| PIN brute-force protected (per-phone rate limit) | **PASS** (`verify-pin/index.ts:42-80` — 5 attempts / 15 min, +2s delay after 3 failures, in-memory only) |
| PIN bcrypt + timing-safe compare | **FAIL** — plaintext compare `user.pin_hash === pin` (`verify-pin/index.ts:183`), no bcrypt, no constant-time compare |
| OAuth domain lock server-enforced | **PARTIAL** — re-checked server-side in `auth.js:438` (`email.endsWith('@vienovo.ph')`) but that check runs on the browser, not in an Edge Function. There is no DB constraint or server-side validation that the `users.email` row matches the Google identity beyond the client trusting Supabase Auth session. PASS only because Supabase Auth issues the JWT — but post-OAuth role lookup happens with the anon client. |
| Manager email-match check enforced | **PARTIAL** — `getManagerUserByEmail()` (`js/auth.js:218`) runs client-side with anon key. RLS `USING(true)` on users means a hostile script could query any email's row, but the official manager-allowed list is gated by `isManagerRole()` at line 467. Empty email → no row matched → blocked, as PRODUCT.md claims. |
| Server-side role gate on `/api/admin/*` | **PASS** — `assertUserAdmin()` enforced (`api/_lib/user-admin.js:5`). Both admin/org.js and admin/sap-reps.js gate on roles `ceo \| admin \| evp \| marketing`. |
| Server-side role gate on `/api/sap/*` | **PARTIAL** — `verifySession()` is enforced but no role check; sap proxy strips margins for everyone (good defence-in-depth at `api/_lib/scope.js:39`). Scope filtering is delegated to HQ via `scope=user:<uuid>` querystring (`hq-client.js:54`). HQ is implicitly trusted. |

## RLS coverage

| Table | RLS enabled | Policies cover SELECT/INSERT/UPDATE/DELETE | Critical issue |
|---|---|---|---|
| `users` | ✅ | SELECT: `USING(true)` — **wide open**; ALL for admins | **P0 — anyone with anon key reads all rows incl. `pin_hash`** |
| `stores` | ✅ | SELECT + INSERT + UPDATE; no DELETE policy (RLS denies by default — OK) | `auth.uid()` based — useless for TSR session; relies on API proxy |
| `store_products` | ✅ | `FOR ALL USING EXISTS(stores)` — passthrough; effectively unrestricted if any store row passes | P2 — over-broad |
| `store_competitors` | ✅ | same as above | P2 |
| `visits` | ✅ | SELECT + INSERT (`auth.uid()` based) | Same auth.uid() gap |
| `farms` | ✅ | SELECT + INSERT + UPDATE (`auth.uid()` based) | Same auth.uid() gap |
| `patrol_org_regions/districts/territories` | ✅ | RLS enabled, **no anon policies** → service-role only via API proxy | PASS (intentional) |
| `sap_accounts` | ✅ | `auth.uid()` based per-role | Same auth.uid() gap; in practice TSR cannot read because their session has no auth.uid → deny |
| `store_sap_matches` | unknown | not inspected | — |

Notes from `sprint-a-phase3-rls-align.sql:59` confirms maintainers know the users table is wide open and call it H-05 — explicitly deferred.

## Secret-exposure scan

- **Service role in browser bundle:** **PASS** — only references in `api/_lib/*` (server) + one user-facing string mentioning the env var name in `js/sales-tab.js:594` (string, not key). No JWT secret-role tokens in `js/`, `*.html`, or `config.js`.
- **HQ_SERVICE_TOKEN in browser bundle:** **PASS** — only used in `api/_lib/hq-client.js:39` server-side.
- **Hardcoded keys:** **PASS for service-tier secrets**; **`config.js:4` ships the Supabase anon JWT (anon role)** — acceptable per Supabase model AND per CLAUDE.md (anon OK in browser). However this anon key combined with RLS `USING(true)` on users is what makes the P0 above weaponizable.
- **Service role + SUPABASE_URL default hardcoded** at `api/_lib/auth.js:5` and `api/farms.js:4` — falls back to a literal project URL string (not a secret, but tightly couples deploy to one project).

## Headers / CSP (vercel.json)

- CSP set: **NO**
- HSTS (Strict-Transport-Security): **NO**
- X-Frame-Options: **YES** (`DENY` — good)
- X-Content-Type-Options: **YES** (`nosniff`)
- Referrer-Policy: **NO**
- Permissions-Policy: **NO**
- COOP/COEP: **NO**

## Leaderboard hiya compliance

- TSR-facing leaderboard exposes only top-N: **PASS** — `js/home-tsr.js` has no leaderboard render; TSR scope helper `js/role-scope.js:62` returns `canSeeLeaderboard() = false` for TSR/champion.
- DSM endpoint returns low-rank data: **PASS (data confined to DSM role)** — `dashboard.js:_renderLeaderboardCard` slices top 10 visible to DSM only. Score sort in `scorecard.js:208` is used for DSM drill-down, not exposed to TSRs.
- Margin stripping on `/api/sap/*` returns: **PASS** — `stripMarginsDeep()` removes 17 margin keys for every role unconditionally (`api/_lib/scope.js:39-65`). Margins only viewable via HQ desktop.

## Findings

| # | Sev | File:line | What | Fix | Effort |
|---|---|---|---|---|---|
| F-01 | **P0** | `supabase/functions/verify-pin/index.ts:183`, `supabase/schema.sql:128-133` (seed) | PINs stored and compared as plaintext. Comment at line 181 acknowledges legacy bcrypt was removed. | Re-introduce bcrypt (cost 10), store hash + salt, use `timingSafeEqual`; migrate existing PINs by forcing reset on next login or hashing in place. Update admin.js `pin_hash: pin` writes to call a hashing endpoint. | 6h |
| F-02 | **P0** | `supabase/schema.sql:148-151` + `sprint-a-phase3-rls-align.sql:59` (H-05 known-debt) | `users` SELECT RLS `USING(true)` allows anon-key dump of full user table including `pin_hash`. | Replace with `USING (auth.uid() = id OR EXISTS … manager)`; remove `pin_hash` from any policy that exposes columns — better, drop `pin_hash` from the column-grant for the `anon` role entirely (`REVOKE pin_hash`). Also stop selecting `pin_hash` in `js/db.js:399,420`. | 4h |
| F-03 | **P0** | `api/_lib/auth.js:22-67` + `js/auth.js:158-192` | Session "token" is just the user's UUID. No signing, no expiry server-side, no rotation. Theft of `x-session-id` = permanent compromise of that user until is_active flips. `localStorage.expiresAt` is purely client-side (H-04 from autopsy). | Migrate to Supabase Auth (custom phone+PIN sign-in via Edge Function issuing a signed JWT) or sign a JWT inside verify-pin with `JWT_SECRET` and verify it on every API call. Add expiry < 24h, refresh path, revoke list on logout. | 12-16h |
| F-04 | **P0** | `vercel.json:4-11` | No CSP. With inline scripts everywhere in app.html / admin.html and many `innerHTML` writes (133 occurrences across 23 files), a single sanitization bug becomes drive-by code execution against an admin's session-id in localStorage. | Add `Content-Security-Policy` (start with report-only): `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com 'unsafe-inline' …; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://*.run.app; frame-ancestors 'none'`. Iterate based on reports. | 4h initial + iteration |
| F-05 | **P0** | `vercel.json:4-11` | No `Strict-Transport-Security` header. Vercel terminates TLS but a custom domain (`patrol.vienovo.ph`) without HSTS leaves first-visit MITM downgrade window. | Add `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`. | 15 min |
| F-06 | **P0** | `js/auth.js:218-234` (`getManagerUserByEmail`) | Manager role + email validation done client-side using anon client. A hostile script in the browser could call `signInWithOAuth` with a personal Google account, then directly write to localStorage faking a manager session, then call `/api/admin/*` with `x-session-id` pointing at any UUID it can read (since users table is wide open). | Move the entire post-OAuth resolution server-side: dedicated `/api/auth/google` endpoint that takes the Supabase access token, verifies it with service key, looks up the manager row, and issues a signed Patrol session token. Don't rely on browser code to gate roles. | 8h |
| F-07 | **P1** | `verify-pin/index.ts:39-44` | Rate limit is in-memory per Edge Function instance — Supabase Edge Functions are stateless and may spawn many concurrent instances, so the 5/15-min cap is per-instance, not global. A determined attacker hitting in parallel gets effectively unlimited tries. | Move attempt counter to a Postgres table (`pin_login_attempts`) or Redis with a window function; also log to a real audit table not just `console.log`. | 4h |
| F-08 | **P1** | (no file — gap) | No persistent audit log of admin actions (user create / role change / PIN reset / OAuth manager mapping). `console.log` in verify-pin gets lost. | Create `admin_audit_log(actor_id, action, target_id, before, after, ts, ip, user_agent)`. Write rows from every `/api/admin/*` mutation + every successful login. | 6h |
| F-09 | **P1** | `js/auth.js:288-296` (login fetch) | `Content-Type: text/plain` used to bypass CORS preflight — works, but combined with no Origin check inside verify-pin (only standard CORS reflective list), CSRF is mitigated only by the bearer-anon-key requirement, not by Origin enforcement on the Edge Function. | In `verify-pin/index.ts`, additionally verify `Origin` is in the allowed set before processing the body (don't rely only on browser CORS). | 1h |
| F-10 | **P1** | `api/_lib/auth.js:8-9, 30-32` | 30s positive session cache means a role downgrade or `is_active=false` takes up to 30s to propagate, EXCEPT on `/api/admin/*` (cache bypassed there — good). On other routes (sap proxy, language patch) a deactivated user keeps access for up to 30s after admin disables them. | Either drop the cache (calls are already cheap) or invalidate by writing a version counter into the users row and including it in `x-session-id`. | 2h |
| F-11 | **P1** | `api/farms.js:34-46`, `api/user/language.js:31-46` | These routes bypass the HQ proxy pattern and call Supabase REST directly with service key on behalf of the user. Fine in principle, but `cleanFarmPayload()` does no schema validation beyond cast — strings up to PostgREST limits, no length cap on `notes`, `breed`, etc. | Add max-length checks + reject unknown fields. Use a shared validator. | 3h |
| F-12 | **P1** | `js/auth.js:9` + `js/auth.js:11`, `js/db.js:*`, `vercel.json` | No logout invalidation on the server. After `logout()` clears localStorage + Supabase OAuth, the `x-session-id` UUID is still valid forever on Patrol APIs. | Maintain a `session_revoked_at` column per user and check it in `verifySession`; or move to JWT with `iat`. | 2h |
| F-13 | **P1** | `supabase/schema.sql:128-133` | Seed data ships TSR + DSM + ADMIN accounts with PIN `1234`. If schema.sql is ever re-applied to prod, real prod accounts are wiped with `on conflict (phone) do nothing`, but new envs start with weak default admin. | Move seed to a dev-only file. Pre-pilot reset all `1234` PINs. | 1h |
| F-14 | **P2** | `js/camera.js:121-133` | Storage bucket `patrol-photos` uses `getPublicUrl` (public bucket). Visit notes + photos are then any-URL-guessable (`{tsr_id}/{date}/{ts}_{store_id}.jpg`). | Switch bucket to private + use `createSignedUrl` with 7-day expiry. Update display code to refresh signed URLs on demand. | 4h |
| F-15 | **P2** | `js`, 133× `innerHTML=` writes across 23 files | Most writes use `_esc()` (verified in `js/stores.js:540-560`), but volume is large and one regression = stored XSS on admin screens. | Audit pass — convert hot paths to `textContent` + DOM API; add CSP (F-04) as defence-in-depth. | 8h |
| F-16 | **P2** | `index.html` viewport meta (per PRODUCT.md punch list P1) | `user-scalable=no` blocks accessibility zoom — also a known indicator that auth screens haven't been hardened against tab-jacking + small-target attacks. | Remove `user-scalable=no`, raise base font-size if needed. | 1h |
| F-17 | **P2** | `api/_lib/scope.js:39` | Margin-strip key list is hard-coded; HQ schema evolution can leak new margin keys until list updated. | Invert the logic — allowlist returned columns instead of denylist. | 4h |
| F-18 | **P2** | `vercel.json` | No `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. Photo URLs in stores leak referrers to Supabase Storage. | Add `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(self)`, `COOP: same-origin`. | 30 min |
| F-19 | **P3** | `api/whoami.js` | Diagnostic endpoint behind `PATROL_WHOAMI_KEY` — fine, but leaks Vercel deployment ID + commit SHA. | Strip `commit_sha` / `deployment_id` from response. | 15 min |
| F-20 | **P3** | `js/auth.js:9` | Edge function URL hardcoded — fine, but should pull from `CONFIG` so a misrouted deployment can fail closed. | Use CONFIG.EDGE_FN_URL with default fallback. | 30 min |

## Cross-cutting recommendation

The Patrol auth model treats the Supabase anon client as a trusted reader of the `users` table. With plaintext PINs in that table, the entire field-worker auth model is compromised by the public anon JWT shipped in `config.js`. The single highest-impact change is **remove `pin_hash` from any anon-visible policy** (combined with bcrypt for F-01) — without that, every other hardening is moot.

Pilot recommendation: **DO NOT roll out to TSRs at scale** until F-01, F-02, F-03 are resolved. F-04 (CSP) and F-05 (HSTS) are 15-minute fixes that should ship today.

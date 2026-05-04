# Codebase Concerns

**Analysis Date:** 2026-05-04

## Tech Debt

**Mock / stubbed product surfaces:**
- **Issue:** Sales tab velocity and several social features are still mock-driven or console TODOs; users may see placeholder behavior.
- **Files:** `js/sales-tab.js` (MOCK_VELOCITY, TODO filter at-risk, expand sales), `js/phase4-social.js` (Phase 5+ backend TODOs, alert placeholders for profile/follow/message), `js/activity-feed.js` (MOCK_FEED), `js/rsm.js` (vet_missions placeholder for Sprint C).
- **Impact:** Feature promises in UI do not match server capabilities; support noise and trust erosion.
- **Fix approach:** Track each surface in backlog; gate UI behind flags until API exists; remove `console.log` TODOs from production paths.

**Base schema vs migrations:**
- **Issue:** `supabase/schema.sql` is not the full source of truth; role CHECK, RLS, and columns evolved in `supabase/migrations/`. A deploy that applies only `schema.sql` reproduces known failures (`exec` visibility, `champion` role).
- **Files:** `supabase/schema.sql`, `supabase/migrations/sprint-a-phase3-rls-align.sql`, `PATROL_AUTOPSY_REPORT.md` (C-02, C-03, H-06).
- **Impact:** Drift between environments; harder onboarding for DBAs.
- **Fix approach:** Rebase `schema.sql` to post-migration state *or* document a single “apply order” and stop editing base file without matching migrations.

**Documentation vs implementation (SAP path):**
- **Issue:** `api/sap/README.md` and `docs/PATROL-OPS-RUNBOOK.md` still describe direct MSSQL routes (`SAP_DB_*`, `/api/sap/sales/by-customer`, etc.) while `api/sap/sales/all.js` **proxies through HQ** via `callHqProxy` (see file header comment). `api/_lib/sales-queries.js` exists for SQL builders + unit tests but is not necessarily wired to live Vercel routes in this tree.
- **Files:** `api/sap/README.md`, `docs/PATROL-OPS-RUNBOOK.md`, `api/sap/sales/all.js`, `api/_lib/sales-queries.js`.
- **Impact:** Ops follows wrong runbook (NSG, `SAP_DB_PASS` triage) when the failure is HQ token or scope; wasted incident time.
- **Fix approach:** Update README and runbook to state current architecture; move legacy direct-SAP section to “deprecated / optional” or remove if no handlers exist.

## Security Considerations

**`SUPABASE_SERVICE_ROLE_KEY` on serverless and Edge Function:**
- **Risk:** Service role bypasses RLS. Used in `api/_lib/auth.js` for REST lookups and in `supabase/functions/verify-pin/index.ts` for user reads/writes. Any leak from Vercel env, logs, or a mis-deployed client bundle is catastrophic.
- **Files:** `api/_lib/auth.js`, `supabase/functions/verify-pin/index.ts`, `api/sap/README.md` (env table).
- **Current mitigation:** Keys stay server-side only; docs say “NEVER expose to browser.”
- **Recommendations:** Restrict Vercel env to production/preview; rotate on staff changes; ensure no `console.log` of full `fetch` URLs with embedded keys (auth uses `Authorization: Bearer` + `apikey` — watch log redaction); prefer Supabase “least privilege” where possible for new features.

**`HQ_SERVICE_TOKEN` and session header trust model:**
- **Risk:** Patrol → HQ uses `Authorization: Bearer` with `HQ_SERVICE_TOKEN` (`api/_lib/hq-client.js`). Browser → Patrol uses `x-session-id: <users.id>` (`api/sap/README.md`, `api/_lib/auth.js`). An attacker who obtains another user’s UUID (see RLS directory leak below) can call SAP proxy routes as that user if they can hit your deployment.
- **Files:** `api/_lib/auth.js` (`verifySession`), `api/_lib/hq-client.js`, `api/sap/README.md`.
- **Current mitigation:** UUID is not public by default; `verifySession` checks `users` row and `is_active`.
- **Recommendations:** Treat as **bearer-equivalent secret**; add server-signed session cookies or short-lived JWTs for API routes; pair with tightening `users` SELECT RLS (deferred in `sprint-a-phase3-rls-align.sql` notes).

**`verify-pin` CORS and rate limits:**
- **Risk:** `Access-Control-Allow-Origin: '*'` on the Edge Function (`supabase/functions/verify-pin/index.ts`). Brute-force rate limiting is **in-memory per isolate** (Map), so it does not strongly protect against distributed or cold-start parallel attempts.
- **Files:** `supabase/functions/verify-pin/index.ts`.
- **Recommendations:** Tighten CORS to known Patrol origins; add Supabase/Cloudflare rate limiting or persistent lockout; keep bcrypt/PIN validation path reviewed on each change.

**Unauthenticated diagnostic endpoint:**
- **Risk:** `api/whoami.js` is intentionally unauthenticated and returns Vercel metadata and egress IP. Low data sensitivity but useful for recon; comment says to remove or gate later.
- **Files:** `api/whoami.js`.
- **Recommendations:** Gate with deploy-only secret query param or remove from production when NSG work is done.

**Admin API CORS wildcard:**
- **Risk:** `api/admin/sap-reps.js` sets `Access-Control-Allow-Origin: '*'`. Session is still required, but any origin can read responses in a credentialed CORS sense if paired with `x-session-id` from another context.
- **Files:** `api/admin/sap-reps.js`.
- **Recommendations:** Restrict to known Patrol origins; keep role gate (`USER_ADMIN_ROLES`).

**Client session TTL (`localStorage`):**
- **Risk:** Session expiry is enforced in `getSession()` by comparing `expiresAt` in `localStorage` (`js/auth.js`). A user can edit `localStorage` and extend a session; there is no server-side session invalidation for the field PIN flow.
- **Files:** `js/auth.js` (e.g. `expiresAt` check ~lines 485–486), `docs/quality-gate-pre-pilot-2026-04-17.md` (H-04), `PATROL_AUTOPSY_REPORT.md` (H-04).
- **Recommendations:** For higher assurance, Supabase Auth sessions with server-validated JWTs; or short TTL + server-side token version on sensitive actions.

**In-memory session cache (API):**
- **Risk:** `api/_lib/auth.js` caches successful `verifySession` results for 30s. Stale `is_active` or role changes can lag up to TTL in a single instance (usually acceptable; document for incident response).
- **Files:** `api/_lib/auth.js`.
- **Recommendations:** Lower TTL for admin routes or bypass cache for `api/admin/*`.

**HQ client with empty token:**
- **Risk:** `callHqProxy` still issues the request if `HQ_SERVICE_TOKEN` is empty (header may be omitted or empty `Authorization` dependent on token string). Misconfiguration may yield confusing HQ errors rather than fail-fast at startup.
- **Files:** `api/_lib/hq-client.js` (`const token = process.env.HQ_SERVICE_TOKEN || ''`).
- **Recommendations:** Fail fast in API handlers or `callHqProxy` when token missing in production.

## RLS & Data Exposure

**Open `users` SELECT:**
- **Risk:** Policy `"Users read own record"` uses `USING (true)` so any authenticated Supabase user can read the full `users` directory (PII, roles, manager graph). Documented as H-05; migration `sprint-a-phase3-rls-align.sql` **defers** tightening because leaderboard widgets need cross-user reads.
- **Files:** `supabase/schema.sql` (lines ~148–151), `supabase/migrations/sprint-a-phase3-rls-align.sql` (NOTES), `docs/quality-gate-pre-pilot-2026-04-17.md`, `docs/POS_OWNERSHIP_MODEL.md`.

**Stores write/read scope:**
- **Risk:** Historical diagnosis: broad anon/client access patterns for `stores` described in `docs/POS_OWNERSHIP_MODEL.md` (“RLS on stores is currently open” / territory-aware reads not yet enforced). Combined with `users` enumeration, threat model includes mass export via PostgREST.
- **Files:** `docs/POS_OWNERSHIP_MODEL.md`, `supabase/schema.sql` (stores policies reference `auth.uid()` — client must use JWT that sets `auth.uid` to `users.id`; field app uses anon key + RLS patterns per product design).
- **Recommendations:** Ship `user_can_see_store`-style policy when territory graph is stable; align with SAP mapping (same doc).

**`exec` / `champion` RLS (legacy state):**
- **Issue:** Pre-migration, `exec` had no visibility; `champion` could fail CHECK. **Partially fixed** in `sprint-a-phase3-rls-align.sql`. If that migration was not applied in an environment, autopsy issues (C-02) return.
- **Files:** `supabase/migrations/sprint-a-phase3-rls-align.sql`, `PATROL_AUTOPSY_REPORT.md`, `supabase/schema.sql` (older policy lists).

## SAP Credential Handling Boundaries

**Intended design:** Browser never sees `HQ_SERVICE_TOKEN` or SQL passwords; SAP traffic goes **Patrol serverless → HQ Cloud Run → MSSQL** for primary dashboards (`api/sap/README.md`). Read-only SQL user required if direct DB envs are ever used.

**Operational boundaries:**
- **Risk:** `SAP_DB_*` secrets on Vercel and duplicate rotation with MCP/gsheet (`docs/PATROL-SESSION-RESUME-2026-05-03.md`, `docs/PATROL-OPS-RUNBOOK.md`). Password drift breaks tooling vs app independently.
- **Recommendations:** Single owner for credential rotation; document “rotate both Vercel + MCP” checklists; never embed SQL credentials in client or committed files.

**Margin stripping:** Recursive deletion of margin keys in `api/_lib/scope.js` (per README). Regression risk if HQ adds new margin field names — unit tests in `tests/unit/scope.test.js` should be extended when HQ payloads change.

## API Directory (`api/`) — Risk Summary

| Area | Concern | Reference |
|------|---------|-----------|
| Auth | `x-session-id` UUID-only validation; no cryptographic binding to PIN/OAuth | `api/_lib/auth.js` |
| HQ upstream | Token parity between Vercel and Cloud Run (502/504 triage) | `api/_lib/hq-client.js`, `api/sap/README.md`, `docs/PATROL-SESSION-RESUME-2026-05-03.md` |
| Admin | Role gate + wildcard CORS | `api/admin/sap-reps.js` |
| Diagnostics | Open `whoami` | `api/whoami.js` |
| Sales aggregate | HQ-shaped rewrite in `sales/all.js` — keep in sync with HQ schema | `api/sap/sales/all.js` |

## Offline Sync Complexity

**Concurrency fix (2026-04-25):** `syncPending()` serializes via `_syncRunning` to prevent duplicate `createStore` when chatbot and queue both trigger sync (`js/offline.js`).

**Remaining risks:**
- **Payload stripping:** `offline_id` must be removed before PostgREST insert (`_queuePayload`); mismatch causes PGRST204, retries, then **ejection** after `MAX_SYNC_RETRIES` — silent data loss if user ignores sync bar.
- **Files:** `js/offline.js` (comments lines 44–51, `_markRetryOrEject`).
- **Photo upload failure:** Visit sync continues **without photo** if upload fails (`js/offline.js` ~159–161).
- **Idempotency:** Duplicate inserts detected via `patrolIsLikelyDuplicateInsertError` — depends on correct implementation in `js/db.js` / helpers.

**Mitigations:** Surface ejected rows to user (not only console); retry photo upload before clearing queue; admin tooling to inspect IndexedDB via documented `patrolInspectQueue`.

## DSM / RSM Bottom Navigation — History & Fragility

**Observed problem:** Six-tab bottom bar for DSM/RSM/CEO overflowed horizontally; WebViews often stayed at `scrollLeft=0`, hiding Visit/Sales/Leaders (`docs/PATROL-SESSION-RESUME-2026-05-03.md`).

**Mitigation shipped:** `scrollActiveBottomNavTabIntoView()` using `scrollIntoView({ inline: 'center', ... })` in `js/nav-role-device.js`; cache-bust on `app.html`. Related CSS: `css/patrol.css`, `css/density-pass.css`, `css/dsm-rsm-mobile.css`, `css/sales-tab-v2.css` (safe-area padding).

**Residual risk:** Different WebViews (Facebook in-app, Samsung Internet) may still mishandle `overflow-x: auto` + `scrollIntoView`; field verification checklist remains in session resume doc.

## Performance Bottlenecks

**N+1 manager dashboard:** Multiple sequential Supabase calls for DSM team/scorecard paths — reported as **H-02** in `PATROL_AUTOPSY_REPORT.md` (`js/scorecard.js`, `js/db.js`).

**Mitigation path:** Batch RPC or widen single query with client-side aggregation.

## Test Coverage Gaps

**E2E session injection:** `tests/e2e/05-dsm.spec.ts` seeds `localStorage` with a fake UUID (`test-dsm-001`) — not a real Supabase id; tests validate DOM shells, not API integration.

**Files:** `tests/e2e/05-dsm.spec.ts`, `tests/e2e/04-offline.spec.ts` (similar pattern likely).

**Risk:** Green E2E while production auth/RLS paths break.

## Dependencies at Risk

**Supabase JS from CDN / pinned Edge esm:** Client bundles `@supabase/supabase-js@2` per quality gate; Edge Function uses esm.sh — monitor for supply-chain and version pins.

**HQ coupling:** Patrol sales UX depends on HQ response shape (`api/sap/sales/all.js` mapping). HQ deploys can break Patrol without code changes.

---

*Concerns audit: 2026-05-04*

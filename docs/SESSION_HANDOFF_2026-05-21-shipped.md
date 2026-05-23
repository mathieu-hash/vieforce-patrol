# VieForce Patrol — Post-Waves Handoff

**Date:** 2026-05-21 (end of day)
**Branch:** `main`
**Version:** `3.2.0-beta.1` (package.json, config.js, api/health.js)
**Release channel:** `beta`
**Tag:** `v3.2.0-beta.1`
**Production:** https://vieforce-patrol.vercel.app

Supersedes: `docs/SESSION_HANDOFF_2026-05-21-complete.md` (pre-waves morning state).

---

## 1. What happened today

Started the day with `_audit/MASTER_PLAN.md` synthesis from 7 parallel read-only audit agents. Verdict: **24 P0 / 50 P1 across auth, offline, UI, tests, docs**. App was NOT pilot-safe despite shipping handoff claims.

Executed 6 waves of fixes via multi-agent orchestration. 20 narrow-scope agents, each in its own git worktree, sequential integration with test gates between waves. 4 prod deploys (W0, W1, W2/W3, W4/W5).

---

## 2. What changed (one line per wave)

| Wave | One-liner |
|---|---|
| W0 | Realigned `CLAUDE.md` stack to reality (was claiming Next.js + Cloud SQL + GCS); added HSTS + CSP + Referrer-Policy + Permissions-Policy to `vercel.json`; archived 3 stale handoffs; committed Phase C work. |
| W1 | Killed plaintext-PIN-anon-readable leak (`users` RLS); migrated TSR sessions to real Supabase Auth JWTs (`app_metadata.role` stamped); rebuilt `api/_lib/auth.js` to validate Bearer JWT; added role gates to every `api/**`; fixed `/api/sap/sales/all` margin strip; patched XSS at `visit-wizard.js:442`; scrubbed PIN from admin UI + CSV. RLS migration applied: TSR → DSM(district) → RSM(region) → top-manager(all). |
| W2 | Removed the 3-strike eject (data loss) — transient errors retry forever with 5s..24h backoff; permanent errors quarantine. Routed `updateStore`, `assignStores/Farms`, `last_visit_at`, profile edits through the offline queue (Dexie v3, then v4). Reordered photo flow to INSERT→UPLOAD→PATCH with deterministic path (no orphans). Single `getSyncState()` source-of-truth; sync badge never green when offline. |
| W3 | Capped leaderboard to top 3 + viewer's own rank (Filipino hiya — CLAUDE.md Rule 8). Killed `Loading...` text on every TSR path; skeleton-row helper. Replaced `seed % 11` mock DSM data with real Supabase aggregates + 1h IDB cache. |
| W4 | 4 e2e test gates: photo compression budget (80KB/640px), 64px tap targets (caught 16 existing violations), real Google OAuth flow (4 cases), real offline drain (6 scenarios). 4 new test specs + 1 fixture. |
| W5 | Bumped 13 TSR controls to 64px; manager `.hdr-btn` to 48px. Fixed PGRST204 classifier bug (db.js was stripping err.code). Lazy-loaded `rsm.css`, `phase4-social.css`, `phase3-sales-stores.css` off TSR critical path (~32KB saved). Purged 430 LOC of dead code (entire `home-extras.js`, `_renderLeaderboardCard`, `getDSMSummary`, 8 debug `console.log` in labels-v2.js, dead spinner CSS). |

---

## 3. Numbers

- **Tests:** 121 → **244** unit (+123 across 5 wave test files)
- **Locale parity:** 191 → **209** keys × 3
- **LOC:** ≈ +5,000 / −2,000 net delta
- **Agents:** 7 audit + 20 fix = **27 total**
- **Commits:** 25+ on `main` since morning
- **Deploys:** 4 to Vercel (1 to Supabase Edge Function)
- **Migrations applied:** 3 (`stores_owner_messenger`, `patrol_org_master`, `rls_hardening_w1`)

---

## 4. Architecture changes worth knowing

1. **Auth flow** (W1):
   - `verify-pin` Edge Function (v4) now hand-signs an HS256 JWT using `SUPABASE_JWT_SECRET` and returns `{ access_token, refresh_token, expires_in, token_type, ...identity }`.
   - Client calls `supabase.auth.setSession({ access_token, refresh_token })` — from then on PostgREST + Storage requests carry the Supabase JWT automatically.
   - `api/_lib/auth.js` exports `requireUser(req)` / `requireRole(req, roles)` / `withAuth(handler, {roles})`. Reads `Authorization: Bearer <jwt>`. Legacy `x-session-id` UUID is rejected with `migration_required: true`.
   - `app_metadata` stamped: `patrol_user_id, role, name, region, district, territory`.

2. **RLS hierarchy** (W1):
   - Helpers: `patrol_role()`, `patrol_is_admin()`, `patrol_is_manager()`, `patrol_is_top_manager()`, `patrol_jwt_region()`, `patrol_jwt_district()`, `patrol_rsm_in_region(region)`, `patrol_dsm_in_district(district)`.
   - Scoping: TSR (own) → DSM (district) → RSM (region) → top-manager/admin/CEO/EVP/marketing/exec (all).
   - `users` table: locked from anon SELECT — was `USING (true)`, now self+admin only.

3. **Offline queue** (W2):
   - Dexie schema v4 with 7 pending tables + 2 cache tables.
   - `classifyError(err) → 'transient' | 'permanent'` with code-based primary + message-regex fallback.
   - `getSyncState() → { onLine, pending, syncing, quarantined, lastError }` — single source of truth for the badge.
   - Photo path: `{tsr_id}/{YYYY-MM-DD}/{row_id}.jpg` with `upsert:true` — retry-safe, no orphans.

4. **Bundle** (W5):
   - 3 manager-only CSS files now lazy-loaded via `ensureManagerSalesAssets` / `ensureManagerRsmAssets` / `ensureManagerSocialAssets` / `ensureManagerStoresAssets` in `app.html`.
   - TSR cold-load saves ~32KB.

---

## 5. Validation status

Verified before final push (commit 654c99a):
- `npm run check:locales` — 209 keys × 3, parity OK
- `npm run test:unit` — **244/244 pass**
- `npm run test:e2e:all` — Wave 4 added 4 new spec files + extensive coverage; not re-run since worktree integration but each agent verified its own spec passes locally

To verify yourself after the final push:
```powershell
git pull
npm install
npm run test:unit
npm run test:e2e:all
```

Production smoke (no auth required for browse, login required for write):
- https://vieforce-patrol.vercel.app — should load with CSP active
- PIN login as TSR → check Network tab for `Authorization: Bearer <jwt>` (not `x-session-id`)
- Google OAuth as manager → confirm role-scoped data only
- Take a photo on a visit form → ≤80KB after compression

---

## 6. Open items (not blocking pilot)

### From the original master plan §3 W2 — partially complete:
- W2-RetryClassify said legacy `getSyncStatus().ejected` is always 0 now. Old call sites in `js/visits.js` and `js/pilot-readiness.js` still reference it; harmless (always falsy) but cleanup-worthy.

### From W3-Leaderboard agent flag:
- `js/team.js#_renderLeaderboard` is the DSM team-management deep-dive page (different surface from the public widget). Renders full TSR scorecard for coaching — left intact per W3 spec. Product to confirm this is the right behavior.

### From W3-RealDsm:
- Dexie schema is now v4. First load after this deploy will migrate IDB schemas; should be transparent. If users see "Offline queue not ready" briefly, that's the v3→v4 upgrade running.

### From W1-RLS:
- `farms` table has no `district` column → DSM doesn't see farms by district scope, only by `assigned_tsr` or `created_by`. Add column later if DSMs need farm visibility.
- Visit-list scoping uses EXISTS-join on stores. Pilot-scale fine; denormalize region/district onto visits if perf becomes an issue.

### From W5-ClassifierFix:
- `js/camera.js` (3 Storage error throws) and `server/services/store-sap-matcher.js` (5 throws) have the same anti-pattern as db.js had. Storage errors don't carry PGRST codes so PGRST204 doesn't apply, but the pattern could mask future error classes. Backlog.

### From W4-TapTargets:
- 3 controls are allow-listed at 48px (language pills, route-optimize secondary pill, theme-toggle). Documented inline with rationale.

---

## 7. Reference

- `_audit/MASTER_PLAN.md` — original plan + shipped status header
- `_audit/AUDIT_A..G_*.md` — original 7-agent audit reports (frozen at 2026-05-21 morning; file:line refs may drift)
- `docs/AGENT_HANDOFF.md` — outside-agent handoff doc (now reflects v3.2.0-beta.1)
- `docs/PATROL-OPS-RUNBOOK.md` — runbook with PIN-reset, photo-fail, Vercel-rollback playbooks (added W0)
- `PRODUCT.md` — backlog statuses (updated W0; further updates may be due for W3-W5)
- `CLAUDE.md` v3.1 — stack-accurate brief

---

## 8. Commit chain (latest first)

```
654c99a Merge fix/w5-bundle-admin-polish: lazy-load manager CSS + C1 hdr-btn 48px
df3407d Merge fix/w5-tap-targets-fix: bump 13 TSR controls to 64px
609357d Merge fix/w5-classifier-pgrst204: preserve err.code through db.js wrap
63410e4 Merge fix/w5-dead-code: -430 LOC
49ec561 Merge fix/w4-offline-e2e: real offline drain (6 scenarios)
62dc300 Merge fix/w4-oauth-e2e: real OAuth flow (8 cases)
3abac76 Merge fix/w4-tap-targets-e2e: 64px tap-target gate
d354d8d Merge fix/w4-photo-budget: 80KB/640px compression test
788bd97 Wave 3 deployed (DSM real data + skeletons + leaderboard hiya)
c885ff0 Wave 2 deployed (offline-first complete)
13cd0aa Wave 1.2: RLS function order + schema gap fill
45a1643 Wave 1.1: RLS hierarchy + admin-only sap_matches
[Wave 1 code + Edge Function deployed]
a36e8f2 Wave 0 deployed (Phase C + docs + security headers)
015c236 [previous main] Add org admin e2e coverage
```

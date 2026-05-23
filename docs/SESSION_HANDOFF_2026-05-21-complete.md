# VieForce Patrol — Complete Handoff

**Date:** 2026-05-21  
**Repo:** `C:\VienovoDev\vieforce-patrol`  
**Branch:** `main`  
**Product:** VieForce Patrol — field sales execution app for Vienovo Philippines  
**Production:** `https://vieforce-patrol.vercel.app`  
**Version:** `3.1.0-beta.1` (`package.json`, `config.js`)  
**Release channel:** `beta`

---

## 1. Executive Summary

VieForce Patrol is a static-first field PWA hosted on Vercel. It serves TSR/Champion field reps on low-end Android phones and managers/admin on mobile or desktop. The app is intentionally lightweight: static HTML shells, vanilla JavaScript, CSS files, Supabase for auth/data, Vercel serverless APIs for protected admin/SAP/HQ calls, and Playwright/Node tests for release confidence.

The latest work moved the app closer to pilot readiness:

- Org Admin shipped locally and committed: `admin-org.html`, `/api/admin/org`, org master migration, user-admin helpers, Sales Admin dropdown wiring.
- Field Phase B nav hardened: TSR bottom nav is now 4-tab oriented with Profile/Visits/Logout through the More sheet.
- SAP roster admin mobile support hardened: desktop uses table, mobile uses card stack; e2e now asserts the correct layout per viewport.
- Visits page can be reached through More sheet and is covered by e2e.
- Local targeted QA and production smoke are green.

Latest commits:

```text
7125959 Target Visits sheet action in e2e helper.
e674903 Fix visits More sheet e2e selector.
6874a6e Update org admin and field QA hardening.
2b13b4b Fix Sales Admin clipped table with card layout; ship pilot hardening.
4513c05 Enable PWA shell cache-first service worker.
726eb14 feat: offline queue hardening, assign flows, and Sales Admin E2E.
```

Current git status at handoff creation should be checked before new work:

```powershell
git status --short
```

---

## 2. First-Read Source Of Truth

Read these before changing behavior.

| Priority | File | Why it matters |
|---|---|---|
| 1 | `PRODUCT.md` | Current product context, personas, auth model, admin surfaces, strategic principles, UI backlog. |
| 2 | `CLAUDE.md` | Non-negotiable TSR constraints: offline-first, 64px taps, no spinners, trilingual text, Messenger-hybrid UI, max 4 TSR tabs. |
| 3 | `.planning/codebase/ARCHITECTURE.md` | System architecture: browser shell, Supabase, Vercel API, HQ Cloud Run/SAP path. |
| 4 | `.planning/codebase/STACK.md` | Runtime, dependencies, env var names, scripts, deployment platform. |
| 5 | `.planning/codebase/STRUCTURE.md` | Where files live and where to add new code. |
| 6 | `.planning/codebase/INTEGRATIONS.md` | Supabase, Google OAuth, HQ Cloud Run, SAP B1, diagnostics, auth flows. |
| 7 | `.planning/codebase/CONCERNS.md` | Security, RLS, SAP doc drift, offline sync complexity, test gaps. |
| 8 | `.planning/codebase/TESTING.md` | Unit/e2e test patterns and commands. |
| 9 | `DESIGN.md` | Design rules, token split, accessibility expectations. |
| 10 | `docs/QA-SMOKE.md` | Pre-release QA checklist and Playwright coverage map. |
| 11 | `docs/PATROL-OPS-RUNBOOK.md` | Production incident playbook for auth, sync, SAP, boot, NSG. |
| 12 | `api/sap/README.md` | Patrol → HQ → SAP proxy contract and margin stripping policy. |

Older or supplementary context:

- `docs/SESSION_HANDOFF_2026-05-19-org-admin.md` — previous org-admin handoff before it was committed.
- `docs/PATROL-USER-MANUAL.md` — user-facing flow manual.
- `docs/PATROL-TESTER-UAT-CHECKLIST.md` — non-dev UAT sheet.
- `docs/PRE-RELEASE-SMOKE-CHECKLIST.md` — release checklist.
- `docs/PILOT-KNOWN-ISSUES.md` — known pilot gaps.
- `PATROL_AUTOPSY_REPORT.md` and `docs/quality-gate-pre-pilot-2026-04-17.md` — older quality/security findings.
- `docs/superpowers/specs/2026-04-27-patrol-sales-tab-design.md` — approved Sales tab design spec.

---

## 3. Product Blueprint

### Personas And Surfaces

| Persona | Surface | Auth | Primary job |
|---|---|---|---|
| TSR / Champion | `app.html` field shell | Phone + PIN | Daily route, store visits, photos, offline queue, sync. |
| DSM / RSM | `app.html` manager shell | Google OAuth `@vienovo.ph` | Team visibility, coaching, assign, Sales tab, KPIs. |
| Exec / EVP / CEO | `app.html` / HQ redirect | Google OAuth | Portfolio visibility and higher-scope dashboard access. |
| Sales Admin | `admin.html`, `admin-org.html`, `admin-users-sap.html` | Google OAuth or provisioned PIN | User CRUD, org master, SAP roster alignment. |
| Marketing Manager | `admin.html` | Google OAuth | User admin access alongside Sales Admin / EVP. |

### Design Registers

- **TSR screens:** Messenger-hybrid, white background, Vienovo cyan `#00A6CE`, low-tech friendly. All writes must work offline. All primary touch targets should be 64px. No spinners, no hidden swipe actions, no English-only strings.
- **Manager / Exec screens:** Vienovo navy / executive UI. Data-dense is acceptable, but still mobile-tolerant.
- **Admin screens:** Desktop-first is acceptable, but mobile must degrade to cards or stacked actions. Use `css/admin-page.css` shared patterns where possible.

### Non-Negotiable TSR Rules

From `CLAUDE.md`:

- Write to IndexedDB first, sync second.
- Photos must stay highly compressed for prepaid data constraints.
- All TSR interactive elements should be at least 64px high.
- No swipe-only gestures.
- TSR strings must use trilingual labels from `js/labels-v2.js`, `locales/*.json`, or the `T` label layer.
- Use skeletons/cached content instead of spinners.
- Use top performers only for leaderboard patterns; never shame low performers.

---

## 4. Architecture Overview

Canonical architecture doc: `.planning/codebase/ARCHITECTURE.md`.

```text
Browser static shells
  - index.html: login / OAuth entry
  - app.html: authenticated SPA-style shell
  - admin.html: Sales Admin
  - admin-org.html: org master
  - admin-users-sap.html: SAP roster

Browser JS/CSS
  - js/*.js vanilla modules, mostly globals/IIFEs
  - css/*.css feature and token styles
  - locales/*.json i18n dictionaries

Data/auth
  - Supabase Auth + Postgres + Edge Function verify-pin
  - Browser direct Supabase reads/writes for app data
  - IndexedDB/Dexie offline queue in js/offline.js

Protected APIs
  - Vercel api/**/*.js
  - api/_lib/*.js shared server-only helpers
  - admin endpoints use service role
  - SAP endpoints verify session, proxy to HQ, strip margin keys

SAP/HQ
  - Browser -> Patrol Vercel /api/sap/*
  - Patrol -> HQ Cloud Run with HQ_SERVICE_TOKEN
  - HQ -> SAP B1 MSSQL
```

Important architectural constraints:

- Main app is not React. It is static HTML + script tags + vanilla JS.
- Routing is section-based: one `.page` in `app.html` has class `active`; `window.nav(pageId)` controls page changes.
- Browser modules attach globals to `window`; new browser features should follow that pattern unless intentionally migrated.
- Server routes are Vercel filesystem routes. Shared server code belongs under `api/_lib/`.
- Browser must never receive `SUPABASE_SERVICE_ROLE_KEY`, `HQ_SERVICE_TOKEN`, or SQL credentials.

---

## 5. Runtime, Scripts, And Commands

Canonical stack doc: `.planning/codebase/STACK.md`.

Package manager: npm.  
Main test tools: Playwright and Node built-in `node:test`.  
Supabase CLI is installed as dev dependency.

Key scripts from `package.json`:

```powershell
npm run test:unit              # locale parity + all node:test unit files
npm run test:e2e:all           # full Playwright suite, desktop + mobile
npm run test:e2e               # chromium desktop only
npm run test:e2e:mobile        # chromium mobile only
npm run test:e2e:prod-smoke    # @smoke tests against prod when PATROL_E2E_PROD=1
npm run check:locales          # locale parity only
npm run check:supabase-auth    # Supabase auth config verification
npm run sb:link                # link Supabase project yolxcmeoovztuindrglk
npm run sb:push                # push migrations
npm run deploy:vercel          # vercel deploy --prod --yes
```

For local static e2e, `playwright.config.ts` starts:

```text
npx --yes serve . -l 4173
```

Production smoke:

```powershell
$env:PATROL_E2E_PROD='1'
npm run test:e2e:prod-smoke
```

---

## 6. Current QA Status

Most recent verified checks after the latest e2e/admin commits:

```text
npx playwright test tests/e2e/11-admin-users-sap.spec.ts tests/e2e/16-visits-tab.spec.ts
Result: 10 passed
Coverage: desktop + Pixel 5 for SAP roster and Visits tab / More sheet.
```

```text
PATROL_E2E_PROD=1 npm run test:e2e:prod-smoke
Result: 9 passed
Coverage: production smoke @smoke tests on chromium-desktop.
```

Previous broader QA summary before the SAP roster fix:

- Full local browser QA with mocked Supabase/API: 127 / 128 passed.
- Only failure was `11-admin-users-sap` mobile expecting desktop table.
- That was fixed by `expectSapRosterLoaded()` and viewport-aware assertions.

Recommended next verification before release:

```powershell
npm run test:unit
npm run test:e2e:all
$env:PATROL_E2E_PROD='1'; npm run test:e2e:prod-smoke
```

If the full e2e suite fails after a long run with `ERR_CONNECTION_REFUSED`, inspect whether the local Playwright web server died or was interrupted before assuming an app regression.

---

## 7. Latest Work Shipped In Commits

### `6874a6e` — `Update org admin and field QA hardening.`

This is the main repo-wide update commit.

Major areas:

- Adds Org Admin:
  - `admin-org.html`
  - `js/admin-org.js`
  - `css/admin-org.css`
  - `api/admin/org.js`
  - `api/_lib/org-sync.js`
  - `api/_lib/supabase-service.js`
  - `api/_lib/user-admin.js`
  - `supabase/migrations/20260518120000_patrol_org_master.sql`
  - `tests/unit/org-sync.test.js`
- Wires Sales Admin to org picklists:
  - `admin.html`
  - `js/admin.js`
  - `css/admin-page.css`
- Adds or adjusts SAP roster mobile card CSS:
  - `admin-users-sap.html`
  - `css/admin-sap.css`
  - `js/admin-users-sap.js`
- Hardens TSR field UX:
  - `css/tsr-field.css`
  - `js/nav-role-device.js`
  - `app.html`
  - `js/visits.js`
  - `js/visit-wizard.js`
  - `js/offline.js`
  - locale updates in `locales/*.json`
- Adds pilot/readiness and docs updates:
  - `js/pilot-readiness.js`
  - `docs/SESSION_HANDOFF_2026-05-19-org-admin.md`
  - `docs/QA-SMOKE.md`
  - `docs/PRE-RELEASE-SMOKE-CHECKLIST.md`

### `e674903` — `Fix visits More sheet e2e selector.`

First follow-up to the new Visits-via-More test. It broadened the label selector for localized More sheet text.

### `7125959` — `Target Visits sheet action in e2e helper.`

Final e2e helper fix. The More sheet contains both "Log Visit" and the Visits list item; localized labels made text matching ambiguous. The helper now targets the sheet item whose `onclick` routes to `page-visits`.

Relevant helper:

```text
tests/e2e/_helpers.ts -> openTsrVisits(page)
```

---

## 8. Org Admin Feature Handoff

Previous source: `docs/SESSION_HANDOFF_2026-05-19-org-admin.md`.

### Goal

Replace free-text Region/District/Territory drift with a central org master:

- Region and District are SAP-synced.
- Territory is Patrol-only and maintained by admin.
- Sales Admin Add/Edit user should use dropdown picklists.

### Key Files

| Concern | Path |
|---|---|
| Org admin page | `admin-org.html` |
| Org admin script | `js/admin-org.js` |
| Org admin CSS | `css/admin-org.css` |
| Org API route | `api/admin/org.js` |
| Sync logic | `api/_lib/org-sync.js` |
| Supabase service helper | `api/_lib/supabase-service.js` |
| User admin role gate | `api/_lib/user-admin.js` |
| Database migration | `supabase/migrations/20260518120000_patrol_org_master.sql` |
| Unit test | `tests/unit/org-sync.test.js` |
| Sales Admin wiring | `admin.html`, `js/admin.js` |

### API Contract

`GET /api/admin/org`

- Returns org tree plus user counts.
- Uses service role.
- Requires user-admin role.

`POST /api/admin/org`

Actions:

- `sync_sap`
- `territory_create`
- `territory_update`
- `territory_delete`
- `region_update`
- `district_update`

Allowed roles:

- `ceo`
- `admin`
- `evp`
- `marketing`

### Database

Migration:

```text
supabase/migrations/20260518120000_patrol_org_master.sql
```

Expected tables:

- `patrol_org_regions`
- `patrol_org_districts`
- `patrol_org_territories`

Notes:

- RLS enabled.
- No anon policies expected.
- API uses `SUPABASE_SERVICE_ROLE_KEY`.
- Existing `users.region`, `users.district`, `users.territory` remain text fields; master tables provide controlled labels and counts.

### Post-Deploy Manual Verification

1. Open `admin-org.html` as `ceo`, `admin`, `evp`, or `marketing`.
2. Click Sync from SAP.
3. Confirm regions and districts populate.
4. Add a Patrol Territory under a district.
5. Open `admin.html`, Add/Edit user, confirm Region/District/Territory dropdowns use org picklists.
6. Save user and confirm `users.region/district/territory` values match selected labels.

### Remaining Gap

There is no dedicated Playwright e2e spec for `admin-org.html` yet. Add one once the production route is deployed and stable.

Suggested test file:

```text
tests/e2e/18-admin-org.spec.ts
```

---

## 9. Admin And SAP Roster Handoff

### User Admin

Main files:

- `admin.html`
- `js/admin.js`
- `css/admin-page.css`

Important behavior:

- Role access via `canAccessUserAdmin()` and API gates.
- Admin modals must trap focus, close on Escape, and restore focus to row action.
- User edit now includes email and org fields.
- Google manager login requires `users.email` matching the `@vienovo.ph` Google account.

### SAP Roster

Main files:

- `admin-users-sap.html`
- `js/admin-users-sap.js`
- `css/admin-sap.css`
- `api/admin/sap-reps.js`
- `tests/e2e/11-admin-users-sap.spec.ts`

Responsive behavior:

- Desktop: `#sap-table-wrap` visible.
- Mobile under 640px: table is intentionally hidden and `#sap-cards` is visible.
- E2E helper `expectSapRosterLoaded(page, expectedTotal?)` encodes this.

Do not "fix" the hidden mobile table; it is the intended layout.

---

## 10. TSR Field UX Handoff

The TSR experience is the most sensitive part of this repo.

Current Phase B outcomes:

- Bottom nav moved toward 4-tab pattern:
  - Home
  - POS / Stores
  - Mapa
  - Higit pa / More
- Profile, Visits, and Logout are accessed through More sheet.
- `openTsrProfile()`, `logoutViaMoreSheet()`, and `openTsrVisits()` in `tests/e2e/_helpers.ts` reflect this current behavior.
- Visits page now has coverage via:
  - `tests/e2e/16-visits-tab.spec.ts`

Key files:

- `app.html`
- `js/nav-role-device.js`
- `js/visit-wizard.js`
- `js/visits.js`
- `js/stores.js`
- `js/home-tsr.js`
- `js/offline.js`
- `css/tsr-field.css`
- `css/patrol.css`
- `js/labels-v2.js`
- `locales/en.json`
- `locales/tl.json`
- `locales/ceb.json`

Critical reminders:

- If a button or row is TSR-facing, aim for 64px minimum height.
- If a string is TSR-facing, localize it.
- If a write happens, offline queue first.
- If loading happens, skeleton or cached content first.
- Do not add heavy dependencies without explicit approval.

---

## 11. Offline Sync And Photos

Primary file:

```text
js/offline.js
```

Supported local stores include:

- `pendingVisits`
- `pendingStores`
- `pendingFarms`
- cached/offline support tables depending on migration version

Operational helpers from `docs/PATROL-OPS-RUNBOOK.md`:

- `patrolInspectQueue()` — inspect pending rows.
- `patrolClearQueue()` — destructive local clear; only use after confirming data is duplicated or intentionally abandoned.

Important behavior:

- Offline writes must queue locally first.
- Duplicate insert errors are treated as success if server already has the row.
- Permanent eject after repeated failures is possible; watch console and sync bar.
- Photo upload failure may allow visit sync without photo; treat this as a product-risk area for pilot.

Recommended future hardening:

- Show ejected rows to the user, not only console.
- Improve photo retry before clearing visit queue.
- Add admin/support diagnostics for queued/ejected records.

---

## 12. SAP / HQ Integration Handoff

Primary docs:

- `api/sap/README.md`
- `.planning/codebase/INTEGRATIONS.md`
- `docs/HQ_API_CONTRACT.md`
- `docs/PATROL-OPS-RUNBOOK.md`

Primary files:

- `api/_lib/auth.js`
- `api/_lib/hq-client.js`
- `api/_lib/scope.js`
- `api/sap/*.js`
- `api/admin/sap-reps.js`
- `js/db.js` (`sapFetch`)

Security model:

- Browser sends `x-session-id: <users.id>`.
- Patrol Vercel validates the user row via Supabase service role.
- Patrol calls HQ Cloud Run with `Authorization: Bearer $HQ_SERVICE_TOKEN`.
- HQ resolves actual SAP scope and reads MSSQL.
- Patrol strips gross margin / cost / GP-like keys recursively before returning data.

Required production env var names:

- `HQ_SERVICE_TOKEN`
- `HQ_API_BASE_URL` or `HQ_API_BASE`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Known documentation drift to watch:

`.planning/codebase/CONCERNS.md` notes that some docs still mention direct MSSQL routes and `SAP_DB_*`. Treat the current live architecture as Patrol → HQ → MSSQL unless inspecting a specific route proves otherwise.

When Sales tab or SAP data fails:

1. Browser Network: inspect `/api/sap/*`.
2. 401: session/user problem.
3. 502/504: HQ token/upstream/HQ issue.
4. `patrol_meta.is_empty`: user mapping/scope issue, not necessarily code.
5. Never expose SQL details to the browser.

---

## 13. Auth Handoff

Primary files:

- `index.html`
- `app.html`
- `js/auth.js`
- `js/supabase.js`
- `supabase/functions/verify-pin/index.ts`
- `api/user/language.js`
- `api/_lib/auth.js`

Login paths:

1. TSR/Champion phone + PIN via Supabase Edge Function `verify-pin`.
2. Manager/admin Google OAuth via Supabase Auth. Must be `@vienovo.ph`, and the user row must include matching `users.email`.

Important access rules:

- Google manager roles: `dsm`, `rsm`, `exec`, `admin`, `ceo`.
- User Admin roles: `ceo`, `admin`, `evp`, `marketing`.
- `users.is_active = false` blocks new auth resolution, but existing local sessions may last until TTL/logout.

Security concerns:

- `x-session-id` is bearer-like. Long-term improvement should move API auth to cryptographically signed tokens or server-side sessions.
- `verify-pin` CORS/rate limits should be revisited for production hardening.
- `api/whoami.js` is unauthenticated diagnostics and should eventually be gated or removed.

---

## 14. Database And Migrations

Primary migration directory:

```text
supabase/migrations/
```

Important migrations:

- `20260518120000_patrol_org_master.sql` — org master tables.
- `20260430120000_add_user_language.sql` — user language support.
- `20260501190000_users_role_marketing.sql` — marketing role.
- `20260502120000_stores_owner_messenger.sql` — store owner / Messenger-related fields.
- `sprint-a-phase3-rls-align.sql` — RLS/role alignment.
- `sprint-a-test-accounts.sql` — pilot test accounts.
- `sprint-b-patrol-hub.sql`, `sprint-b-sap-seed.sql` — later SAP/hub setup.

Critical warning from `.planning/codebase/CONCERNS.md`:

`supabase/schema.sql` is not necessarily a fully current source of truth. Migrations carry important role/RLS changes. For new environments, document or validate exact apply order.

Recommended DB workflow:

```powershell
npm run sb:link
npm run sb:migration:list
npm run sb:push
```

Do not edit production DB manually unless explicitly requested and documented.

---

## 15. Design And UI Source Files

Primary design docs:

- `DESIGN.md`
- `PRODUCT.md`
- `CLAUDE.md`

Runtime CSS:

- `css/tokens.css` — Elite / newer token stack.
- `css/patrol.css` — legacy Patrol / Messenger-hybrid variables.
- `css/admin-page.css` — shared admin primitives.
- `css/admin-org.css` — org admin.
- `css/admin-sap.css` — SAP roster.
- `css/tsr-field.css` — TSR field hardening.
- Feature stylesheets under `css/`.

Static mockups / references:

- `patrol-fb-mockup.html`
- `prototype-demo-reference.html`
- `docs/PatrolElite_v3.html`
- `docs/elite-dashboards-mockup.html`

Treat mockups as reference snapshots, not source of truth.

Design policies:

- Avoid gradient text / `background-clip: text` for KPI/body UI.
- Prefer top/full borders or tinted cards over left-stripe accents.
- Use admin cards on mobile instead of forcing wide tables.
- Modals must be keyboard accessible.

---

## 16. Localization Handoff

Primary files:

- `js/i18n.js`
- `js/labels-v2.js`
- `locales/en.json`
- `locales/tl.json`
- `locales/ceb.json`

Rules:

- Add keys to all locale JSON files in lockstep.
- Run `npm run check:locales`.
- For TSR strings, Tagalog/Bisaya/English considerations apply.
- Existing HTML first-paint English is a known backlog item; prefer `data-i18n` or runtime label application for new UI.

Current useful keys around nav:

- `nav.visit`
- `nav.more`
- `nav.sheet_profile`
- `nav.sheet_visits`
- `nav.sheet_logout`

Be careful: "Visits" and "Log Visit" can collide in localized labels. E2E now targets the actual `page-visits` action instead of relying only on text.

---

## 17. Testing Map

Primary docs:

- `.planning/codebase/TESTING.md`
- `docs/QA-SMOKE.md`
- `docs/PRE-RELEASE-SMOKE-CHECKLIST.md`

Important e2e specs:

| Area | Spec |
|---|---|
| Auth | `tests/e2e/01-auth.spec.ts` |
| Stores | `tests/e2e/02-stores.spec.ts` |
| Visit | `tests/e2e/03-visit.spec.ts` |
| Offline | `tests/e2e/04-offline.spec.ts` |
| DSM | `tests/e2e/05-dsm.spec.ts` |
| More sheet / Profile | `tests/e2e/06-more-sheet-profile.spec.ts` |
| RSM | `tests/e2e/07-rsm.spec.ts` |
| Bottom nav | `tests/e2e/08-navigation.spec.ts` |
| Language | `tests/e2e/09-language.spec.ts` |
| Profile | `tests/e2e/10-profile-phase4.spec.ts` |
| SAP roster | `tests/e2e/11-admin-users-sap.spec.ts` |
| Team / Assign | `tests/e2e/12-assign-team.spec.ts` |
| Map / Sync | `tests/e2e/13-map-sync.spec.ts` |
| Assign page | `tests/e2e/14-assign-page.spec.ts` |
| Farms | `tests/e2e/15-farms.spec.ts` |
| Visits page | `tests/e2e/16-visits-tab.spec.ts` |
| Sales Admin | `tests/e2e/17-admin-html.spec.ts` |

Important helpers:

- `installAppInitScripts(page)`
- `seedSession(page, overrides)`
- `loginAsTsr(page)`
- `loginAsDsm(page)`
- `loginAsRsm(page)`
- `loginAsCeo(page)`
- `openMoreSheet(page)`
- `openTsrProfile(page)`
- `openTsrVisits(page)`
- `logoutViaMoreSheet(page)`
- `expectSapRosterLoaded(page, expectedTotal?)`

Unit tests:

- `tests/unit/org-sync.test.js`
- `tests/unit/hq-client.test.js`
- `tests/unit/whoami.test.js`
- `tests/unit/patrol-cors.test.js`
- `tests/unit/scope.test.js`
- `tests/unit/role-scope.test.js`
- `tests/unit/offline-queue-payload.test.js`
- `tests/unit/patrol-duplicate-error.test.js`
- `tests/unit/sales-tab-format.test.js`
- `tests/unit/sales-queries.test.js`
- `tests/unit/stores-nav-pref.test.js`
- `tests/unit/sap-*.test.js`

---

## 18. Deployment / Production Checklist

Before deploying or promoting:

1. Check clean status:

   ```powershell
   git status --short
   ```

2. Run local checks:

   ```powershell
   npm run test:unit
   npm run test:e2e:all
   ```

3. Run production smoke:

   ```powershell
   $env:PATROL_E2E_PROD='1'
   npm run test:e2e:prod-smoke
   ```

4. Confirm env vars in Vercel:

   - `HQ_SERVICE_TOKEN`
   - `HQ_API_BASE_URL` or `HQ_API_BASE`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

5. Confirm Supabase Edge Function secrets:

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

6. Confirm Supabase auth redirect URLs:

   ```powershell
   npm run check:supabase-auth
   ```

7. Deploy:

   ```powershell
   npm run deploy:vercel
   ```

8. Manual smoke:

   - Login as TSR with PIN.
   - Open Home, Stores/POS, Mapa, More.
   - Open Profile, Visits, Logout from More.
   - Submit a visit online and offline.
   - Login as DSM/RSM; inspect home, Sales, Team, More.
   - Open `admin.html`, `admin-users-sap.html`, `admin-org.html`.

---

## 19. Known Risks And Follow-Ups

### P0 / Pilot Critical

- **Org Admin e2e missing:** Add automated coverage for `admin-org.html`.
- **Full e2e after latest commits:** Targeted e2e and prod smoke passed; run full `npm run test:e2e:all` before tagging.
- **Supabase migration state:** Confirm `20260518120000_patrol_org_master.sql` is applied in production before relying on org admin.
- **Service role env:** Org admin API depends on `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
- **TSR touch target audit:** CSS is in place but not pixel-measured everywhere.

### Security / Architecture

- `x-session-id` is not cryptographically bound to a login session.
- `users` RLS / directory exposure has known risks; see `.planning/codebase/CONCERNS.md`.
- `verify-pin` rate limiting and CORS are pilot-grade, not hardened enterprise auth.
- `api/whoami.js` is useful for egress IP debugging but should eventually be gated or removed.
- Some SAP docs mention direct MSSQL paths; verify actual route implementation before incident action.

### Product / UX

- First-paint English and remaining trilingual gaps exist.
- Some manager/social surfaces are mock/stub-driven.
- Photo retry behavior can sync visit without photo if upload fails.
- Bundle weight and script count remain high for low-end TSR devices.

---

## 20. Suggested Next Work

Best next steps for a new agent:

1. Run `git status --short`.
2. Run full local tests:

   ```powershell
   npm run test:unit
   npm run test:e2e:all
   ```

3. Confirm migration state:

   ```powershell
   npm run sb:migration:list
   ```

4. Add `tests/e2e/18-admin-org.spec.ts`.
5. Deploy to Vercel only after tests pass.
6. On production, open `admin-org.html` and Sync from SAP.
7. Update `docs/PATROL-USER-MANUAL.md` with `admin-org.html` as an access URL if it is not already documented there.
8. Update `docs/QA-SMOKE.md` coverage map to include `admin-org.html` once e2e exists.

Suggested next commit message for the admin-org e2e/doc follow-up:

```text
Add org admin smoke coverage and docs.

Extends release QA to cover admin-org so SAP-backed regions/districts and Patrol territories are verified before pilot rollout.
```

---

## 21. Quick Prompt For The Next Agent

Paste this into a new session:

```text
You are taking over VieForce Patrol in C:\VienovoDev\vieforce-patrol.

Read first:
- docs/SESSION_HANDOFF_2026-05-21-complete.md
- PRODUCT.md
- CLAUDE.md
- .planning/codebase/ARCHITECTURE.md
- .planning/codebase/CONCERNS.md
- docs/QA-SMOKE.md

Current state:
- Latest commits include org admin + TSR field QA hardening.
- Targeted e2e passed: SAP roster + Visits tab on desktop and Pixel 5.
- Production smoke passed: 9 @smoke tests.
- Need full local e2e before release and admin-org e2e is still missing.

Do not undo user changes. Do not commit unless explicitly asked.
Preserve TSR non-negotiables: offline-first, 64px taps, trilingual labels, no spinners, no swipe-only interactions.
```

---

## 22. Reference Index

### Product / Design

- `PRODUCT.md`
- `CLAUDE.md`
- `DESIGN.md`
- `docs/PATROL-USER-MANUAL.md`
- `docs/PATROL-TESTER-UAT-CHECKLIST.md`
- `docs/PILOT-KNOWN-ISSUES.md`
- `docs/superpowers/specs/2026-04-27-patrol-sales-tab-design.md`

### Architecture / Codebase Map

- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STACK.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/INTEGRATIONS.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/TESTING.md`

### QA / Ops

- `docs/QA-SMOKE.md`
- `docs/PRE-RELEASE-SMOKE-CHECKLIST.md`
- `docs/PATROL-OPS-RUNBOOK.md`
- `docs/PHASE_4_5_smoke_results.md`
- `docs/PHASE_4_8_translation_review.md`
- `PATROL_AUTOPSY_REPORT.md`
- `docs/quality-gate-pre-pilot-2026-04-17.md`

### SAP / HQ

- `api/sap/README.md`
- `docs/HQ_API_CONTRACT.md`
- `api/_lib/hq-client.js`
- `api/_lib/scope.js`
- `api/_lib/auth.js`
- `api/admin/sap-reps.js`

### Org Admin

- `docs/SESSION_HANDOFF_2026-05-19-org-admin.md`
- `admin-org.html`
- `js/admin-org.js`
- `css/admin-org.css`
- `api/admin/org.js`
- `api/_lib/org-sync.js`
- `api/_lib/supabase-service.js`
- `api/_lib/user-admin.js`
- `supabase/migrations/20260518120000_patrol_org_master.sql`
- `tests/unit/org-sync.test.js`

### Tests

- `playwright.config.ts`
- `tests/e2e/_helpers.ts`
- `tests/e2e/*.spec.ts`
- `tests/unit/*.test.js`
- `scripts/check-locale-parity.mjs`

---

End of handoff.

# Audit G — Docs + Backlog Truth

**Agent:** G (read-only)
**Date:** 2026-05-21
**Scope:** Root .md files, `docs/`, `.planning/codebase/`, `api/sap/README.md`, `package.json` + `config.js` version/channel

---

## Summary

- **Findings:** P0=5, P1=8, P2=11, P3=4
- **Top 3 doc hazards for outside agent:**
  1. **`CLAUDE.md` §2 "REAL TECH STACK" is a lie.** It declares Next.js 14 + Express 5 + Drizzle + Cloud SQL + GCS as the live stack. The repo is static HTML + vanilla JS + Supabase + Vercel serverless (HQ Cloud Run proxy for SAP, NOT direct). An outside agent reading CLAUDE.md will run `npm install dexie`, look for `src/app/`, `src/db/schema.ts`, `next.config.js`, `tailwind.config.js`, `api-server/` and `Dockerfile` — **none of which exist**. This alone burns a half-day before they realise the file lies about its own subject. (P0)
  2. **`PRODUCT.md` "UI quality backlog" still lists Phase A1–A7, B1–B8, C1–C6 as open punch-list items** while both `docs/AGENT_HANDOFF.md` and `docs/SESSION_HANDOFF_2026-05-21-complete.md` claim Phase A, B, and C are done. Agent B is responsible for code-level verification, but the doc itself never updates its own status table, so the outside agent reads "9 outstanding TSR tasks" right next to "everything is shipped." (P0)
  3. **`docs/PATROL-OPS-RUNBOOK.md` still contains a full direct-MSSQL runbook (Test-NetConnection, `SAP_DB_PASS`, NSG allowlist, bastion plans)** as the FIRST troubleshooting block for "Sales tab — direct SAP endpoints empty/erroring," even though `.planning/codebase/CONCERNS.md` explicitly flags that all live `/api/sap/*` routes proxy through HQ. The "(2026+ architecture)" callout is buried five paragraphs in. On-call will follow the wrong runbook during an outage. (P0)

---

## CLAUDE.md stack drift

The hard rules in §0 ("READ THIS FIRST — HARD RULES FOR TSR SCREENS") and the brand color palette in §16 are still authoritative — do not touch them. The drift below is concentrated in the "what's already built / how it's built" sections and the build-order phases.

| Section | Stale claim | Real state | Suggested minimal edit |
|---|---|---|---|
| §1 "What's Already Built" → "Backend: Express 5 + Drizzle ORM on Cloud Run" | Express + Drizzle | Vercel Node serverless (`api/**/*.js`) + Supabase REST; HQ Cloud Run is a **separate** product Patrol proxies into, not Patrol's own backend | Replace with: `Backend: Vercel Node serverless under api/ (no Express); SAP data via HQ Cloud Run proxy (see api/sap/README.md)` |
| §1 "What's Already Built" → "Database: PostgreSQL on Cloud SQL (vieforce-db → patrol)" | Cloud SQL | Supabase Postgres (project ref `yolxcmeoovztuindrglk`) | Replace with: `Database: Supabase Postgres (project ref yolxcmeoovztuindrglk)` |
| §2 "REAL TECH STACK (verified)" entire code block | Next.js 14 App Router on Vercel; Express 5 + TS + Drizzle on Cloud Run; PostgreSQL on Cloud SQL | Static HTML + vanilla JS on Vercel; Vercel Node serverless `api/`; Supabase (Auth + Postgres + Edge Functions); HQ Cloud Run is upstream-only | Replace whole block with the `.planning/codebase/STACK.md` summary: `Frontend: static HTML + vanilla JS (no bundler), Vercel / Backend: Vercel Node serverless under api/ / DB+Auth+Edge: Supabase / SAP path: Patrol → HQ Cloud Run → MSSQL (read-only) / Offline: Dexie in js/offline.js / PWA: sw.js cache-first` |
| §3 "ENVIRONMENT VARIABLES" | `NEXT_PUBLIC_*`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_*`, `DATABASE_URL=postgresql://…/cloudsql`, `GCS_BUCKET`, `GCS_PROJECT_ID`, `JWT_SECRET` | Real vars (per `.planning/codebase/STACK.md`): `HQ_API_BASE_URL`, `HQ_SERVICE_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PATROL_CORS_ORIGINS`, `PATROL_WHOAMI_KEY`, optional `SAP_DB_*` (legacy only). NextAuth and GCS are not used. | Replace whole block with the real var table from `STACK.md`/`api/sap/README.md` |
| §4 "DATABASE SCHEMA (Cloud SQL PostgreSQL)" | Cloud SQL, "Drizzle schema lives in: `src/db/schema.ts`", "Run migrations with: `npm run db:migrate`" | Supabase Postgres; schema in `supabase/schema.sql` + `supabase/migrations/*.sql`; migrate with `npm run sb:push` | Replace with: `Supabase Postgres. Schema: supabase/schema.sql + supabase/migrations/*.sql. Migrate: npm run sb:push (after npm run sb:link). Schema.sql is known-stale vs migrations — see CONCERNS.md.` |
| §5 "REPO STRUCTURE" tree | Shows `src/app/(auth)/login/page.tsx`, `src/db/schema.ts`, `api-server/src/index.ts`, `api-server/Dockerfile`, `next.config.js`, `tailwind.config.js` | Real tree (per `.planning/codebase/STRUCTURE.md`): `app.html`, `index.html`, `admin*.html`, `js/*.js`, `css/*.css`, `api/**/*.js`, `supabase/`, `tests/{unit,e2e}/`, `locales/` | Replace whole tree with the `STRUCTURE.md` layout |
| §7 "OFFLINE QUEUE — IMPLEMENTATION SPEC" | `// src/lib/offline.ts` with TypeScript Dexie example | Real file is `js/offline.js` (vanilla JS, already shipped — Phase A done) | Change path comment to `js/offline.js` and add note: `Already implemented — see file. Do not rewrite as TS.` |
| §8 "PHOTO UPLOAD — IMPLEMENTATION SPEC" | "Storage: Google Cloud Storage / Bucket: vieforce-patrol-photos / `src/lib/camera.ts`" | Photos go to **Supabase Storage bucket `patrol-photos`** via `js/camera.js` (CLAUDE.md §1 even acknowledges this in the backlog list, but §8 still says GCS) | Replace with: `Storage: Supabase Storage bucket patrol-photos. Implementation: js/camera.js (already shipped — Phase B done). Compression rule still applies: 640px max, JPEG q0.5, ~50KB.` |
| §9 "STORE/FARM ASSIGNMENT" → migration SQL block | Hand-typed migration to add `assigned_tsr` columns | Already shipped — `assigned_tsr` exists in production schema; assignment UI lives at `js/assign.js` / `#page-assign`. CLAUDE.md §1 backlog list correctly checks this off but §9 still reads as "to do." | Replace migration block with: `Already shipped — see supabase/migrations/ and js/assign.js. Skip.` |
| §10 "EXCEL/PDF EXPORT" → "use exceljs / @react-pdf/renderer" | npm install exceljs + @react-pdf/renderer | Repo uses `xlsx` (per `PATROL_AUTOPSY_REPORT.md` C-04 — `xlsx.full.min.js`); no exceljs or react-pdf | Either delete §10 (Excel is shipped via xlsx lazy-load per Phase C) or replace package names with `xlsx` (browser CDN, lazy-loaded) |
| §11 "MESSENGER CHATBOT" → "Stack: Meta Messenger Platform (Webhook) + Node.js handler on Cloud Run" | Cloud Run handler | Not shipped. The TSR new-store + new-farm chatbots are **in-app** chat UIs (`#page-store-new`, `#page-farm-new` per autopsy), not Meta Messenger Platform. CLAUDE.md §1 backlog still lists "Messenger chatbot integration" as TODO. | Reword §11 header to: `(Future / not implemented — the chatbot today is in-app, not Meta Messenger Platform)` |
| §12 "PWA SETUP" → "`public/manifest.json`" with hand-typed manifest | Files at `public/manifest.json`, `public/sw.js` | Real files are at repo root: `manifest.json`, `sw.js`. Manifest also reflects beta channel ("VieForce Patrol (Beta)") with `theme_color #00A6CE`, not the navy in CLAUDE.md. | Change paths from `public/manifest.json` → `manifest.json` (root); show actual current manifest values (`theme_color: #00A6CE`, `background_color: #FFFFFF`, `name: "VieForce Patrol (Beta)"`) |
| §15 "BUILD ORDER" (Phase A–G with `[ ]` unchecked boxes) | All 39 items unchecked, "do first / npm install dexie / src/lib/offline.ts" | Phase A and Phase B per AGENT_HANDOFF and SESSION_HANDOFF 2026-05-21 are shipped; offline + photos + assignment + PWA are live. Build order doesn't match PRODUCT.md's Phase A/B/C taxonomy at all — they are two unrelated phase systems. | Replace with: `Build order superseded — see PRODUCT.md "UI quality backlog" Phase A/B/C and docs/SESSION_HANDOFF_2026-05-21-complete.md for current status.` |
| §19 "UPDATED BUILD ORDER" (Phase 0 Messenger UX + A/B/C/D/E/F) | All items unchecked; assumes Tailwind + React components `<StoreRow />` etc. | Components are vanilla JS DOM, not React. Phase 0 conceptually shipped. | Same fix as §15 — delete or mark as "design exploration, superseded." |
| §20 "FUTURE: CRM 360° MERGE" file tree | `modules/patrol/`, `modules/hq/`, `shared/auth/` | Aspirational only — no merge has happened. | Mark §20 with `(Future / aspirational)` header for clarity. |
| §21 "NOTES FOR CLAUDE CODE" → "Run `npm run db:migrate` after any schema changes" | `db:migrate` script | Real script is `npm run sb:push` | Replace `npm run db:migrate` with `npm run sb:push` |
| Footer | "Stack: Next.js 14 + Express 5 + Drizzle + Cloud SQL + Cloud Run + Vercel" | Wrong | Replace with: `Stack: static HTML + vanilla JS + Supabase + Vercel serverless (HQ Cloud Run for SAP only)` |

**Authoritative content in CLAUDE.md to keep untouched:**
- §0 hard rules 1–8 (offline-first, 6MB data budget, 64px taps, no swipes, trilingual, Messenger-hybrid, no spinners, adoption rules)
- §6 TSR profile constraints
- §16 color system + typography (Messenger-hybrid palette)
- §17 trilingual label system (`T.*` keys)
- §18 component library naming intent (even if implementation is vanilla JS)

---

## Doc cross-contradictions

| Topic | Doc A says | Doc B says | Authority |
|---|---|---|---|
| Frontend framework | CLAUDE.md §2: "Next.js 14 App Router" | PRODUCT.md, AGENT_HANDOFF.md, STACK.md, ARCHITECTURE.md: static HTML + vanilla JS (no React) | **Static HTML + vanilla JS** (verified in repo — `app.html`, `js/*.js`, no `next.config.js`) |
| Backend | CLAUDE.md §2: "Express 5 + TypeScript + Drizzle on Cloud Run" | STACK.md / ARCHITECTURE.md: Vercel Node serverless `api/**/*.js`; HQ Cloud Run is a **separate product** | **Vercel Node serverless** |
| Database | CLAUDE.md §2 + §4: "PostgreSQL on Cloud SQL, instance vieforce-db, db patrol" | STACK.md: Supabase Postgres, project ref `yolxcmeoovztuindrglk` | **Supabase Postgres** |
| Photo storage | CLAUDE.md §2: "Supabase Storage `patrol-photos`" (correct in summary) but §8: "Google Cloud Storage `vieforce-patrol-photos`" | PATROL_AUTOPSY (H-03) + AGENT_HANDOFF: Supabase Storage `patrol-photos` | **Supabase Storage `patrol-photos`** |
| Migrations command | CLAUDE.md §4: `npm run db:migrate` | STACK.md / SESSION_HANDOFF 2026-05-21: `npm run sb:push` | **`npm run sb:push`** |
| Service worker | CLAUDE.md §12: "Service Worker to add" + PATROL_AUTOPSY H-01: "Service worker permanently disabled" | SESSION_HANDOFF 2026-05-21 commit `4513c05`: "Enable PWA shell cache-first service worker" + ARCHITECTURE.md still says "Explicitly unregistered in app.html head" | **SW is now enabled** (per commit `4513c05`). ARCHITECTURE.md needs update; PATROL_AUTOPSY H-01 marked OUTDATED. |
| Phase status (A/B/C) | PRODUCT.md "UI quality backlog": all Phase A1–A7, B1–B8, C1–C6 listed without status, TSR rules compliance still shows "⚠️ Partial" for trilingual, 64px, no-spinners, Messenger-hybrid, "❌ Five tabs today" | AGENT_HANDOFF.md + SESSION_HANDOFF 2026-05-21: "Phase A — Admin and auth polish [done]. Phase B — TSR field UX: 4-tab nav, 64px TSR controls, skeleton visits, trilingual first paint improvements [done]. Phase C — Manager/DSM/RSM polish [done]" | **AGENT_HANDOFF + SESSION_HANDOFF supersede** for status; PRODUCT.md backlog needs ✅/⚠️/❌ status column added per row. |
| TSR bottom tab count | PRODUCT.md "TSR rules compliance" table: "❌ Five tabs today" | SESSION_HANDOFF 2026-05-21 §10: "Bottom nav moved toward 4-tab pattern: Home / POS / Mapa / Higit pa" + AGENT_HANDOFF: "max 4 bottom tabs" | **4 tabs (shipped).** Update PRODUCT.md compliance table to ✅. |
| SAP path (live architecture) | PATROL-OPS-RUNBOOK.md (lines 70–98): runs entire "direct SAP endpoints empty/erroring" runbook with TCP test, `SAP_DB_PASS` rotation, NSG allowlist, before the "Patrol browser SAP reads (2026+ architecture)" callout | CONCERNS.md, ARCHITECTURE.md, INTEGRATIONS.md, api/sap/README.md: live path is Patrol → HQ Cloud Run → MSSQL; `SAP_DB_*` is legacy/optional only | **Patrol → HQ → MSSQL is the live path.** OPS-RUNBOOK should lead with the HQ-proxy triage and demote `SAP_DB_*` to "legacy tooling only." |
| `cachedStores` Dexie table | CLAUDE.md §7 spec: includes `cachedStores: 'id, updated_at, territory'` | PATROL_AUTOPSY M-11 + SESSION_HANDOFF 2026-05-21: table exists but is never populated | **CONCERNS-level dead table.** PRODUCT.md / CLAUDE.md should not assume offline read cache works. |
| Service Worker status | ARCHITECTURE.md "Architectural Constraints": "Service workers: Explicitly unregistered in app.html head — offline handled via Dexie/queue in JS, not SW caching" | SESSION_HANDOFF 2026-05-21: commit `4513c05` "Enable PWA shell cache-first service worker" + manifest.json + `sw.js` at repo root | **SW is now enabled.** ARCHITECTURE.md is stale. |
| Manifest theme | CLAUDE.md §12 sample manifest: `background_color: #004D71, theme_color: #004D71` (navy) | Actual `manifest.json`: `background_color: #FFFFFF, theme_color: #00A6CE` (Messenger-hybrid white+cyan) | **manifest.json is correct** for TSR-first PWA. CLAUDE.md sample should match. |

---

## Phase backlog doc-vs-handoff

PRODUCT.md punch list says "open"; AGENT_HANDOFF + SESSION_HANDOFF 2026-05-21 say "done." Agent B will do the code verification; this is the doc-state mismatch surface.

| Item (PRODUCT.md) | Doc state | Handoff claim | Action |
|---|---|---|---|
| A1 — Consolidate `admin.html` inline CSS into `admin-page.css` | Listed as TODO | "Phase A — Admin and auth polish [done]" | Mark ✅ or strike through after verification |
| A2 — Skeleton loaders on org/SAP admin pages | TODO | "Phase A — done" | Mark ✅ |
| A3 — SAP roster mobile card/stack | TODO | SESSION_HANDOFF §9: "Mobile under 640px: table is intentionally hidden and #sap-cards is visible. Do not 'fix' the hidden mobile table; it is the intended layout." | ✅ shipped (commit `2b13b4b`) |
| A4 — Admin actions: 44–48px min-height | TODO | Phase A done | Mark ✅ |
| A5 — `index.html` Google error strings via LABELS | TODO | Phase A done | Verify in code (Agent B) |
| A6 — Revisit `user-scalable=no` on auth/admin | TODO | not explicitly mentioned in handoff | Likely **still TODO** — handoff doesn't claim this |
| A7 — Shared admin subnav header | TODO | Phase A done | Verify |
| B1 — 64px TSR taps | TODO (P0) | "Phase B — TSR field UX: 64px TSR controls [done]" but SESSION_HANDOFF §19 says "TSR touch target audit: CSS is in place but not pixel-measured everywhere" | ⚠️ Partial — CSS shipped, audit not done |
| B2 — Bottom nav 4 tabs max | TODO (P0) | "Phase B done" + SESSION_HANDOFF §10: "Bottom nav moved toward 4-tab pattern" | ✅ shipped |
| B3 — Replace HTML "Loading..." at first paint | TODO (P0) | "trilingual first paint improvements [done]" but SESSION_HANDOFF §19: "First-paint English and remaining trilingual gaps exist" | ⚠️ Partial |
| B4 — Store empty state trilingual + CTA | TODO | Phase B done | Verify |
| B5 — Remove "Loading from Supabase…" copy | TODO | Phase B done | Verify |
| B6 — Lazy-load manager CSS/JS off TSR critical path | TODO | "manager assets removed from TSR critical path [done]" + Phase C: "Chart.js/Sales CSS/xlsx lazy loading [done]" | ✅ shipped (also resolves PATROL_AUTOPSY C-04, M-07, M-08) |
| B7 — Visit list skeleton-only | TODO | "skeleton visits [done]" | ✅ |
| B8 — Submit visit full-width 64px | TODO | Phase B done | Verify (PATROL_AUTOPSY §5 already said submit button is sticky 64px) |
| C1 — Manager nav overflow + i18n labels; 48px+ | TODO | "Manager nav touch and overflow polish [done]" | ✅ |
| C2 — Sales tab skeleton KPI blocks | TODO | "Sales tab skeleton loading [done]" | ✅ |
| C3 — DSM Pulse skeleton-first | TODO | "DSM skeleton-first dashboard rendering [done]" | ✅ |
| C4 — Assign UI localize stats + placeholders | TODO | "Assign UI localization [done]" | ✅ |
| C5 — Lazy-load Chart.js / xlsx | TODO | "Chart.js/Sales CSS/xlsx lazy loading [done]" | ✅ (resolves PATROL_AUTOPSY C-04, M-07, M-08) |
| C6 — Leaderboard top performers only | TODO | "DSM leaderboard top-performers-only behavior [done]" | ✅ |

**Action for outside agent:** PRODUCT.md "UI quality backlog" needs a Status column or strike-throughs, otherwise outside agent re-does shipped work. Agent B verifies the code matches.

Also note: PRODUCT.md "TSR rules compliance snapshot" table at the bottom is now **wrong**:
- "64px touch" ⚠️ Partial → likely ✅ after Phase B
- "No spinners (TSR)" ⚠️ Partial → likely ✅
- "Trilingual" ⚠️ Partial → ⚠️ Partial still per SESSION_HANDOFF §19
- "Messenger hybrid (TSR)" ⚠️ Partial → likely ✅
- "Max 4 tabs" ❌ Five tabs today → ✅ four tabs

---

## Stale handoff inventory

| File | Status | Recommendation |
|---|---|---|
| `docs/SESSION_HANDOFF_2026-04-18-evening.md` | Stale — discusses Sprint B hierarchy, HQ_SERVICE_TOKEN setup that is now operational, "EVP Joel's workflow tomorrow" framing. Predates Phase A/B/C entirely. | **Archive to `_archive/` or `docs/_archive/`.** Keep findable; not part of first-read. |
| `docs/PATROL-SESSION-RESUME-2026-05-03.md` | Stale-ish — covers the 6-tab bottom nav scrollIntoView fix that is now superseded by the 4-tab move. References cache-bust `nav-role-device.js?v=17`. Windel/Marvin SAP scope info may still be operationally relevant. | **Archive** (or extract the still-relevant Windel/Marvin SAP scope rows into PILOT-KNOWN-ISSUES.md, then archive). |
| `docs/SESSION_HANDOFF_2026-05-19-org-admin.md` | Superseded — org admin was committed in `6874a6e` per SESSION_HANDOFF_2026-05-21-complete.md §7 and §8. Doc claims "NOT committed / NOT deployed." | **Archive.** The 2026-05-21 doc explicitly says it consolidates this one. |
| `docs/PHASE_4_5_smoke_results.md` | Likely stale (Phase 4.5 specific). | Audit & archive if not referenced from current QA checklist. |
| `docs/PHASE_4_8_translation_review.md` | Likely stale (Phase 4.8 specific). | Audit & archive if not referenced. |
| `docs/quality-gate-pre-pilot-2026-04-17.md` | Same era as `PATROL_AUTOPSY_REPORT.md` (also 2026-04-17). Some findings (C-01 URL, C-04 xlsx, C-02 RLS) are resolved. | **Mark "Historical" header at top + archive once findings are resolved/superseded by SESSION_HANDOFF 2026-05-21.** Cross-reference is still pulled into `.planning/codebase/CONCERNS.md`, so don't delete. |
| `PATROL_AUTOPSY_REPORT.md` (root) | Mostly historical. Several "🔴 CRITICAL" items now resolved (C-01 confirmed in doc itself; C-04 xlsx lazy-load per Phase C; H-01 SW now enabled per commit `4513c05`). H-07 farm save persistence — needs Agent B verification. H-02 N+1 — still likely open. | **Keep at root** (executive-readable autopsy is useful for handoff context) but **add a "Status as of 2026-05-21" header** that strikes through resolved items. Alternatively move to `_archive/PATROL_AUTOPSY_REPORT_2026-04-17.md` and reference from CONCERNS.md. |
| `docs/SESSION_HANDOFF_2026-05-21-complete.md` | **Current source of truth.** | Keep. |
| `docs/AGENT_HANDOFF.md` | **Current outside-agent entry doc.** | Keep. |

---

## .planning/codebase/* freshness

| File | Status | Stale claims |
|---|---|---|
| `STACK.md` | ✅ Fresh (2026-05-04). Matches reality. | Minor: doesn't mention SW (`sw.js`) is now enabled (commit `4513c05` is post-2026-05-04). Add `sw.js` to "Build / config files" line. |
| `ARCHITECTURE.md` | ⚠️ Mostly fresh, **one stale claim**. | Line 162 "Service workers: Explicitly unregistered in app.html head — offline handled via Dexie/queue in JS, not SW caching" — **outdated.** SW is now enabled cache-first (commit `4513c05`, manifest + `sw.js` at root). |
| `STRUCTURE.md` | ✅ Fresh. | Doesn't list `admin-org.html` in root HTML files (added 2026-05-19 via commit `6874a6e`). Doesn't list `_audit/` directory (added today). |
| `INTEGRATIONS.md` | ✅ Fresh. Cleanest of the set. | None significant. |
| `CONCERNS.md` | ✅ Fresh and self-aware (it explicitly calls out the SAP-doc drift it has not fixed yet). | Could add explicit pointer to org-admin migration status + `users` RLS still open. |
| `TESTING.md` | ✅ Mostly fresh. | Test list (line 53–60) misses newer specs: `tests/e2e/06-more-sheet-profile.spec.ts`, `07-rsm`, `08-navigation`, `09-language`, `10-profile-phase4`, `11-admin-users-sap`, `12-assign-team`, `13-map-sync`, `14-assign-page`, `15-farms`, `16-visits-tab`, `17-admin-html`. Unit test list misses `whoami.test.js`, `patrol-cors.test.js`, `org-sync.test.js`. Numbers in TESTING.md predate the suite expansion. |
| `CONVENTIONS.md` | Not read in this audit — Agent G scope. | Out of scope. |

---

## Runbook gaps

| Incident | Playbook exists | Where | Gap |
|---|---|---|---|
| OAuth domain rejection (`@vienovo.ph` blocked) | Partial | PATROL-OPS-RUNBOOK.md §"OAuth / Google redirect failures" + §"Role mismatch / manager access" | ✅ Covered. Domain-locked behavior + missing `users.email` are both addressed. |
| PIN reset for TSR | ❌ Missing | — | **No runbook entry** for "TSR forgot PIN" or "admin needs to reset PIN." Edge function `verify-pin` is documented for failure modes but not for reset. Champion adoption pattern hits this. |
| Offline-queue stuck | ✅ Covered | PATROL-OPS-RUNBOOK.md §"Stuck offline sync queue" + SESSION_HANDOFF 2026-05-21 §11 | Good. `patrolInspectQueue()` + `patrolClearQueue()` + ejection-after-3-retries documented. |
| Photo upload fail (Supabase Storage 413/timeout/auth) | ❌ Missing | — | Photo upload failure is acknowledged as "photo upload failure may allow visit sync without photo" but there is no troubleshooting block. Pilot-grade gap. |
| SAP/HQ outage | ⚠️ Partial / misleading | PATROL-OPS-RUNBOOK.md §"Sales tab — direct SAP endpoints empty/erroring" | The HQ-proxy-aware section ("Patrol browser SAP reads (2026+ architecture)") is buried after the direct-MSSQL runbook that no longer applies to the live `/api/sap/*` path. **Restructure so HQ triage is first**, direct-MSSQL is a "legacy tooling" annex. |
| Vercel deploy rollback | ❌ Missing | — | No documented rollback procedure (e.g. `vercel rollback`, promote previous deployment from Vercel dashboard, or `git revert + redeploy`). Deploy section in SESSION_HANDOFF 2026-05-21 §18 lists only forward-deploy. |
| Supabase migration apply order / drift | ⚠️ Mentioned | CONCERNS.md "Base schema vs migrations" + SESSION_HANDOFF 2026-05-21 §14 | Acknowledged as a concern but no concrete "apply in this order: …" runbook. New environment setup is uncovered. |
| RLS misfire (exec / champion sees no data) | ✅ Covered | CONCERNS.md + PATROL_AUTOPSY C-02/C-03 + migration `sprint-a-phase3-rls-align.sql` | ✅ |
| Boot/blank shell | ✅ Covered | PATROL-OPS-RUNBOOK.md §"Boot / blank shell" with `?bootlog=1` | ✅ |
| Vercel env var rotation | ⚠️ Partial | PATROL-OPS-RUNBOOK.md §"If we rotate `gsheet` password" (5 locations) | Good for `SAP_DB_PASS` but no equivalent for `HQ_SERVICE_TOKEN` or `SUPABASE_SERVICE_ROLE_KEY` rotation (just mentioned as "do it together"). |
| OAuth Site URL drift (Supabase auth config) | ✅ Covered | `npm run check:supabase-auth` + `fix:supabase-auth-url` documented | ✅ |

---

## External-agent handoff gaps

`docs/AGENT_HANDOFF.md` is polished and well-structured. Gaps to close before handing to an outside agent:

| Gap | Detail |
|---|---|
| **Commit policy** | Says "Do not commit or deploy unless asked" — clear ✅. But no statement about branch protection, PR vs direct-to-main, or who reviews. Repo currently appears to push direct to `main` (per recent commit history). |
| **Branch policy** | "Current branch at handoff: `main`" — clear. But no statement on whether outside agent should create feature branches. Add: "Work on a feature branch; do not push to `main` directly." |
| **Deploy approval gate** | "Only deploy after tests pass and the user explicitly approves deployment" ✅. Could add: "Production deploy authority: Mathieu only" and the exact Vercel project (`mathieu-7782s-projects/vieforce-patrol` per SESSION_RESUME 2026-05-03). |
| **Secrets handoff channel** | "Do not ask for or paste secrets into chat. Get them through a secure channel." ✅ — but no specific channel named. For an outside agent: name the channel (1Password vault? Signal? Encrypted email?). Without that, the agent will ask. |
| **First commands to run** | `npm install` is listed, but no mention of Node version (STACK.md says Node 18+ but `node:test` references Node 22 — outside agent will hit version mismatch). |
| **Production smoke result interpretation** | Lists the smoke command but no guidance on "if it fails, do X." E.g. `ERR_CONNECTION_REFUSED` in long e2e runs is called out elsewhere but not in AGENT_HANDOFF. |
| **Where to ask questions** | No contact / Slack / email for the project owner. |
| **`_audit/` directory** | Not mentioned. This audit and parallel agent audits are landing here; outside agent should know they exist. |
| **CI status** | "No `.github/workflows`" per STACK.md + TESTING.md — outside agent should be told "CI is local-only; tests run on dev machine before deploy." |

---

## Version/release-channel consistency

| Location | Value | Consistent? |
|---|---|---|
| `package.json` `version` | `3.1.0-beta.1` | ✅ |
| `config.js` `VERSION` | `3.1.0-beta.1` | ✅ |
| `config.js` `RELEASE_CHANNEL` | `'beta'` | ✅ |
| `manifest.json` `name` | `"VieForce Patrol (Beta)"` | ✅ (reflects beta channel) |
| `manifest.json` `short_name` | `"Patrol Beta"` | ✅ |
| `docs/AGENT_HANDOFF.md` | "Current release: `3.1.0-beta.1`" | ✅ |
| `docs/SESSION_HANDOFF_2026-05-21-complete.md` | "Version: `3.1.0-beta.1`" + "Release channel: `beta`" | ✅ |
| `.planning/codebase/STACK.md` | "`package.json`: `version: 3.1.0-beta.1` / `config.js`: `VERSION: '3.1.0-beta.1'`, `RELEASE_CHANNEL: 'beta'`" | ✅ |
| `CLAUDE.md` footer | "*CLAUDE.md v3.0 · April 2026*" | ⚠️ Document version is 3.0 (April 2026) but app version 3.1.0-beta.1. These are intentionally different (doc version ≠ app version), but no header note explains that. P3 polish. |
| `docs/QA-SMOKE.md` | "With `RELEASE_CHANNEL: 'beta'` in `config.js`, orange beta bar shows" | ✅ |
| `CLAUDE.md` §1 "Live URL: https://vieforce-patrol.vercel.app" | matches | ✅ |
| `config.js` `DOMAIN: 'patrol.vienovo.ph'` + `OAUTH_PUBLIC_ORIGIN: 'https://patrol.vienovo.ph'` | Custom domain configured | ✅ (mentioned in `vercel.json` aliases per STACK.md) |
| `PATROL_AUTOPSY_REPORT.md` "Live deploy URL: `https://vieforce-patrol.vercel.app`" | ✅ |

**Version + channel consistency: ✅ Clean.** No drift. The only flag is the CLAUDE.md doc-version vs app-version distinction which is fine but could be clearer.

---

## Severity legend

- **P0** = doc actively misleads outside agent into wrong action (stack confusion, wrong runbook)
- **P1** = stale critical runbook / contradictory authoritative claims
- **P2** = drift / archive needed
- **P3** = polish

**P0 (5):** (1) CLAUDE.md §2/§3/§4/§5 stack lies; (2) PRODUCT.md backlog status missing while handoff claims done; (3) PATROL-OPS-RUNBOOK direct-MSSQL block buried over HQ-proxy block; (4) ARCHITECTURE.md says SW disabled (now enabled); (5) PATROL_AUTOPSY_REPORT.md still at root presenting "🔴 CRITICAL" items that are resolved.

**P1 (8):** CLAUDE.md §7/§8/§9/§11/§12 spec files point at wrong paths/tech; PIN reset runbook missing; Photo upload failure runbook missing; Vercel deploy rollback runbook missing; PRODUCT.md "TSR rules compliance" table needs status flip; CLAUDE.md §15/§19 build-order phases stale; TESTING.md test inventory missing 12 newer specs; `cachedStores` dead table not surfaced as risk in CLAUDE.md/PRODUCT.md.

**P2 (11):** 3 old session handoffs to archive; PHASE_4_5/4_8 docs probably archiveable; STACK.md needs `sw.js` mention; STRUCTURE.md needs `admin-org.html` + `_audit/` entry; CLAUDE.md §20 mark as aspirational; HQ_SERVICE_TOKEN rotation procedure under-documented; CLAUDE.md §21 `db:migrate` wrong command; CLAUDE.md §1 manifest path; supabase migration apply-order needs explicit runbook; quality-gate-pre-pilot-2026-04-17 needs historical header.

**P3 (4):** CLAUDE.md footer stack line; CLAUDE.md doc-version vs app-version note; AGENT_HANDOFF missing secrets channel name / Node version / contact; PATROL_AUTOPSY add "Status as of 2026-05-21" header before items.

# VieForce Patrol — Master Plan to 100%

**Date:** 2026-05-21
**Audit basis:** 7 parallel read-only audit agents (`_audit/AUDIT_A_*.md` through `AUDIT_G_*.md`)
**Initial verdict (start of day):** NOT pilot-safe. Documentation said "pilot-ready"; code said otherwise.

---

## ✅ SHIPPED — End-of-day status (2026-05-21)

All 6 waves executed via parallel multi-agent orchestration. **20 agents across 6 waves**, each in its own git worktree, integration-merged sequentially.

| Wave | Agents | Verdict |
|---|---|---|
| W0 — Docs + headers | 4 parallel | ✅ Shipped (commit a36e8f2) |
| W1 — Auth/security | 5 parallel | ✅ Shipped + Edge Function v4 + RLS migration applied |
| W2 — Offline-first | 4 parallel | ✅ Shipped (commit c885ff0) |
| W3 — TSR non-negotiables | 3 parallel | ✅ Shipped (commit 788bd97) |
| W4 — Test gates | 4 parallel | ✅ Shipped + uncovered 2 latent bugs (folded into W5) |
| W5 — Polish | 4 parallel | ✅ Shipped (commit 654c99a) |

**Tests:** 121 → 244 (+123). All P0 closed. Majority of P1 closed.
**Version bumped:** 3.1.0-beta.1 → 3.2.0-beta.1.
**Release:** `v3.2.0-beta.1` tag pushed on `main`.

See `docs/SESSION_HANDOFF_2026-05-21-shipped.md` for the post-waves state.

The rest of this document is the original plan (kept for historical reference).

---

---

## 1. Executive Summary

App is structurally further along than the surface bug count suggests, but **three categorical failures block pilot**:

1. **Auth is theatrical.** TSR PINs are stored and compared in **plaintext** with anon-readable RLS (`users RLS USING (true)`). Session "tokens" are unsigned UUIDs (`x-session-id`). TSRs never establish a Supabase Auth session, so every `auth.uid()` RLS policy is vacuous. One PostgREST call with the published anon key dumps every TSR's phone + PIN.

2. **Offline-first is partial.** Visit submit / store create / farm create correctly queue first. But `updateStore` (the first-order celebration moment), DSM `assignStores/assignFarms`, and `last_visit_at` writes bypass the queue and go straight to Supabase. The retry policy ejects records after 3 attempts without distinguishing transient (2G blip, 5xx) from permanent (PGRST204) errors — silent data loss, then the sync badge lies green "Naka-sync na ✓✓".

3. **TSR adoption-killers shipped.** Leaderboard in `js/phase4-social.js:1015-1115` exposes ranks 4..N to viewers (Filipino hiya violation — CLAUDE.md non-negotiable). DSM home shows fabricated `seed % 11` mock data, not real performance. Store-detail page shows `Loading...` text to TSRs (spinner-equivalent — CLAUDE.md Rule 7 violation).

**Aggregate severity across all audits:** P0=24, P1=50, P2=53, P3=24 (≈151 findings). Pilot gate is the 24 P0s. Polish-to-100% is +P1.

**Estimated work (with parallel multi-agent execution):**
- Wave 0 (unblock outside agent): ½ day
- Waves 1–3 (pilot-safe): 3–4 days
- Waves 4–5 (gated, 100%): +2–3 days
- **Total: ~6–7 working days** assuming 4–6 parallel agents per wave with integration gates between waves.

---

## 2. Pilot-Blocking Findings (P0) — Source of Truth

Grouped by execution wave. File:line refs traced from agent reports.

### 2.1 Auth / Security (Wave 1)

| # | Finding | Source | File:line |
|---|---|---|---|
| S1 | PINs stored & compared plaintext | A, C, F | `supabase/functions/verify-pin/index.ts:183`, `supabase/schema.sql:150`, `js/admin.js:548,707,749` |
| S2 | `users` RLS `USING (true)` → anon SELECT dumps all PINs | C, F | `supabase/schema.sql:150` |
| S3 | `x-session-id` is unsigned UUID = permanent bearer | C, F | `api/_lib/auth.js:22-67` |
| S4 | TSRs never sign into Supabase Auth → `auth.uid()` policies vacuous | F | RLS on `stores`, `visits`, `farms`, `sap_accounts` |
| S5 | `/api/sap/sales/all` skips `stripMarginsIfNeeded` | C | `api/sap/sales/all.js:36` |
| S6 | `/api/farms` no role gate, no try/catch | C | `api/farms.js` |
| S7 | XSS via unescaped notes in visit wizard | A | `js/visit-wizard.js:442` |
| S8 | No CSP, no HSTS, no Referrer-Policy | C, F | `vercel.json` |
| S9 | PIN visible in admin UI + `exportUsersCSV` writes PIN to CSV | A | `js/admin.js:548,707,749` |
| S10 | Anon key is published in `config.js` (acceptable IF RLS works — currently it doesn't) | F | `config.js:4` |

### 2.2 Offline-First / Data Loss (Wave 2)

| # | Finding | Source | File:line |
|---|---|---|---|
| O1 | 3-strike retry ejects on transient errors → silent data loss | D | `js/offline.js:70-84` |
| O2 | Post-eject, sync badge shows green "Naka-sync na" | D, A | `js/visits.js:526-530`, `js/home-tsr.js:466-468` |
| O3 | `updateStore` writes (prospect→active, `last_visit_at`) bypass queue | D | `js/visit-wizard.js:390,420` |
| O4 | `assignStores`/`assignFarms`/`bulkAssignAll` bypass queue | D | `js/assign.js:356-517`, `js/db.js:772-858` |
| O5 | Photo orphans on sync retry (upload-then-insert order; H-03 unfixed) | D | `js/offline.js:148-157,183-194` |
| O6 | Sync pill lies "Syncing…" while `navigator.onLine === false` | A | `js/home-tsr.js:466-468`, `js/stores.js:610-612` |

### 2.3 TSR Non-Negotiables (Wave 3)

| # | Finding | Source | File:line |
|---|---|---|---|
| T1 | Leaderboard exposes ranks 4..N (Filipino hiya / CLAUDE.md §0 Rule 8) | B, A | `js/phase4-social.js:1015-1115` |
| T2 | Store-detail TSR path shows `Loading...` text (Rule 7) | B | `app.html:1898,1902` |
| T3 | DSM home is `seed % 11` fabricated data, not real Supabase aggregates | A | `js/home-dsm.js:37-72` |
| T4 | PIN visible to admin UI + CSV (Rule 8 / data integrity) | A | `js/admin.js` (see S9) |

### 2.4 Doc-Hazards Misleading Outside Agent (Wave 0)

| # | Finding | Source |
|---|---|---|
| D1 | CLAUDE.md §2 + §5/§7–§9/§11–§19 claim Next.js 14 + Express + Cloud SQL + GCS; real stack is static HTML + vanilla JS + Supabase + Vercel | G |
| D2 | PRODUCT.md UI-backlog still lists shipped items as TODO; "TSR rules compliance snapshot" still ❌ on tabs and ⚠️ on 64px | G |
| D3 | ARCHITECTURE.md:162 claims service worker "explicitly unregistered" — commit `4513c05` enabled it | G |
| D4 | PATROL-OPS-RUNBOOK.md leads with retired direct-MSSQL/Azure path; missing playbooks for PIN reset, photo failure, Vercel rollback | G |

---

## 3. Execution Plan — Multi-Agent Orchestration

**Orchestration principle:** narrow-scope agents, one file-family per agent, all writes go through atomic commits, integration check after each wave, never proceed to next wave with red tests.

**Approval gates:** Mat reviews master plan now; each wave's plan is summarized for go/no-go before dispatch; deploy never happens without explicit "ship it".

---

### Wave 0 — Unblock Outside Agent + Quick Security Wins (½ day, 4 parallel agents)

**Goal:** Make the repo safe to hand off and apply 15-min security wins. No code logic changes.

| Agent | Scope | Output |
|---|---|---|
| W0-A | Fix CLAUDE.md §2–§21 stack drift (preserve §0 TSR rules + §16/§17 colors/labels untouched) | Edited CLAUDE.md |
| W0-B | PRODUCT.md backlog Status column + refresh TSR compliance snapshot | Edited PRODUCT.md |
| W0-C | Restructure PATROL-OPS-RUNBOOK.md (HQ-proxy first; add PIN-reset, photo-fail, Vercel-rollback playbooks); fix ARCHITECTURE.md:162; archive 3 stale handoffs to `_archive/` | Edited runbook + ARCHITECTURE.md + `git mv` to `_archive/` |
| W0-D | Add HSTS + CSP + Referrer-Policy to `vercel.json` (S8) | Edited vercel.json |

**Gate:** `npm run test:unit` green; review docs render; commit as **"chore(docs): align stack docs with reality + add security headers"**.

---

### Wave 1 — P0 Security (1.5–2 days, 5 parallel agents)

**Goal:** Close every S-row above. After this wave the auth/session story is real, not theatrical.

| Agent | Scope | Findings |
|---|---|---|
| W1-PinHash | Migrate PIN storage to argon2 in Edge Function `verify-pin`; one-time backfill script that re-hashes existing PINs on next successful login (or admin-driven reset); remove PIN from admin UI + CSV; admin "Reset PIN" flow | S1, S9 |
| W1-RLS | Lock `users` RLS to self-SELECT + admin-role-SELECT (drop `USING (true)`); audit RLS on `stores`, `visits`, `farms`, `sap_accounts`; add policies that enforce DSM scope | S2, S4 |
| W1-Session | Replace `x-session-id` UUID with signed HS256 JWT (15-min access + 7-day refresh in Edge Function); logout invalidates refresh; positive cache shrinks to 5s | S3 |
| W1-ApiGates | Add role gate to `api/farms`; add `stripMarginsIfNeeded` to `api/sap/sales/all.js`; sweep every `api/*` for missing auth-check (template via `_lib/auth.js`) | S5, S6 |
| W1-XssAudit | Patch `visit-wizard.js:442`; sweep all `innerHTML` uses across `js/`; standardize on single `escapeHtml` (kill the ~15 helper variants) | S7 |

**Cross-cutting (one agent after the 5 complete):**
- W1-Integration: Run `test:unit` + `test:e2e:all`; fix any breakage from PIN/session changes; add 4 new unit tests (signed-JWT verify, expired-JWT reject, RLS self-only, margin-strip on `/sap/sales/all`).

**Gate:** All tests green. Manual: log in as TSR / DSM / RSM / Admin; each role hits its surface; admin cannot see PIN field; CSV export does not contain PIN column.

**Commit boundary:** one commit per agent (atomic), final integration commit.

---

### Wave 2 — P0 Offline-First (1 day, 4 parallel agents)

**Goal:** Close every O-row. Visit-submission and DSM assignment survive every signal-drop scenario.

| Agent | Scope | Findings |
|---|---|---|
| W2-RetryClassify | Refactor `js/offline.js:70-84` to classify errors: transient (network, 5xx, timeout, PGRST116) → retry with backoff; permanent (PGRST204 schema, 4xx auth) → quarantine + surface to user (don't eject silently). Cap retries at 12 with exponential backoff, not 3 flat. | O1 |
| W2-QueueAllWrites | Route every Supabase write through `offline.js`: `updateStore`, `assignStores`, `assignFarms`, `bulkAssignAll`, profile edits, `last_visit_at` ticks. Add IDB tables for each. | O3, O4 |
| W2-PhotoFlow | Reorder photo flow: INSERT row first → upload photo → patch row with `photo_url`. If upload fails, row exists but `photo_url=NULL` (rescue-able). Clean up orphan blobs on retry. | O5 |
| W2-SyncTruthBadge | Single source of truth for sync state: `js/offline.js` exports `getSyncState()` → `{onLine, pending, syncing, lastError}`; all 3 places (`home-tsr.js`, `stores.js`, `visits.js`) consume it. No more parallel state. Add unit test for "offline pending=0 → don't show green tick". | O2, O6 |

**Cross-cutting:**
- W2-Integration: Real offline→reconnect drain test in Playwright; add quarantine-quarantine-recover test path.

**Gate:** New e2e: "TSR submits visit while offline, reloads page, comes online, sync drains, server confirms record." Must pass.

---

### Wave 3 — P0 TSR Non-Negotiables (½ day, 3 parallel agents)

**Goal:** Close every T-row. The "low-tech 45-year-old in Mindanao" can now use the app per CLAUDE.md §0.

| Agent | Scope | Findings |
|---|---|---|
| W3-Leaderboard | Cap `renderRankingsRest` / `renderRankingsTiered` to top N (default 3) + always show viewer's own rank as separate row. No bottom ranks ever surface to TSR/peer roles. DSM/RSM still see full rankings (their role allows it). | T1 |
| W3-NoLoadingTsr | Replace `Loading...` text at `app.html:1898,1902` with `.skeleton-row` pattern (already exists in `patrol.css:1970`). Sweep all TSR-path innerHTML for any remaining "Loading"/"Please wait"/spinner equivalents. | T2 |
| W3-RealDsm | Replace `seed % 11` mocks in `js/home-dsm.js:37-72` with real Supabase aggregates (per-TSR `getStoresVisitedThisMonth`, `getMyTeamStoreCount`, squad feed). Behind feature flag — fall back to empty state ("Wala pang aktibidad") if query fails, never to fake data. | T3 |

**Gate:** Visual review on real Android (1 DSM + 1 TSR session); 64px tap-target e2e (which is created in Wave 4 but pre-runs here as a guard).

---

### Wave 4 — P1 Test Coverage Gates (½ day, 4 parallel agents)

**Goal:** Make all Wave 1–3 work non-regressable.

| Agent | Scope | Findings |
|---|---|---|
| W4-PhotoBudget | Replace stub photo helpers in `tests/e2e/_helpers.ts:355-356`; new test asserts <50KB, ≤640×480, JPEG q≤0.5 from `js/camera.js` compression pipeline | E top-1 |
| W4-TapTargets | New e2e: enumerate every interactive control on TSR shell + visit form + store detail; assert `boundingBox().height >= 64` per CLAUDE.md Rule 3 | E top-2 |
| W4-OAuth | Real Google OAuth flow via mocked OIDC provider OR record/replay with Playwright; assert `@vienovo.ph` domain lock + `users.email` match + "No email" blocked-UI | E top-3 |
| W4-OfflineE2E | True offline→queue→reconnect→drain e2e; quarantine-and-recover; sync-badge truth assertion | E + W2 follow-up |

**Gate:** All new tests pass; existing 121+144 still pass; CI workflow includes new specs.

---

### Wave 5 — P1 Code Quality + UX Polish (1–2 days, 4 parallel agents)

**Goal:** Burn down the P1 backlog. After this wave the codebase looks like one team wrote it.

| Agent | Scope | Findings |
|---|---|---|
| W5-DeadCode | Purge dead code flagged by Agents A and B (dual NBA/streak, unused exports, dead CSS, orphaned phases) | A, B P2 |
| W5-Bundle | Move 140KB manager-only JS off TSR critical path (already partial — Chart.js/xlsx/sales-tab lazy; finish `rsm.css`, `phase4-social.css`, `phase3-sales-stores.css`) | A, B |
| W5-EscapeHelpers | Consolidate ~15 escape helper variants → one `js/_util/escape.js` import | A |
| W5-AdminPolish | C1 manager `.hdr-btn` 48px+ in `density-pass.css`; remaining inline `style="..."` cleanup in admin pages; B6 remaining lazy-load items | B P1 |

**Gate:** Bundle size measurement on TSR cold load (target ≤500KB cached per CLAUDE.md Rule 2); manual responsiveness check.

---

### Wave 6 — Phase C Commit + Production Smoke (¼ day, sequential)

**Goal:** Ship.

1. Squash Wave 1–5 commits into clean topic branches if not already.
2. Squash Phase C uncommitted work + Wave 0 docs into the final commit chain.
3. Tag `3.1.0-beta.2`.
4. `npm run test:unit` + `npm run test:e2e:all` green.
5. Deploy to Vercel preview (NOT prod).
6. Mat runs `PATROL_E2E_PROD=1 npm run test:e2e:prod-smoke` on preview URL.
7. **Only on Mat's explicit "ship it"** → promote preview → prod.
8. Tag handoff bundle for outside agent (if still planned): commit + zip + secrets handoff via secure channel (NOT chat).

---

## 4. Risk Register

| Risk | Mitigation |
|---|---|
| PIN re-hash migration locks out existing TSRs | One-time fallback: accept plaintext PIN once, write argon2 hash, force re-login. Or admin-driven reset with SMS notify. Choose at Wave 1 kickoff. |
| Real Supabase Auth sessions for TSR break `verify-pin` flow | Use Supabase anonymous sign-in + custom claim, OR keep PIN-issued JWT but make `auth.jwt()` extraction work in RLS. Decide at Wave 1 kickoff. |
| Wave 2 retry classification changes user-visible toast copy | Reuse existing trilingual labels in `locales/*.json`; add 3 new keys if needed. |
| Wave 3 real DSM aggregates are slow on first cold-load | Cache aggregates in IDB with 1h TTL; skeleton during fetch. |
| Wave 5 bundle changes break PWA service worker cache | Bump SW version; force update on next session; verify with `?nosw=1`. |
| Tests "pass" but production is broken (mocks drifting) | W4-OAuth + W4-OfflineE2E specifically replace mocks with real flows. |

---

## 5. What "100% Finished" Means in This Plan

**Pilot-safe (end of Wave 3):** Zero P0 in any audit. App can ship to 10–15 Champion TSRs without data loss or security incident.

**Polished / "100%" (end of Wave 5):** Zero P0 + zero P1. Codebase is maintainable, tests gate non-regressable behaviors, bundle meets data budget, docs match reality.

**Anything beyond (post-100%):** P2/P3 — backlog item for next milestone, NOT in this plan. Examples: Excel/PDF export, custom domain `patrol.vienovo.ph`, Messenger chatbot, GCS migration. These are explicitly out of scope here — they are CLAUDE.md "Backlog Still To Build" items, not "finish what's started".

---

## 6. Multi-Agent Orchestration Recap

**Wave-level parallelism:** 4–5 agents per wave run concurrently in a single message.
**Within-agent isolation:** each owns one file family; conflict-free.
**Integration agent** runs after each wave to merge, run tests, fix breakage.
**No agent commits to `main`.** Each writes to a topic branch (`fix/w1-pinhash`, `fix/w2-retry`, etc.), and the integration agent fast-forwards once tests pass. Final wave squashes for clean history.
**Tests are the contract.** Every wave adds or improves the test that locks its fix.
**Mat approves between waves.** Each wave's plan is presented in 5–10 lines before dispatch.

---

## 7. Decisions Locked (2026-05-21)

1. **PIN hashing → DEFERRED.** Test phase, keep TSR login flow simple. PINs stay plaintext at rest for now; argon2 migration moved to post-pilot.
2. **TSR Supabase Auth → anonymous sign-in + custom claim.** "Proper recommended way" per Supabase patterns. Architecture lands in W1 even though hashing is deferred — so future hash-migration is plug-in only.
3. **Phase C → commit at end of Wave 0** with docs.
4. **In-house, all 6 waves.** No outside-agent handoff.

### Revised Wave 1 scope (with PIN-hash dropped)

DROP: W1-PinHash (argon2 migration) → move to post-pilot backlog.

KEEP all other W1 agents AS-IS, with this addition:
- W1-RLS: still essential — locking `users.RLS` from `USING (true)` to admin-only-SELECT is required even with plaintext PINs, because the public anon key is in `config.js` and any external client can dump the table today. Edge Function `verify-pin` runs under service role, so login flow is unaffected.
- W1-Session: still essential — signed JWT replaces unsigned UUID; this is what makes Supabase anonymous-sign-in + custom claim actually trustable downstream.
- W1-TsrAuthArch (new): wire `verify-pin` to issue a Supabase anonymous session + stamp `user_id` as custom claim; RLS on `stores`, `visits`, `farms` switches to `auth.uid()`-based policies. (Subsumes part of original S4.)
- W1-RemovePinUi: remove PIN field from admin UI + CSV export (defense-in-depth even with plaintext at rest).

W1 agent count: 5 (PinHash dropped, TsrAuthArch + RemovePinUi added in its place).

---

*End of master plan. Total: 24 P0, 50 P1, 53 P2, 24 P3. Pilot gate at Wave 3 (~3 days). 100% gate at Wave 5 (+2 days).*

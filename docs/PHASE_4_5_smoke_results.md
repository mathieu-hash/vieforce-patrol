# Phase 4.5 Smoke Test Results

Date: 2026-04-29  
Tested commit: `a5ac882`  
Live URL: https://vieforce-patrol.vercel.app  
Tester: Cursor agent (automated) + Mat (sign-off pending)

## Deploy verification

- **Vercel**: Latest production deployment logged **Branch: main, Commit: `a5ac882`** (`vercel inspect` on newest deployment URL). Status **Ready** (~11s build).
- **Static assets (HEAD)**: `js/role-scope.js`, `js/home-tsr.js`, `js/home-dsm.js` → **200** from production origin.

## Matrix

| Account | Role | Home page rendered | Stories? | Bags visible? | Leaderboard tab? | Pass? |
|---------|------|---------------------|----------|---------------|------------------|-------|
| Demo TSR Alpha (`09180101001`) | tsr | `page-home-tsr` (routing + nav — see notes) | NO nav slot | Not observed in automation viewport | NO | **Pending Mat** |
| Demo TSR Beta (`09180101002`) | tsr | Not re-tested in this run | — | — | — | **Pending** |
| Windel Oliva (`09180000041`) | dsm | Not logged in this run | — | — | — | **Pending** |
| RSM (seed: `09180000010` Rina Morales — see note) | rsm | Not logged in this run | — | — | — | **Pending** |
| Mat / Exec (`09180000099` Mathieu Guillaume — seed file) | exec | Not logged in this run | — | — | — | **Pending** |

### Account note (repo vs. prompt labels)

- `supabase/migrations/sprint-a-test-accounts.sql` seeds **RSM** as **Rina Morales** (`09180000010`, PIN **1234**), not “Edfrey/Carminda”.
- **Windel** (`09180000041`): PIN is **not** defined in-repo (Windel must exist before `seed_windel_demo_team.sql` runs). Agent did **not** assume a PIN for production login.

## Screenshots

| Role | File |
|------|------|
| TSR Alpha (automation) | [`docs/smoke-phase45/tsr-alpha-home-automation.png`](smoke-phase45/tsr-alpha-home-automation.png) |

Automated Cursor browser: **bottom nav visible**, **Home active**, **no “Leaders” tab** (five items: Home / Stores / Visit / Activity / Me). Main content area appeared **empty/light gray** in automation screenshots — **Mat should confirm on a real incognito session** that `renderTsrHome()` content (greeting, Today’s plan, KPIs) paints correctly.

Screenshots for Beta, DSM, RSM, Exec were **not** captured in this pass; Mat should attach under `docs/smoke-phase45/` after manual login.

## Issues found

- **Automation limit**: Cursor Glass browser showed **blank main pane** for logged-in Demo TSR Alpha while Network showed successful Supabase `stores`/`visits` requests for the TSR user id — likely viewport/compositing in embedded browser, **not** proof of a prod bug. **Manual incognito verification required** per runbook.
- **Spec drift (RSM)**: Prior notes — RSM may route to `page-rsm-home` vs rich `page-home`; confirm with product spec in Phase 4.6 if needed (no code changes in this recovery).
- **Console**: No blocking errors observed in captured console list for the session (warnings only: Cursor dialog shim, `labels-v2` informational).

## Sign-off

- [ ] Mat reviewed all 5 screenshots  
- [ ] Mat approves production deploy  
- [ ] No blockers identified  

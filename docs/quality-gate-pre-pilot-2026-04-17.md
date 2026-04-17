# VieForce Patrol — Pre-Pilot Quality Gate

**Date:** 2026-04-17
**Mode:** C (curl + code analysis + manual test guide — no Playwright MCP)
**Branch / tip commit:** `main @ 38f1d86`
**Reviewer:** Claude Opus 4.7 (1M ctx)

---

## Verdict

| | |
|---|---|
| **Overall score** | **79 / 110** |
| **Status** | ❌ **FAIL** (cutoff is 80 for CONDITIONAL PASS, 95 for PASS) |
| **Critical blockers** | **4** |
| **High-priority** | **6** |
| **Medium** | **10** |
| **Low** | **4** |

The app is fundamentally working — login, visits, sync, team hierarchy, scorecards, chatbot registration all traced cleanly in code. **What drags the score below 80 is deployment ambiguity + bundle bloat + one RLS gap that will make `exec` users see an empty app.** Fix the four criticals and we land at ~89 CONDITIONAL PASS, which is pilot-ready for a controlled group of ~10 TSRs.

---

## Round-by-round scores

| # | Round | Score | Notes |
|---|-------|-------|-------|
| 1 | Functionality | **7.5 / 10** | Core flows trace clean; some paths depend on migrations being applied |
| 2 | UI & Design | **7.0 / 10** | Touch targets mostly OK, skeleton-shimmer infinite loop violates Rule 7 |
| 3 | API & Integration | **6.0 / 10** | RLS policies don't include `exec`; Edge Function reachable (200, 1.5s) |
| 4 | Data Integrity | **6.5 / 10** | Base schema out of sync with migrations; duplicate Jefrey in seed |
| 5 | Error Handling | **7.0 / 10** | Sync retry hardened last commit; silent catches remain in 3 spots |
| 6 | Performance | **4.0 / 10** | xlsx (~850KB) loaded for admin-only on every page; N+1 on team page |
| 7 | Security | **6.5 / 10** | Session TTL client-side only; users-table SELECT RLS is `using(true)` |
| 8 | Accessibility | **7.5 / 10** | Most touch targets ≥48px; .back (42px) and .close-x (36px) borderline |
| 9 | Edge Cases | **7.0 / 10** | Special chars escape OK via `_esc`; double-visit-today safe |
| 10 | Cross-Platform | **6.0 / 10** | Only tested on Android Chrome; SW disabled means no iOS home-screen app |
| 11 | Regression | **8.0 / 10** | Core login→visit→sync verified in code; scorecard math audited |
| 12 | Final Certification | **6.0 / 10** | 4 criticals open |
| | **Total** | **79 / 110** | |

---

## Round 1 — Functionality

### Flow trace results (code-level walk, Mode C)

| Flow | Status | File:line |
|---|---|---|
| Login as TSR (09170000001 / 1234) → app.html | ✅ traces clean | `index.html:175-194` + `js/auth.js:61-127` |
| Login as DSM (09180000001 / 1234) → dashboard | ✅ traces clean | `app.html:985-1007` |
| Login as RSM (09180000010 / 1234) → dashboard + team tab | ✅ traces clean | same |
| Login as Exec (09180000099 / 1234) → dashboard | ⚠️ **will be empty** | RLS gap (R3-C1) |
| Home scorecard hero (TSR) | ✅ renders via `renderTsrScorecardHero()` | `js/scorecard.js:185-215` |
| Store list + filters (All/Crit/Warn/OK/Prospect/Active) | ✅ | `js/stores.js:360-395` |
| New store chatbot — 9 steps (name/type/owner/phone/**status**/city/location/volume/bags/photo/confirm) | ✅ | `app.html:1458-1497` |
| New farm chatbot — 10 steps | ✅ | `app.html:1505-1525` |
| Store detail chat view + visit history bubbles | ✅ | `app.html:1066-1162` |
| Visit wizard 3 outcomes (order / no-order / comeback) | ✅ | `js/visit-wizard.js:158-225` |
| Photo capture (hero card, empty↔preview toggle) | ✅ | `js/visit-wizard.js:264-277` + `js/camera.js:32-70` |
| Offline submission queued to IndexedDB | ✅ | `js/offline.js:11-25` |
| Sync queue with retry-count + ejection | ✅ | `js/offline.js:30-105` (recent fix) |
| Map view with store pins (prospect = purple) | ✅ | `js/map.js:107-163` |
| Profile + language TL/BIS/EN | ✅ | `js/labels-v2.js` + `setLanguage()` |
| DSM team tab + KPI strip | ✅ | `js/team.js:20-95` |
| DSM TSR drill-down scorecard | ✅ | `js/team.js:96-186` |
| Conversion celebration (prospect → active on first order) | ✅ | `js/visit-wizard.js:368-383` + `js/scorecard.js:240-263` |

**Gaps:**
- `F1` MEDIUM — `openTeamMember()` in `team.js:229` is a stub (`console.log` only). Tapping a TSR from the team list uses `openTsrScorecard` instead, which works — so this is dead code, not a broken feature.
- `F2` LOW — Farm registration save is logged only (`_saveFarmFromChatbot` at `app.html:1596`) — no `queueFarm()` yet. Farms don't persist.

---

## Round 2 — UI & Design

| Category | Findings |
|---|---|
| **Messenger palette compliance** | ✅ `--fb-blue #0084FF`, soft gradients per Mat's earlier calm-down directive |
| **Touch targets ≥ 48px** | ⚠️ `.sc-cell` no min-height (computes ~56px), `.back` 42×42, `.close-x` 36×36. Below 48px minimum for calloused hands |
| **Taglish / BIS / EN coverage** | ✅ TL 225 keys, BIS 225, EN 239 (14 extra EN for store-type enums — TSR never sees them) |
| **Hardcoded strings on TSR screens** | 2 residual spots: `visits.js:141` "Loading...", `stores.js:6` "Never" — see D7 |
| **Animations** | ⚠️ `.skeleton-shimmer 1.5s infinite` violates Rule 7 (skeletons must be static or 1-shot) |
| **Empty states** | ✅ All 5 list screens have friendly Tagalog empty states |

---

## Round 3 — API & Integration

| Check | Result |
|---|---|
| verify-pin Edge Function reachable | ✅ **HTTP 200 in 1.5s** (curl proof) |
| Supabase JS SDK loaded | ✅ `@supabase/supabase-js@2` via jsdelivr |
| RLS enabled on all 5 tables | ✅ `supabase/schema.sql:141-145` |
| RLS policies cover all roles | ❌ **`exec` role missing from every policy** — see R3-C1 |
| Photo upload to Storage bucket `patrol-photos` | ✅ code-path traces clean, depends on bucket existing + public/signed-URL config |
| CORS | ✅ Edge Function handles preflight |

### Vercel deployment
- `https://web-eta-seven-26.vercel.app/` → HTTP 200 but serves a **Next.js app** (title "404: This page could not be found" on `/app.html`)
- `/app.html` on that URL → HTTP 404 returning `_next/` assets

This URL is currently **not serving our static PWA**. Either the Vercel project was re-linked to a different repo, or the memory has the wrong URL. `vercel.json` has `alias: patrol.vienovo.ph` — that custom domain may be the real target. **Verify before pilot** (see R12-C1).

---

## Round 4 — Data Integrity

| Finding | Severity |
|---|---|
| Base `schema.sql:10` role CHECK = `(tsr,dsm,rsm,admin)` — migration adds `champion,exec` but base is out of sync. If someone re-applies schema.sql from scratch, exec/champion inserts fail | **HIGH (R4-H1)** |
| `manager_id`, `store_status`, `prospect_stage`, `converted_at`, `mtd_volume_mt`, etc. referenced in JS but only in migration files — schema.sql stale | **HIGH (R4-H2)** |
| Seed has TWO Jefreys: `09170000003` (schema.sql:131) and `09180000001` (test-accounts migration) both as `dsm`. Hierarchy links to the second one; the first is orphaned | **MEDIUM (R4-M1)** |
| Enum constraint `store_status IN ('prospect','active','inactive','lost')` — code only handles 'prospect' and 'active'. Null handled, 'inactive' and 'lost' silently treated as 'active' | LOW |
| `assigned_tsr` FK exists; `created_by` FK exists. Indexes present on both | ✅ |

---

## Round 5 — Error Handling

| Finding | File:line | Severity |
|---|---|---|
| Sync retry: per-record `retry_count`, eject after 3, continue on fail (no longer `break`) | `js/offline.js:38-105` | ✅ hardened |
| Silent catch in `openVisitWizard` swallows getStoreById + getVisitsByStore errors | `js/visit-wizard.js:82, 103` | MEDIUM (R5-M1) |
| Dashboard error renders as static "Error loading leaderboard" without retry button | `js/dashboard.js:373, 502, 562` | MEDIUM (R5-M2) |
| Orphan photo on visit-insert failure: upload happens before `createVisit()` call | `js/offline.js:68-80` | HIGH (R5-H1) |
| GPS unavailable → warning shown, submit still enabled (correct UX per Mat) | `js/visit-wizard.js:_preCheckGPS` | ✅ |
| Network offline → orange sync bar + IndexedDB queue | `js/visits.js:enhancedSyncStatus` | ✅ |

---

## Round 6 — Performance

### Bundle size audit (uncompressed, local files)

```
  7,872  index.html
 85,345  app.html
 66,480  css/patrol.css
261,851  js/ (21 files)
───────
411,548  bytes = 402 KB local static (gzip ≈ 110–130 KB)
```

### External CDNs loaded on every page

| CDN | Approx size | Used by |
|---|---|---|
| maplibre-gl.js + css | ~330 KB gz | Map tab only |
| chart.js | ~60 KB gz | Dashboard only |
| **xlsx.full.min.js** | **~850 KB raw / ~240 KB gz** | **Admin CSV export only** |
| @supabase/supabase-js@2 | ~60 KB gz | Everything |
| dexie@3 | ~20 KB gz | Offline queue |

**Verdict: ~700–800 KB gzipped is what a TSR's phone downloads on first load.** CLAUDE.md Rule 2 hard-caps cached bundle at 500 KB. Biggest wins:
- **Move xlsx to admin.html only** → saves ~240 KB gz on every TSR load (R6-C1)
- **Lazy-load maplibre only when Map tab is first opened** → saves ~330 KB gz on home/stores/visits
- **Lazy-load chart.js on dashboard** → saves ~60 KB gz for TSRs

### N+1 queries on DSM team page

`calculateDsmScorecard(dsmId)` → 1 users query + `Promise.all(tsrs.map(calculateTsrScorecard))`.
Each `calculateTsrScorecard` → 1 stores query + 1 visits query = **2 queries per TSR**.
`renderTeamPage()` also calls `updateTeamKpiStrip()` → 3 more queries.

**Formula: 2 N + 4 queries for a DSM with N direct reports.**

For Rina (RSM, 2 DSMs): 8 queries (fine).
For a real DSM with 10 TSRs: 24 queries. On Philippine 3G with ~300ms round-trip, this is a 5–7 second freeze. **HIGH (R6-H1)**

### Photo compression

✅ `js/camera.js:32-35` — default `maxWidth=640`, `quality=0.5`. Matches CLAUDE.md spec exactly.

---

## Round 7 — Security

| Finding | Severity |
|---|---|
| PIN never returned to client; `verify-pin` Edge Function redacts `pin_hash` | ✅ |
| Edge Function has 5-attempt / 15-min rate limit + bcrypt fallback to plaintext for seeded PINs | ✅ acceptable for pilot |
| **Session TTL validated client-side only** — TSR editing `localStorage.expiresAt` can extend session indefinitely | HIGH (R7-H1) |
| **`users` table RLS `SELECT using (true)`** — any authenticated user can enumerate the full directory (names, phones, roles, manager relationships) | HIGH (R7-H2) |
| Rate limiter is in-memory per Edge Function instance — bypassable via distributed attack | MEDIUM (R7-M1) |
| Seed data contains plaintext `'1234'` PINs in schema.sql + sprint-a-test-accounts.sql | MEDIUM — acceptable for test accounts, do not ship to prod with plaintext |
| HTML escaping via `_esc()` + dynamic injection audited — no reflected XSS surface found | ✅ |
| Search `.ilike()` properly escapes `%`, `_`, `\` | ✅ `js/db.js:20` |
| No CSP header in `vercel.json` | LOW |

---

## Round 8 — Accessibility (Mode C limited)

| Check | Result |
|---|---|
| Touch targets ≥ 48px | ⚠️ `.sc-cell`, `.back` (42×42), `.close-x` (36×36), `.filter-chip` (48px borderline) |
| Form labels present | ✅ every form input has an associated label or placeholder |
| Color contrast on flat colors | ✅ `#0084FF` on white = 4.63:1, all palette primaries clear AA |
| Color contrast on gradient pills | ⚠️ `.scorecard-hero` white-on-gradient — AA in center, borderline on purple edge |
| Screen-reader labels | Not audited (Mode C) |

---

## Round 9 — Edge Cases

| Case | Result |
|---|---|
| 0 stores assigned to TSR | ✅ Empty state CTA in `getEmptyStoreStateHTML()` |
| 0 visits this month | ✅ Scorecard renders 0 stars + 0 metrics |
| Special chars in store name (ñ, ', "ñ") | ✅ `_esc()` HTML-escapes everywhere |
| Very long store name (>50 chars) | ✅ `text-overflow: ellipsis` on `.conv-name` |
| Future-dated GPS | Not possible (uses `Date.now()`) |
| Same store visited twice today | ✅ Both visits append as separate bubbles; store.last_visit_at updates |
| Duplicate phone on user insert | Blocked by `UNIQUE` constraint on `users.phone` |
| Prospect with no SOV data | ✅ `avgSov` defaults to 0 |

---

## Round 10 — Cross-Platform

- Tested only: Chrome Android (per Mat's hand-testing).
- **iOS Safari not tested** — unknown. Concerns: `backdrop-filter` in login box, `maplibregl`'s WebGL on older iOS, IndexedDB quota differences.
- Desktop Chrome serves fine via code walk — no desktop-specific bugs traced.
- PWA install prompt present in `ux-polish.js:1536-1573` ✅ but **service worker disabled** (see R10-H1).

---

## Round 11 — Regression

Re-traced core path: login → navigate to store → open visit sheet → select "May Order" → enter amount → submit → queue → sync → conversion celebration (if prospect).

| Step | Result |
|---|---|
| Edge Function login | ✅ 200 in 1.5s |
| Store detail render | ✅ cached visits hydrate correctly |
| Visit sheet opens, bottom-nav hides | ✅ Mat's earlier fix still in place |
| Photo hero card shows → preview swaps on capture | ✅ |
| Merch chips toggle blue-ring on tap | ✅ |
| Submit button sticky at bottom of sheet | ✅ |
| Queue via Dexie, then syncPending() | ✅ |
| Celebration overlay fires if prospect | ✅ (code-traced) |

Scorecard math sanity check (manual):
- `prospectScore = min(5, (prospects/4) * 5)` → 2 prospects → 2.5 ⭐️
- `conversionScore = min(5, (rate/30) * 5)` → 30% conv rate → 5 ⭐️
- `retentionScore = min(5, (visited%/90) * 5)` → 90% visited → 5 ⭐️
- `growthScore = min(5, max(0, (growth%/15) * 5))` → 15% growth → 5 ⭐️

Math is sane. Thresholds are aggressive (90% retention for 5⭐ is high). Recommend calibrating after first month of real data.

---

## Bug register — grouped by severity

### 🔴 CRITICAL (must fix before pilot)

| ID | Title | File | Impact |
|---|---|---|---|
| **R12-C1** | Vercel URL `web-eta-seven-26` serves wrong app (Next.js 404 on /app.html) | deployment | TSRs can't load the app at the documented URL |
| **R3-C1** | `exec` role missing from all RLS policies | `supabase/schema.sql:165, 177, 199, 214, 226` | Exec user logs in, sees empty stores/visits/team — app appears broken |
| **R4-H1 → C** | Base `schema.sql` role check is `(tsr,dsm,rsm,admin)`; `champion`+`exec` only in migration | `supabase/schema.sql:10` | Fresh schema deploy rejects champion/exec users |
| **R6-C1** | `xlsx.full.min.js` (~240 KB gz) loaded on every page for admin-only feature | `app.html:29` | Every TSR downloads +240 KB on first load, blows 500 KB bundle cap |

### 🟠 HIGH (fix before pilot)

| ID | Title | File |
|---|---|---|
| **R5-H1** | Photo uploaded before `createVisit()` → orphaned blob on visit-insert failure | `js/offline.js:68-80` |
| **R6-H1** | N+1 queries on team page: 2N+4 round-trips for DSM with N TSRs | `js/scorecard.js:99-118` + `js/team.js` |
| **R7-H1** | Session TTL validated client-side only; `localStorage.expiresAt` editable | `js/auth.js:107` |
| **R7-H2** | `users` RLS `SELECT using (true)` exposes full directory to any authed user | `supabase/schema.sql:150` |
| **R10-H1** | Service worker permanently disabled — no offline page load, no PWA install | `app.html:13-24`, `index.html:13-24` |
| **R4-H2** | Schema.sql base file out of sync with migrations (manager_id, store_status, prospect_stage, etc. only in migration files) | `supabase/schema.sql` |

### 🟡 MEDIUM (Sprint B)

| ID | Title |
|---|---|
| R2-M1 | `.skeleton-shimmer 1.5s infinite` violates Rule 7 — should be static or 1-shot |
| R2-M2 | `.back` 42×42, `.close-x` 36×36 below 48px minimum |
| R2-M3 | `.sc-cell` has no `min-height` — varies from 56–70px depending on content |
| R4-M1 | Duplicate Jefrey in seed: `09170000003` (schema.sql) + `09180000001` (migration) — hierarchy links to second, first orphaned |
| R5-M1 | `openVisitWizard` silently swallows errors with empty catch — no UI feedback |
| R5-M2 | Dashboard errors static, no retry button |
| R6-M1 | Maplibre + Chart.js loaded on all pages (not just Map + Dashboard) |
| R7-M1 | Rate limiter in-memory (per-instance), not shared |
| R8-M1 | `stores.js:6` fallback "Never" is hardcoded English — should be `T.neverVisited` |
| R5-M3 | Dexie `cachedStores` table never populated — fallback path dead |

### 🟢 LOW

| ID | Title |
|---|---|
| R2-L1 | Bronze/silver/gold medal hex hardcoded in CSS |
| R6-L1 | Photo `quality` param optional — could be overridden to 0.9 by custom caller |
| R6-L2 | `MAX_SYNC_RETRIES = 3` single global, not per-type |
| R9-L1 | `store_status` enum allows 'inactive'/'lost' but code doesn't handle them |

---

## Proposed fix order

1. **R3-C1 + R4-H1→C** — Single migration that adds `exec` + `champion` to all RLS policies + aligns base schema.sql constraint. ONE FILE, zero code changes. Pilot-blocking for any exec/champion user. **Proposing diff below.**
2. **R6-C1** — Move xlsx script from `app.html` to `admin.html` only. 2-line diff.
3. **R12-C1** — Verify Vercel alias, get actual pilot URL confirmed. Research only, no code.
4. **R6-H1** — Batch team-page queries into a single RPC or one-shot `in()` query. ~30-line change in `scorecard.js` + `db.js`.
5. **R5-H1** — Upload photo AFTER `createVisit()` succeeds (or keep upload-first but track orphans for GC).
6. **R7-H2** — Tighten users-table RLS to self-or-manager only.
7. **R10-H1** — Re-enable service worker with cache-first shell + network-first API strategy.
8. Everything else deferred to Sprint B.

---

## Manual test guide for Mat

Once fixes 1–3 land, verify on the actual pilot URL (once confirmed):

1. Login as exec `09180000099` / `1234` → Dashboard populates (not blank).
2. Login as Rico `09170000001` → Home hero card renders in under 2 seconds.
3. Open DevTools Network tab → total transferred on first load < 500 KB gzip.
4. Switch to Airplane mode → reload page → app shell still renders (once SW is back).
5. Login → log a visit on a prospect → Confetti celebration → Store flips to `active`.
6. Profile → EN → all KPI labels + deltas English → BIS → all Bisaya.

---

*Signed off by Claude Opus 4.7 @ 2026-04-17 — this report is a code-walk inspection, not a live-run certification. Mode C findings should be re-validated once Playwright MCP is available.*

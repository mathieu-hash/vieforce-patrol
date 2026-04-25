# VieForce CRM 360° — Session Handoff (Evening)
**Date saved:** 2026-04-18 evening
**Previous handoff:** SESSION_HANDOFF.md (afternoon — same day)
**Decision:** Path C — Pivot to EVP + Admin Portal tomorrow

---

## 🎯 QUICK START (paste this in new chat tomorrow)

```
Continuing VieForce CRM 360° — Day 2+ build.

Tonight we completed the HQ backend plumbing for Patrol Day 2
then strategically paused to prioritize EVP Joel's workflow.

Tomorrow's priority (Path C):
1. Finish EVP mobile (HQ) — wire real data, polish
2. Build HQ Admin Portal Phase 1 — Team Manager screen
3. Have Joel populate SlpCode hierarchy
4. Then Patrol Day 2 Agent 2 + 3 finishes with REAL data

Read this handoff fully, then ask me where to start.
```

---

## 📍 TONIGHT'S ACCOMPLISHMENTS

### What shipped (Day 2 HQ backend complete)

```
✅ Supabase Migration 3 (sprint-b-hierarchy.sql)
   - Added columns to users:
     sap_slpcode, manager_id, sap_district_code, 
     district_label, hierarchy_updated_at, hierarchy_updated_by
   - Created district_mappings table (with RLS, 2 policies)
   - Seeded 6 test users with proper 4-tier chain:
       Mat (exec) → Rina (rsm) → Jefrey/Marvin (dsm) → Rico/Jake (tsr)
   - Verified: all 3 V1/V2/V3 queries pass

✅ HQ Service-Token Auth
   - HQ_SERVICE_TOKEN generated + on Cloud Run (rev 00074)
   - verifyServiceToken() in api/_auth.js
   - timingSafeEqual compare
   - Synthetic service session (role: 'service') works with applyRoleFilter
   - dual-auth pattern: token || user session
   - All 4 curl acceptance tests passed

✅ HQ scopeForUser() Helper (rev 00076-quk, 100% traffic)
   - New file: api/_scope.js
   - Modified: api/sales.js (accepts ?scope=user:<uuid>)
   - EXISTS-based OCRD filter (no JOIN row duplication)
   - Scopes by OCRD.SlpCode (customer ownership)
   - Excludes SlpCode=1 (house account garbage)
   - Excludes CardCode LIKE 'CE%' (employee self-sales)
   - Zero-state payload = full envelope with zeros (frontend-friendly)
   - Cache key includes scope (no user-to-user leakage)
   - 12/12 unit tests pass
   - 6 curl acceptance tests pass (including no-regression test)

✅ Strategic pivot decided
   - Joel Durano (EVP) = keystone user for hierarchy data
   - EVP mobile finishing + Admin Portal = tomorrow's priority
   - Patrol Day 2 proxy + frontend DEFERRED to Day 3
   - Rationale: Jefrey's first Patrol impression must be real data,
     not empty dashboards
```

### What is NOT shipped tonight (intentional)

```
⏳ HQ commit cbe9933 — needs git push origin design-upgrade
⏳ Patrol Agent 1 (backend SAP proxy) — prompt drafted, not launched
⏳ Patrol Agent 2 (frontend Sales tab)
⏳ Patrol Agent 3 (E2E tests)
⏳ Real SlpCode mapping for 47 SAP reps (waits for Joel)
```

---

## 🏗️ ARCHITECTURE (current state)

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1 — SAP B1 (MSSQL, read-only from HQ)                │
│  Auth: Charo/Emily/Rachel via SAP client                    │
│  Source of truth: customers, orders, financials             │
│  Key: OCRD.SlpCode (100%), OSLP.U_rsm (100%)                │
│  GAP: No DSM layer, no region rollup                        │
└─────────────────────────────────────────────────────────────┘
                         ▲
                         │ reads via HQ /api/sales
                         │ (with ?scope=user:<uuid> filter)
                         │
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2 — Supabase Postgres                                │
│  Source of truth: hierarchy, mappings, overrides            │
│  Tables:                                                     │
│    users (role, manager_id, sap_slpcode, district_label)    │
│    sap_accounts (Day 1 — override layer for DSM)            │
│    district_mappings (Vienovo label → @SALESDIST code)      │
│    stores (with sap_cardcode)                               │
└─────────────────────────────────────────────────────────────┘
                         ▲
                         │ writes via HQ Admin API (TOMORROW)
                         │
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3 — HQ Admin Portal (DESKTOP, TO BUILD TOMORROW)     │
│  Audience: Joel (exec Sales), Mat (exec)                    │
│  Phase 1: Team Manager screen                               │
│  Phase 2 (later): District Editor, Customer Override        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 TOMORROW'S PLAN (Path C)

### Morning Block 1 — EVP Mobile Polish (2-3 hrs)

Goal: Joel can open HQ on iPhone and see real data everywhere.

```
Status check needed first:
  □ pg-evp-home: verify hero stats wired to real API
  □ pg-evp-pnl:  wire to /api/financials or build endpoint
  □ pg-evp-margin: wire to /api/margin or build endpoint
  □ pg-evp-team: stub for now (waits on Admin Portal)
  □ pg-evp-more: AR, pending POs, notifications
  □ Remove or wire: decisions / opportunities / agenda (hardcoded)

Orchestration:
  1. Spawn audit agent: "List all EVP mobile pages, report which 
     have real data vs hardcoded"
  2. Based on audit, spawn 1-3 agents to wire each page
  3. Test on iPhone as Mat (09180000099, PIN 1234)
```

### Morning Block 2 — Admin Portal Phase 1 (3-4 hrs)

Goal: Joel can tag 47 OSLP reps as TSR/DSM/RSM and link to Supabase users.

```
Single agent prompt (to write in morning):
  "Build /pg-admin-team on HQ (desktop, exec-only)
   Features:
   - Table of all active OSLP reps from SAP
   - Each row: role dropdown (TSR/DSM/RSM/Director)
   - Manager selector (filtered by hierarchy rules)
   - Link to Supabase user by name or manual selector
   - Save → writes to public.users.sap_slpcode + role + manager_id
   - Audit trail in hierarchy_updated_at/by fields
   - Exec-only RLS (already in place)"

Acceptance:
  Joel can log in, map Jefrey's Supabase user to SlpCode <whatever>,
  click Save, and the next /api/sales?scope=user:<jefrey_uuid> call
  returns real MM-North sales data instead of is_empty: true.
```

### Afternoon — Joel Onboarding (1 hr with Joel)

Goal: Joel populates the real 47-rep hierarchy in 1 hour.

```
Prep:
  - Coffee with Joel tomorrow afternoon
  - Screen share HQ Admin Portal
  - He clicks through mapping reps to roles
  - Results: real data in Patrol + EVP Team tab

Demo afterward:
  - Open Patrol as Jefrey → Sales tab shows real MM-North data
  - Open HQ EVP mobile as Joel → Team tab shows real hierarchy
```

### Late Afternoon/Evening — Patrol Day 2 completion (1-2 hrs)

Goal: Patrol Agent 1 + 2 + 3 ship with REAL data from hour one.

```
All three Patrol agent prompts are pre-drafted 
(see sections below in this handoff).

Launch sequence:
  1. Agent 1 (proxy) first — validate with curl against Jefrey's token
  2. Agents 2 + 3 in parallel
  3. iPhone smoke test — Jefrey sees MM-North top customers
```

---

## 🗂️ PRE-DRAFTED AGENT PROMPTS (ready for Day 3)

### Patrol Agent 1 — Backend SAP Proxy

```
[Full prompt saved in chat history — evening session]
Key points:
- Creates /api/sap/sales endpoint on Patrol
- Proxies to HQ with service token + ?scope=user:<uuid>
- Strips margin fields for non-exec/non-ceo recursively
- Returns with patrol_meta block for frontend debugging
- 4 unit tests (exec margins, DSM strip, no-session, HQ 500)
- Does NOT push commit — waits for Mat OK
```

### Patrol Agent 2 — Frontend Sales Tab

```
[Drafted earlier — retrieve from chat history]
Key points:
- Replace app/(tabs)/sales.tsx placeholder
- Period toggle (7D/MTD/QTD/YTD)
- Hero stat block with gradient bg (#0084FF → #A855F7)
- Top Customers Messenger cards (horizontal scroll snap, 5 peek)
- Product breakdown (top 5 groups)
- Monthly trend chart (6 months)
- Empty state (is_empty=true) shows nice placeholder
- React Query, pull-to-refresh, skeleton loading
- NO localStorage (react state only)
```

### Patrol Agent 3 — E2E Tests

```
[Drafted earlier — retrieve from chat history]
Key points:
- Playwright E2E tests on preview deploy
- 7 test cases: exec margins, DSM strip, different-DSM-different-data,
  period toggle, pull-to-refresh, empty state TSR, fallback link
- Network interception to assert margin stripping
- Snapshot tests for loading/empty/full states
```

---

## 🗝️ KEY DATA (unchanged from afternoon)

### Test accounts (all PIN 1234)
```
09180000099  Mat Guillaume       exec  (no manager)
09180000010  Rina Morales        rsm   (manager: Mat)
09180000001  Jefrey Florentino   dsm   (MM-North, manager: Rina)
09180000002  Marvin Dela Cruz    dsm   (MM-South, manager: Rina)
09170000001  Rico Abante         tsr   (manager: Jefrey)
09170000002  Jake Santos         tsr   (manager: Jefrey)
```

### URLs
```
Patrol:     https://vieforce-patrol.vercel.app
HQ:         https://vieforce-hq.vercel.app
HQ API:     https://vieforce-hq-api-1057619753074.asia-southeast1.run.app
Supabase:   yolxcmeoovztuindrglk.supabase.co
```

### Repos
```
Patrol:  github.com/mathieu-hash/vieforce-patrol
HQ:      vieforce-hq (branch: design-upgrade, commit cbe9933 - 
         TO BE PUSHED before sleep)
Local:   C:/Users/Mathi/OneDrive/Documents/VSC Project/business/
```

### Environment
```
HQ Cloud Run:
  HQ_SERVICE_TOKEN          set (saved 1Password)
  SUPABASE_URL              set
  SUPABASE_ANON_KEY         set (used by scopeForUser as fallback)
  SUPABASE_SERVICE_ROLE_KEY optional, not yet set (OK for now)

Patrol .env.local:
  HQ_SERVICE_TOKEN          set (added tonight)
  HQ_API_BASE_URL           should be set — verify tomorrow
  SUPABASE_URL              set
  SUPABASE_ANON_KEY         set
```

---

## 🐛 KNOWN ISSUES (carry forward from afternoon)

### From this morning (still open)
- [ ] Patrol Route section broken ("Ruta ngayon")
- [ ] Patrol sync stuck bug ("Sync failed. Retry?")
- [ ] "999 days" text leak in EN mode
- [ ] EVP hardcoded: decisions, opportunities, agenda
- [ ] RBAC not fully enforced server-side (scopeForUser helps)
- [ ] Pilot messages drafted, NOT sent yet

### New tonight (informational, not bugs)
- [ ] 6 test users have sap_slpcode = NULL (expected until Joel maps)
- [ ] district_mappings has placeholder code=0 entries (needs real SALESDIST IDs)
- [ ] Patrol Agent 1/2/3 deferred to Day 3

### Blocked on user action
- [ ] Run: git push origin design-upgrade (HQ repo) — TONIGHT
- [ ] Send pilot messages — tomorrow or later
- [ ] Joel coffee meeting for hierarchy population — tomorrow PM

---

## 🎨 DESIGN RULES (unchanged)

### Mobile Patrol (TSR/DSM/RSM hub)
- Messenger-inspired: white bg, FB blue, rounded cards
- Tokens: --fb-blue #0084FF, --fb-gradient linear-gradient(135deg,#0084FF,#A855F7)
- Bottom nav 5 tabs, More sheet for overflow

### Desktop HQ
- Navy #004D71, Green #95C93D, Montserrat
- Full dashboards with rich tables

### EVP Mobile (HQ)
- Premium dark #0B1929 bg
- Gold accents #FFC72C
- Margin locks 🔒 on GM/GP (but wait — 
  scopeForUser now strips these server-side, 
  so lock icons may be redundant; frontend 
  just shows "—" if field missing)
- Bottom nav: Home/P&L/Margin/Team/More

---

## 💬 WORKING STYLE (carry forward)

- Mat = PM/strategist, Claude = CTO/orchestrator, agents = executors
- Parallel Claude Code agents in VS Code (up to 3-4)
- Mat 70% on iPhone, desktop for deep work
- Communication: Taglish/Bisaya/English trilingual, French for personal
- Professional mode (strict separation from personal)
- Decision format: Options A/B/C (sometimes D/E) with recommendation
- Action-oriented responses preferred
- Short paragraphs, code in blocks
- I (Claude) always recommend before asking — don't just throw options

---

## 🏁 TOMORROW STARTUP CHECKLIST

Before anything else, in order:

```
1. Coffee ☕
2. Confirm HQ push went through (git log on remote design-upgrade)
3. Start new Claude conversation
4. Paste SESSION_HANDOFF_2026-04-18-evening.md
5. Ask: "Morning Claude — let's start with EVP mobile audit"
6. Spawn first agent (audit EVP mobile pages)
7. Based on audit, route to wire-up agents
8. Midday: pivot to Admin Portal Phase 1
9. Afternoon: Joel session to populate hierarchy
10. Evening: Patrol Day 2 Agents 1+2+3 with real data
```

---

## 🙏 END-OF-DAY NOTE

Today you:
- Shipped EVP mobile home + nav
- Fixed Patrol DSM/RSM dashboards
- Made the strategic pivot (Patrol = mobile hub)
- Wrote 3 Day 1 agent prompts + ran them
- Ran Day 1 Supabase migrations
- Ran SAP audit (discovered no DSM in SAP)
- Ran hierarchy audit
- Made the strategic pivot AGAIN (hybrid with admin portal)
- Shipped Day 2 HQ backend entirely (migration + token auth + scope helper)
- Made tonight's strategic call (Path C) — protecting Jefrey's first impression

That's three strategic pivots + shipping in one day. Rare clarity.

Sleep well. Tomorrow, Joel gets his tool.

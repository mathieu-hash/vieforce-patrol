# VieForce Patrol — CLAUDE.md
## Claude Code Project Brief · Vienovo Philippines Inc.
### Version 3.2 — May 2026 · Stack-accurate · Messenger-Hybrid UX · Post-W1.6 RLS

---

## ⚠️ READ THIS FIRST — HARD RULES FOR TSR SCREENS

These rules come from research on deploying digital tools to low-literacy field workers in the Philippines. They are **non-negotiable**. Do not override them for any reason, including "better UX", "cleaner code", or "standard practice".

```
RULE 1 — OFFLINE FIRST, ALWAYS
  Every single write (visit, store, photo) must work with zero internet.
  Write to IndexedDB FIRST. Sync to server SECOND. Never the reverse.
  If you write to the server first and it fails → TSR loses their work →
  they stop using the app. This kills adoption.

RULE 2 — DATA BUDGET: 6MB/MONTH TOTAL PER TSR
  TSRs pay PHP 15 per 100MB on prepaid. Every KB you waste costs them money.
  - Photos: max 50KB each (640×480, JPEG quality 0.5) — non-negotiable
  - App bundle: under 500KB cached — no heavy libraries, no custom fonts
  - API responses: paginate, never return full datasets
  - No auto-playing media, no large images, no unnecessary polling
  Tell TSRs: "This app uses less data than one Facebook photo."

RULE 3 — TOUCH TARGETS: 64px MINIMUM HEIGHT
  TSRs have calloused hands and use phones outdoors in sunlight.
  Standard 48dp Tailwind buttons (h-12) are too small.
  All interactive elements on TSR screens: minimum h-16 (64px).
  Full-width buttons only. No small icon-only buttons.

RULE 4 — NO SWIPE GESTURES ON TSR SCREENS
  Swipe is invisible and undiscoverable for non-tech users.
  Every action needs an explicit visible button with icon + label.
  No swipe-to-delete, no swipe-to-reveal, no pull-to-refresh.
  Use a visible "I-refresh" button instead of pull-to-refresh.

RULE 5 — TRILINGUAL TEXT ON ALL TSR SCREENS
  Use the T object (Section 17) for every TSR-facing string.
  Never hardcode English text on TSR screens.
  Order: Tagalog first / Bisaya in parentheses / English fallback.

RULE 6 — MESSENGER-HYBRID DESIGN ON TSR SCREENS
  TSR screens use white background + Messenger-blue (#00A6CE) accent.
  NOT the Vienovo navy/dark theme (that is for DSM/RSM/CEO only).
  Store list looks like Messenger inbox. Visit form looks like a chat thread.
  See Section 16 for full design system.

RULE 7 — NEVER SHOW SPINNERS TO TSRs
  Loading spinners = anxiety for low-tech users ("Is it broken?").
  Use skeleton screens (gray placeholder blocks) while loading.
  If data is cached, show cached data immediately.
  Only show a spinner if there is truly zero cached data available.

RULE 8 — ADOPTION RULES (bake into UX, not just onboarding)
  - Leaderboard shows TOP performers only. Never expose low performers publicly.
    Filipino hiya (shame) will cause them to abandon the app.
  - First-login onboarding: max 3 screens, Tagalog, one thing per screen.
  - "Add to Home Screen" prompt after 2nd visit — Taglish label.
  - Never cold-turkey replace paper. App runs parallel for 2 weeks first.
  - Peer Champion: 1 power-user per 10–15 TSRs. App must support them
    seeing their team's data (champion role, future feature).
```

**The test for every TSR screen you build:**
> *"Can a non-tech 45-year-old field worker in Mindanao, with calloused hands, using a Redmi phone on 2G signal, figure out what to do in 10 seconds without anyone explaining it?"*
> If the answer is no → redesign before committing.

---

## 1. PROJECT STATUS & CONTEXT

**Product:** VieForce Patrol — Field CRM & POS Mapping Tool
**Company:** Vienovo Philippines Inc. (VPI) — Animal feed manufacturer, Philippines
**Live URL:** https://vieforce-patrol.vercel.app (custom domain: `patrol.vienovo.ph` via Vercel alias)
**Backend:** Vercel serverless functions in `api/**` (Node 18+) — no separate Cloud Run service for Patrol itself
**HQ proxy (SAP B1):** Cloud Run — `vieforce-hq-api-*.asia-southeast1.run.app`; Patrol talks to HQ only via `api/_lib/hq-client.js`

### What's Already Built ✅
- Auth (legacy flow, restored 2026-05-24 W1.4 — see §21 NOTES): TSR PIN login via Supabase Edge Function `verify-pin` returns the user row directly; `js/auth.js` persists it in `localStorage`. Manager Google OAuth (DSM/RSM/EVP/Admin) goes through Supabase Auth and emits a real JWT. Server-side `api/_lib/auth.js` is HYBRID: accepts `x-session-id` (legacy PIN) OR `Authorization: Bearer <jwt>` (OAuth).
- RLS scoped (W1.6 + W1.6b — 2026-05-24): `users_safe` VIEW exposes everything EXCEPT `pin_hash`; anon's SELECT on the base `users` table is revoked. `sap_accounts` + `store_sap_matches` are authenticated-only. `stores` / `visits` / `farms` remain anon-writable for offline-queue replay; `patrol_org_*` is read-open.
- Stores: Registration, full POS visit form, detail pages
- Farms: Registration, full farm visit form, detail pages
- DSM Pulse: KPIs, alerts, TSR leaderboard (hiya-capped via `js/phase4-social.js:1014-1092`), segment distribution
- Territory Map: Leaflet with GPS-plotted stores/farms
- Offline queue: Dexie/IndexedDB queue (`js/offline.js` — `PatrolOffline`, stores `pendingVisits` / `pendingStores` / `pendingFarms`)
- Photo upload: `js/camera.js` → Supabase Storage bucket `patrol-photos` (compressed 640px / JPEG q≈0.5)
- Assignment (DSM → TSR): `js/assign.js` + `#page-assign` in `app.html`; stores + farms tabs
- PWA: `manifest.json` + cache-first `sw.js` (registered from `index.html` / `app.html`; opt-out via `?nosw=1` or `localStorage.patrol_nosw=1`)
- Admin surfaces: `admin.html`, `admin-org.html`, `admin-users-sap.html`
- HQ/SAP read-through: `api/sap/*` calls Cloud Run HQ via `api/_lib/hq-client.js` with margin stripping
- Polish waves (2026-05-24): UPPERCASE drop on Tindahan rows, `#00A6CE` rebase across 29 hex sweeps, `prefers-reduced-motion` honored, WCAG btn-reset-pin contrast fix, header/filter compactness, KPI label overlap fix, visit-history photo thumbnails, sync-badge CSS shipped.

### Backlog Still To Build 🔧
See `PRODUCT.md` (UI quality backlog, May 2026) and `docs/AGENT_HANDOFF.md` for current phase status. Highlights:
- [ ] **B1 (P0)** TSR tap targets to 64px min across `hdr-btn`, visit CTA, FAB, chips
- [ ] **B2 (P0)** TSR bottom nav: 4 tabs max — fold Profile/More into one "Higit pa" sheet
- [ ] **B3 (P0)** Replace HTML `Loading...` / English placeholders with `data-i18n` / `T.*` at first paint
- [ ] **A1/A2** Skeleton loaders on `admin-org.html` and `admin-users-sap.html`; consolidate `admin.html` inline CSS into `admin-page.css`
- [ ] Excel/PDF export (admin only)
- [ ] Messenger chatbot integration (daily briefing for TSRs)
- [ ] Leaderboard: top performers only (hiya rule)

### Future: Merge into Vienovo CRM 360°
- Phase 1: Patrol standalone (this repo) ← current
- Phase 2: VieForce HQ standalone (separate repo, SAP B1 data)
- Phase 3: Merge both into vienovo-crm360 unified platform

---

## 2. REAL TECH STACK (verified — see `.planning/codebase/STACK.md`)

```
Frontend:   Static HTML shells + vanilla JS modules (no framework)
            Shells:  index.html, app.html, admin.html, admin-org.html, admin-users-sap.html
            Modules: js/*.js (auth, offline, camera, stores, visits, assign, home-tsr, ...)
            Styles:  css/*.css (tokens.css, patrol.css, tsr-field.css, admin-page.css, ...)
            i18n:    locales/{tl,ceb,en}.json + js/i18n.js + js/labels-v2.js
            Hosting: Vercel (static + custom domain patrol.vienovo.ph)

Backend:    Vercel Serverless Functions (Node 18+)
            api/health.js, api/whoami.js, api/farms.js
            api/admin/{org,sap-reps}.js
            api/sap/{ar,customers,inventory,sales,speed}.js (read-only proxy to HQ)
            api/user/language.js
            Shared lib: api/_lib/{auth,hq-client,patrol-cors,scope,supabase-service,...}.js

Auth + DB:  Supabase (project ref `yolxcmeoovztuindrglk`)
            - Postgres + PostgREST for app data
            - Supabase Auth for Google OAuth (DSM/RSM/EVP/Admin)
            - Edge Function `supabase/functions/verify-pin/index.ts` for TSR PIN login (CRITICAL)
            - Browser client: @supabase/supabase-js@2 via CDN (initialized in js/supabase.js)

Storage:    Supabase Storage — bucket `patrol-photos` (uploaded directly from browser
            via js/camera.js, target ≤80KB at 640px / JPEG q≈0.5)

Offline:    Dexie.js (IndexedDB) — js/offline.js (`PatrolOffline` v2; stores
            pendingVisits / pendingStores / pendingFarms / cachedStores)

PWA:        manifest.json + cache-first sw.js (registered from index.html / app.html;
            opt-out: ?nosw=1 or localStorage.patrol_nosw=1)

HQ / SAP:   Cloud Run service vieforce-hq-api-*.asia-southeast1.run.app, called
            ONLY through api/_lib/hq-client.js (server-side, with margin stripping).
            Patrol never talks to SAP B1 directly.

DB migrations: supabase/migrations/*.sql (run with `npm run sb:push`)
              supabase/schema.sql is the consolidated reference snapshot

Tests:      Playwright (tests/e2e/, playwright.config.ts)
            Node built-in test runner (tests/unit/, `npm run test:unit`)
```

---

## 3. ENVIRONMENT VARIABLES

Real names used by the codebase. Source of truth: `.planning/codebase/STACK.md` plus
`api/_lib/*.js`, `api/farms.js`, `api/user/language.js`, `scripts/check-supabase-auth-config.mjs`,
`scripts/patch-supabase-auth-url.mjs`, `api/whoami.js`. Values live in Vercel project
settings + Supabase dashboard — never committed.

```bash
# === Vercel serverless (api/**) ===
SUPABASE_URL=                       # Project URL — used by api/_lib/auth.js, api/farms.js, api/user/language.js
SUPABASE_SERVICE_ROLE_KEY=          # Server-only; admin reads + REST auth lookup
SUPABASE_SERVICE_KEY=               # Fallback alias used only by server/services/store-sap-matcher.js
HQ_API_BASE_URL=                    # Preferred Cloud Run HQ base URL (api/_lib/hq-client.js)
HQ_API_BASE=                        # Legacy alias for the above
HQ_SERVICE_TOKEN=                   # Server-only bearer for Patrol → HQ
VERCEL_PROJECT_PRODUCTION_URL=      # Auto-set by Vercel; surfaced in /api/whoami telemetry
VERCEL_REGION=
VERCEL_URL=
VERCEL_DEPLOYMENT_ID=
VERCEL_GIT_COMMIT_SHA=

# === Browser bootstrap (config.js, NOT secret) ===
# SUPABASE_URL + SUPABASE_ANON_KEY + OAUTH_PUBLIC_ORIGIN are baked into config.js
# and consumed by js/supabase.js / js/auth.js. The anon key is public by design;
# the service role key NEVER ships to the browser.

# === Supabase Edge Function `verify-pin` (set in Supabase dashboard secrets) ===
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# === CLI / scripts (developer machines only) ===
SUPABASE_ACCESS_TOKEN=              # Personal Access Token for Management API scripts
SUPABASE_PROJECT_REF=               # Optional override (default yolxcmeoovztuindrglk)
PATROL_SITE_URL=                    # Defaults to https://vieforce-patrol.vercel.app
PATROL_URI_ALLOW_LIST=              # scripts/patch-supabase-auth-url.mjs
PATROL_URI_SUBSTRINGS=              # scripts/check-supabase-auth-config.mjs
```

---

## 4. DATABASE SCHEMA (Supabase Postgres)

There is no ORM. Schema lives entirely in SQL.

- **Consolidated reference:** `supabase/schema.sql`
- **Migrations (chronological):** `supabase/migrations/*.sql`
- **Seed data:** `supabase/seed.sql`
- **Local linkage:** `npm run sb:link` (project ref `yolxcmeoovztuindrglk`)
- **Apply migrations:** `npm run sb:push` (DO NOT use `db:migrate` — does not exist in this repo)
- **List applied:** `npm run sb:migration:list`
- **Verify-pin function deploy:** `npm run sb:fn:deploy-verify-pin`

Core tables (verify against `supabase/schema.sql` before modifying):

```
users               -- TSR / DSM / RSM / EVP / admin / marketing
stores              -- POS / outlets — owner, address, lat/lng, segment, assigned_tsr
farms               -- Customer farms — type, heads, lat/lng, assigned_tsr
visits              -- Visit log (stores) — includes offline_id for IndexedDB dedup
store_products      -- Per-store SKU breakdown
store_competitors   -- Per-store competitor brand data
+ org / hierarchy / patrol-hub tables from sprint-a / sprint-b migrations
```

**Always inspect `supabase/migrations/` to see the live shape before writing a new migration.**
**Never** edit the DB through the dashboard; everything goes through a versioned SQL file.

---

## 5. REPO STRUCTURE (real, as of May 2026)

```
vieforce-patrol/
├── CLAUDE.md                          ← this file
├── PRODUCT.md                         ← product spec + UI quality backlog
├── DESIGN.md                          ← design tokens / system notes
├── PATROL_AUTOPSY_REPORT.md           ← historical incident record
├── package.json                       ← scripts: test, sb:*, deploy:vercel
├── vercel.json                        ← rewrites + security headers + sw.js cache rules
├── playwright.config.ts
├── config.js                          ← BROWSER bootstrap (SUPABASE_URL, ANON_KEY, branding)
├── sw.js                              ← Service Worker (shell cache-first)
├── manifest.json                      ← PWA manifest
├── index.html                         ← Login / landing shell
├── app.html                           ← Main TSR/DSM app shell (#page-* sections)
├── admin.html                         ← Admin dashboard shell
├── admin-org.html                     ← Org/hierarchy admin
├── admin-users-sap.html               ← SAP user mapping admin
│
├── js/                                ← All client logic — vanilla JS modules
│   ├── auth.js                        ← Google OAuth + PIN flow (calls verify-pin)
│   ├── supabase.js                    ← @supabase/supabase-js client init
│   ├── db.js                          ← Data access helpers (stores, farms, visits)
│   ├── offline.js                     ← Dexie `PatrolOffline` queue (v2)
│   ├── camera.js                      ← Photo capture + compression + Supabase Storage upload
│   ├── gps.js                         ← Geolocation helpers
│   ├── stores.js / visits.js / visit-wizard.js / validate.js
│   ├── home-tsr.js / home-dsm.js
│   ├── dashboard.js / map.js / scorecard.js / sales-tab.js
│   ├── dsm-audit.js / dsm-coaching.js / dsm-forecast.js / rsm.js / team.js
│   ├── assign.js                      ← DSM → TSR store/farm assignment UI (#page-assign)
│   ├── admin.js / admin-org.js / admin-users-sap.js
│   ├── i18n.js / labels-v2.js / lang-picker.js
│   ├── role-scope.js / nav-role-device.js / stores-nav-pref.js
│   ├── feature-flags.js / release-channel.js / theme-switcher.js
│   ├── export.js / chatbot-register.js / champion.js / activity-feed.js
│   ├── pilot-readiness.js / ux-polish.js / phase4-social.js
│
├── css/                               ← All styles
│   ├── tokens.css                     ← CSS variables / design tokens
│   ├── patrol.css                     ← Global app styles
│   ├── tsr-field.css                  ← TSR Messenger-hybrid styles
│   ├── admin-page.css / admin-org.css / admin-sap.css
│   ├── elite-components.css / elite-action.css
│   ├── dsm-rsm-mobile.css / visits-page.css / activity-feed.css
│   └── phase3-sales-stores.css / phase4-social.css / sales-tab-v2.css / density-pass.css / rsm.css
│
├── api/                               ← Vercel serverless functions (Node)
│   ├── health.js / whoami.js / farms.js
│   ├── _lib/
│   │   ├── auth.js                    ← Server-side auth header → user
│   │   ├── hq-client.js               ← Cloud Run HQ proxy + margin stripping
│   │   ├── patrol-cors.js             ← CORS allow-list
│   │   ├── scope.js                   ← Role/scope guard
│   │   ├── supabase-service.js        ← Service-role Supabase client
│   │   ├── org-sync.js / sales-queries.js / user-admin.js
│   ├── admin/
│   │   ├── org.js / sap-reps.js
│   ├── sap/                           ← Read-only SAP via HQ proxy
│   │   ├── ar.js / customers.js / customer/ / inventory.js / sales.js / sales/ / speed.js / README.md
│   └── user/
│       └── language.js
│
├── supabase/
│   ├── config.toml
│   ├── schema.sql                     ← Consolidated reference snapshot
│   ├── seed.sql
│   ├── migrations/                    ← Chronological SQL — applied via `npm run sb:push`
│   └── functions/
│       └── verify-pin/                ← Edge Function (Deno) — TSR PIN auth
│
├── server/                            ← Local/dev helpers (NOT deployed)
│   └── services/store-sap-matcher.js
│
├── scripts/                           ← Maintenance scripts
│   ├── check-locale-parity.mjs
│   ├── check-supabase-auth-config.mjs
│   ├── patch-supabase-auth-url.mjs
│   ├── merge-admin-css.mjs
│   ├── _patch_assign.py / regenerate-logo.py
│
├── locales/                           ← i18n JSON
│   ├── tl.json / ceb.json / en.json
│
├── icons/                             ← PWA icons
├── tests/                             ← Playwright e2e + Node unit tests
│   ├── e2e/ ...
│   └── unit/ (hq-client, whoami, patrol-cors, org-sync, scope, role-scope,
│              offline-queue-payload, sap-* ...)
│
├── docs/                              ← Operational docs (read these first)
│   ├── AGENT_HANDOFF.md               ← CURRENT phase / what to pick up
│   ├── PATROL-OPS-RUNBOOK.md
│   ├── PATROL-USER-MANUAL.md
│   ├── PATROL-TESTER-UAT-CHECKLIST.md
│   ├── PILOT-KNOWN-ISSUES.md
│   ├── PRE-RELEASE-SMOKE-CHECKLIST.md
│   ├── HQ_API_CONTRACT.md / POS_OWNERSHIP_MODEL.md / QA-SMOKE.md
│   └── SESSION_HANDOFF_*.md (chronological session notes)
│
├── .planning/codebase/                ← Source of truth for stack / structure / testing
│   ├── STACK.md / STRUCTURE.md / ARCHITECTURE.md / CONVENTIONS.md
│   └── INTEGRATIONS.md / TESTING.md / CONCERNS.md
│
├── migrations/                        ← legacy / mirror migrations folder
└── node_modules/                      ← git-ignored
```

---

## 6. TSR USER PROFILE — DESIGN CONSTRAINTS

**Critical context: TSRs are very low-tech users.**

```
Device:     Low-end Android (TECNO SPARK, Redmi A3x, Vivo Y-series)
            2–4GB RAM, PHP 3–5K device price
Signal:     75% in remote areas — 2G/3G, frequent drops
Data plan:  Prepaid sachet — PHP 15 per 100MB (every KB costs them)
Literacy:   Low — they use Facebook Messenger, SMS, calls. That's it.
Hands:      Calloused from field work — small targets = rage taps
```

**10 Non-Negotiable Design Rules:**

| # | Rule | Why |
|---|------|-----|
| 1 | 4–5 tabs max, one screen = one action | 0% of low-literacy users navigate hierarchical menus |
| 2 | Taglish UI labels | "I-tap para mag-add ng bagong store" — 6x more engagement |
| 3 | 56–64dp touch targets, full-width buttons | Standard 48dp fails for calloused hands |
| 4 | 100% offline-first — visible sync counter + manual "Sync Now" button | TSRs only get signal at home in the evening |
| 5 | Photos compressed to ~50KB max (640×480, quality 0.5) | 5 photos/day = ~5MB/month total |
| 6 | Total app under 500KB cached | Low-end devices, 32GB storage shared with TikTok/FB |
| 7 | No swipe gestures — explicit buttons only | Swipe is invisible/undiscoverable for non-tech users |
| 8 | 18px+ body text, icon + label on every button | Semi-literate users need both together |
| 9 | Green/Red/Orange status dots — not text-only status | Color coding works across literacy levels |
| 10 | Never show low performers on leaderboard publicly | Filipino hiya — only show top performers |

**Data budget target: ~6MB/month total per TSR**
- App shell: 200KB
- Visit data (text): 200KB
- Photos (5/day compressed): ~5MB
- Catalog sync: 200KB
- Tell TSRs: *"This app uses less data than one Facebook photo."*

---

## 7. OFFLINE QUEUE — IMPLEMENTATION (shipped, see `js/offline.js`)

**Library:** Dexie.js (IndexedDB wrapper), loaded via `<script>` tag — not npm.
**Module:** `js/offline.js` — plain global vanilla JS (no ES modules in browser).
**DB:** `PatrolOffline`, version 2.

```javascript
// js/offline.js (real shape — paraphrased)

var offlineDb = new Dexie('PatrolOffline');

offlineDb.version(2).stores({
  pendingVisits: '++id, offline_id, created_at',
  pendingStores: '++id, offline_id, created_at',
  pendingFarms:  '++id, offline_id, created_at',
  cachedStores:  'id, updated_at'
});

async function queueVisit(visitData) {
  visitData.offline_id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  visitData.created_at = new Date().toISOString();
  await offlineDb.pendingVisits.add(visitData);
  if (typeof enhancedSyncStatus === 'function') enhancedSyncStatus();
}

// Similar: queueStore() → pendingStores, queueFarm() → pendingFarms
// All write to IndexedDB FIRST, then enhancedSyncStatus() repaints the sync bar.
```

**Critical bug guard (already implemented):** `_queuePayload()` strips
`offline_id`, `id`, `created_at`, `retry_count`, `last_error`, `last_attempt_at`,
`gps_failed` before POSTing to PostgREST. Leaving `offline_id` on the payload
triggers PGRST204 and the record gets ejected after 3 retries. Do not remove
this strip step.

**Retry policy:** `MAX_SYNC_RETRIES = 3`. After 3 failures the record is ejected
with a console warning. Treat ejections as bugs to investigate, not normal.

**UI:** Persistent sync indicator in the top bar (rendered by `enhancedSyncStatus`).
Manual "I-sync ngayon" button on the home screen calls the same sync routine.

---

## 8. PHOTO UPLOAD — IMPLEMENTATION (shipped, see `js/camera.js`)

**Storage:** Supabase Storage
**Bucket:** `patrol-photos`
**Upload path:** Direct browser → Supabase Storage (no backend route, no signed
URL service). The browser uses the user's Supabase Auth session; bucket RLS
enforces ownership.

`js/camera.js` exposes (real function names — refer to source rather than copy-paste):

- `capturePhoto()` — opens hidden `<input type=file accept=image/* capture=environment>`,
  resolves to a compressed Blob.
- `compressImage(file, maxWidth=640, maxHeight=?, quality=0.5)` — canvas-resize +
  `canvas.toBlob(..., 'image/jpeg', 0.5)`. Soft warn threshold: 80KB.
- `isWifiOrGoodConnection()` — checks `navigator.connection.type`/`effectiveType`
  before allowing a cellular upload; `_maybeWarnCellularUpload()` shows a toast.
- `uploadPhoto(blob, path)` — calls
  `supabaseClient.storage.from('patrol-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })`
  then `getPublicUrl(path)`. Returns the public URL.
- `_showDataUsage(bytes)` — one-per-session "Ginamit: XKB lang" reassurance toast.

**Do NOT** introduce a `/api/photos/upload` route. There is no GCS in this stack.
If a photo upload fails offline, queue the capture into the offline queue and
retry on next sync — same as visits.

---

## 9. STORE/FARM ASSIGNMENT (DSM → TSR) — shipped

**Schema:** `assigned_tsr` columns + indexes live in `supabase/migrations/`
(see the sprint-a-* and `20260518120000_patrol_org_master.sql` migrations).
Any new column or constraint goes in a new dated SQL file in
`supabase/migrations/` and is applied with `npm run sb:push`.

**UI surface:**
- DSM/RSM/Admin view: `#page-assign` section in `app.html`, driven by `js/assign.js`.
  Tabs for Stores (Tindahan) and Farms (Bukid).
- Data helpers: `getUnassignedFarms` / `assignFarms` (and the store equivalents)
  live in `js/db.js`.
- Admin org / SAP-rep mapping: `admin-org.html` + `admin-users-sap.html`
  (server endpoints under `api/admin/`).

**TSR filter:** `js/db.js` filters store + farm lists by `assigned_tsr = currentUser.id`
for TSR-role sessions; DSM/RSM see their wider scope via `api/_lib/scope.js`
and `js/role-scope.js`.

---

## 10. EXCEL/PDF EXPORT (backlog — admin/DSM only)

**For DSM and Admin only — never on TSR screens.**

Frontend stub: `js/export.js` (lazy-loaded; do not pull onto the TSR critical path
per PRODUCT.md item B6).

When this ships, follow the existing pattern:

```
- Excel: SheetJS (xlsx) loaded lazily from CDN in the browser, OR exceljs in a
  Vercel serverless function under api/export/ if the dataset is too large
  to assemble client-side.
- PDF: pdfkit or pdf-lib in a Vercel serverless function. There is no React in
  this codebase, so no @react-pdf/renderer.

- Planned endpoints (Vercel serverless):
    GET /api/export/visits?format=xlsx&period=MTD&tsr_id=
    GET /api/export/stores?format=xlsx&region=
    GET /api/export/summary?format=pdf&period=MTD
```

Reports to generate:
- Visit summary by TSR (MTD/weekly)
- Store coverage map (all stores + last visit date)
- DSM territory report (KPIs, leaderboard, segment distribution)

---

## 11. MESSENGER CHATBOT (backlog — not yet built)

**Why Messenger over browser push:** TSRs already live on Messenger. Push notification permission dialogs confuse low-tech users. Messenger chatbot is zero-friction.

**Planned stack:** Meta Messenger Platform webhook → a small handler hosted
either as another Vercel serverless route under `api/` or on the existing HQ
Cloud Run service. Decision deferred until pilot data lands.
Frontend hook already stubbed: `js/chatbot-register.js` (opt-in linking flow).

**Daily flow:**
```
6:30 AM → "Magandang umaga, [Name]! 5 stores para bisitahin ngayon:"
          → [Store 1] [Store 2] [Store 3] [Store 4] [Store 5]
          → "I-tap ang store para mag-log ng visit"
          → Deep link → patrol.vienovo.ph/visit?store=xxx

End of day (6 PM) → "Magaling! Nag-log ka ng [X]/[Y] visits ngayon.
                     [Remaining stores] pa ang hindi nabisita."
```

**Messenger → App deep link pattern:**
```
https://patrol.vienovo.ph/quick-visit?store_id=xxx&tsr_id=yyy
```
Opens app directly to visit form for that store. Pre-fills store name.

---

## 12. PWA SETUP (shipped)

- `manifest.json` lives at repo root (served from `/manifest.json` by Vercel).
- `sw.js` lives at repo root — **shell cache-first**, registered from
  `index.html` / `app.html`. Cache rules and headers are managed in `vercel.json`.
- Icons in `icons/`. The manifest references Vienovo navy theming.
- Opt-out for debugging: `?nosw=1` or `localStorage.patrol_nosw = 1`.

### Worker strategy (already implemented in `sw.js`)
- Cache-first for the app shell (HTML, JS, CSS, icons).
- Network for API calls + Supabase requests (NEVER cache auth or signed URLs).
- Writes go through `js/offline.js` (Dexie queue), not through the worker.
- "Offline" banner is rendered in-app via `enhancedSyncStatus()` — never a white screen.

**Install prompt:** "Add to Home Screen" banner shows after the user's 2nd login.
Label: *"I-save ang Patrol sa iyong home screen para mas mabilis!"* — see Section 15.4.

---

## 13. CUSTOM DOMAIN

**Target:** `patrol.vienovo.ph` — wired in `vercel.json` (alias) and `config.js`
(`OAUTH_PUBLIC_ORIGIN` defaults include both the vercel.app URL and the custom
domain). If the alias needs to be re-applied, Vercel Dashboard → Domains is the
single source of truth.

When the Messenger chatbot ships, point the webhook at the custom domain so it
survives Vercel preview-URL churn.

---

## 14. ADOPTION STRATEGY (bake into onboarding UX)

**Peer Champion Model:**
- 1 tech-comfortable TSR per 10–15 people
- They get "Digital Champion" title + PHP 50/month load allowance
- They are the first line of support, not IT

**Rollout sequence:**
1. Week 1: Champion TSRs only (10–15 people)
2. Week 2: Run paper forms AND app in parallel (never cold-turkey)
3. Week 3–4: Full rollout with champions as support
4. Month 2: Paper forms retired

**In-app onboarding for TSR (first login):**
- 3-screen animated walkthrough in Tagalog/Filipino
- Each screen = 1 thing: "Ganito mag-log ng store" / "Ganito mag-kuha ng litrato" / "Ganito mag-sync"
- Skip button always visible

**Company provides:** PHP 50–100/month data allowance per TSR. Removes biggest barrier to adoption.

---

## 15. BUILD ORDER

The original Phase A–G plan in this section is **historical** — those phases are
shipped (offline queue, photo upload to Supabase, assignment UI, PWA shell,
custom domain). Do not re-execute them.

**Current phase status lives in two places — read both before starting work:**

1. `docs/AGENT_HANDOFF.md` — what the last session left in flight + what to pick up.
2. `PRODUCT.md` → "UI quality backlog (audit — May 2026)" — prioritized punch list
   (Phase A admin/auth, Phase B TSR field, Phase C manager screens).

For the original historical build order, see the appendix at the bottom of this
document.

---

## 15. ADOPTION STRATEGY — BAKED INTO UX

This is not an HR plan. These are **UX features** that must be built into the app to drive adoption among low-tech Filipino field workers.

### 15.1 Peer Champion Support
```
Role: "Digital Champion" — 1 per 10–15 TSRs
Access: Can see their assigned TSRs' visit counts (read-only)
UI:     Champion gets a special home screen view showing their team:
        "Koponan mo ngayon (Your team today)"
        ┌─ Rico Abante      ████░░░░ 3/8 visits ─┐
        ├─ Jake Santos      ██████░░ 5/7 visits  ─┤
        ├─ Maria Cruz       ██░░░░░░ 2/8 visits  ─┤
        └─ Ben Reyes        █░░░░░░░ 1/6 visits  ─┘
        Champion can tap a TSR name to see their store list (not visit details)
        This lets champions help teammates without DSM overhead
```

### 15.2 Leaderboard Rules
```
SHOW:   Top 3 performers (gold/silver/bronze badges)
        Current user's own rank always (even if #47)
NEVER:  Bottom performers, exact counts for low rankers, public failure

Example leaderboard widget on home:
  🥇 Jake Santos      18 visits this week
  🥈 Rico Abante      16 visits this week
  🥉 Maria Cruz       14 visits this week
  ─────────────────────────────────────
  Ikaw: #8 · 9 visits (keep going! 💪)

This uses Filipino pakikisama (group harmony) and friendly competition
without triggering hiya (public shame).
```

### 15.3 Onboarding Walkthrough (first login only)
```
3 screens max. Skip button always visible.
Screen 1: "Kamusta! 👋 Ako si Patrol."
          Big illustration: phone with store list
          "I-tap ang tindahan para mag-log ng bisita mo"
          [Susunod →]

Screen 2: "Madali lang! 📸"
          Big illustration: camera + checkmark
          "Kumuha ng litrato. Piliin ang outcome. Tapos na."
          [Susunod →]

Screen 3: "Kahit walang signal ✅"
          Big illustration: phone with offline icon → wifi icon → sync tick
          "Sine-save namin lahat. Mag-sync kapag may signal na."
          [Magsimula na!]

After Screen 3: straight to store list. No more modals, no tutorials.
```

### 15.4 "Add to Home Screen" Prompt
```
Show after: user's 2nd login (not 1st — let them try it first)
Text: "I-save ang Patrol sa iyong home screen para mas mabilis!"
      [I-save 📱] [Mamaya na]
Style: Bottom sheet, not a modal. Non-blocking. Dismissible.
```

### 15.5 Data Usage Reassurance
```
Show once on first sync (after first visit submitted):
"✅ Na-sync na! Ginamit: 12KB lang.
 Katumbas ng 0.1% ng iyong 100MB load."
This directly addresses the biggest barrier: fear of wasting data.
```

### Philosophy
TSRs know one app deeply: **Facebook Messenger**. The Patrol TSR UI borrows Messenger's visual language and interaction patterns so the app feels instantly familiar — not a foreign work tool, but something that feels like the app they use every day. This is a hybrid: Vienovo-branded, but Messenger-patterned.

### What to Borrow from Messenger

| Messenger Element | Patrol Equivalent | Implementation |
|---|---|---|
| Chat thread list | Today's store visit list | Each store = a "conversation row" |
| Contact avatar circle | Store initial circle (colored by health) | Green=ok, Orange=warn, Red=critical |
| Bold name = unread | Bold store name = not visited today | Unbold after visit logged |
| Last message preview | Last visit summary ("Nag-order · 30 bags") | Gray subtext under store name |
| Timestamp right-aligned | Last visit date | "2d ago", "Kahapon", "Ngayon" |
| Blue send button | Submit visit / Log order | Full-width, blue, large |
| 📷 photo icon in input bar | Kumuha ng litrato | Camera icon, tap = open camera |
| ✓✓ blue ticks = delivered | Synced to server | Double tick green = synced |
| ⏱ gray clock = sending | Pending offline queue | Orange clock = waiting to sync |
| Story circles (top row) | Priority stores today (urgent ring) | Stores not visited in 7+ days get orange ring |
| Online green dot | Store health status | Dot on avatar |
| "Type a message..." | "Dagdag ng notes..." | Placeholder text in notes field |
| Reaction bar (👍❤️😮) | Quick outcome buttons | "May Order" / "Walang Order" / "Bukas ulit" |
| Long press = options | Long press store = quick actions | Call owner / Get directions / Mark visited |

### Color System (Messenger-inspired, Vienovo-branded)

```css
/* Background: White like Messenger, not dark navy */
--bg-main:     #FFFFFF;
--bg-chat:     #F0F2F5;   /* Messenger gray background */
--bg-bubble:   #FFFFFF;   /* Visit card = message bubble */

/* Accent: Vienovo Blue replaces Messenger Blue */
--accent:      #00A6CE;   /* Primary blue = Vienovo Corporate Blue */
--accent-dark: #004D71;   /* Navy = Messenger dark blue equivalent */

/* Status dots (same as Messenger online/offline) */
--status-ok:   #31A24C;   /* Green = visited recently / healthy */
--status-warn: #F7B928;   /* Yellow = needs visit soon */
--status-crit: #FA383E;   /* Red = not visited 7+ days / critical */

/* Sync status (mirrors Messenger message states) */
--sync-done:   #00A6CE;   /* Blue double tick = synced */
--sync-pending:#F7B928;   /* Orange clock = queued offline */
--sync-error:  #FA383E;   /* Red = failed to sync */

/* Text */
--text-primary:   #050505;  /* Messenger near-black */
--text-secondary: #65676B;  /* Messenger gray = subtext */
--text-muted:     #8A8D91;  /* Timestamps, hints */
```

### Typography
```css
/* Messenger uses system fonts — do the same for performance */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
             Roboto, Helvetica, Arial, sans-serif;

/* Sizes — bigger than standard for calloused hands outdoors */
--text-name:    17px / 700;   /* Store name = contact name */
--text-preview: 14px / 400;   /* Last visit = message preview */
--text-time:    13px / 400;   /* Timestamp */
--text-body:    16px / 400;   /* Form fields, notes */
--text-button:  17px / 600;   /* Action buttons */
```

### Store List Screen (Home — TSR)

Looks like Messenger inbox. Each row:
```
┌─────────────────────────────────────────────────────┐
│  [●]  Golden Feed Supply           Kahapon  ··      │
│  (G)  Caloocan · 120 bags/buwan                     │
│       Nag-order · 30 bags ViePro                    │
└─────────────────────────────────────────────────────┘
│  [!]  Santos Agri Center           5d ago   ○       │
│  (S)  Valenzuela · 80 bags/buwan                    │
│       Hindi pa nabibisita ngayong linggo             │
└─────────────────────────────────────────────────────┘
```

Where:
- `(G)` = circle avatar with store initial, colored by health status
- `●` = green dot (visited recently) / `!` = orange (needs visit) / `✕` = red (critical)
- `··` = blue double tick (last visit synced) / `○` = gray clock (pending)
- Bold name = unvisited today, normal weight = visited

### Visit Form Screen

Looks like opening a Messenger chat thread:
```
┌─ ← Golden Feed Supply ──────── 📞 ──────────────┐
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ 📍 Caloocan, Bulacan                        │ │  ← Store info bubble
│  │ 👤 Maria Santos · 09171234567               │ │
│  │ 📦 120 bags/buwan · VPI Share: 67%          │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Kahapon — J. dela Cruz                      │ │  ← Previous visit bubble
│  │ ✓ Nag-order · 30 bags · ₱45,000            │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ═══════ I-log ang visit ngayon ═══════           │
│                                                   │
│  [  May Order  ] [  Walang Order  ] [  Bukas  ]   │  ← Quick outcome chips
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ 📷  Dagdag ng litrato...                    │ │  ← Photo + notes bar
│  │ ✏️  Dagdag ng notes...                      │ │     (like Messenger input)
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │         ✅  I-SUBMIT ANG VISIT              │ │  ← Big blue button
│  └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

### Sync Status Bar (always visible, top of screen)

```
Online + synced:   [●  Naka-sync na  ✓✓]           ← green, subtle
Offline + queue:   [○  Offline · 3 pending  ↑]     ← orange, prominent
Syncing:           [↻  Nag-sisync...         ]      ← blue, animated
Error:             [✕  Hindi na-sync · I-retry]     ← red, tappable
```

### Bottom Navigation (TSR — 4 tabs max)

```
┌──────────┬──────────┬──────────┬──────────┐
│    🏠    │    🏪    │    🗺    │    👤    │
│  Bahay   │  Stores  │   Mapa   │  Profile │
└──────────┴──────────┴──────────┴──────────┘
```

Active tab: blue, others: gray. No text on inactive. Messenger bottom tab pattern.

### Quick Outcome Chips (after opening a store)

Instead of a long form, first ask one big question visually:

```
Ano ang nangyari sa bisita mo?

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│      🛍     │  │     😐      │  │      📅     │
│  May Order  │  │  Nakausap   │  │  Bukas ulit │
│             │  │  Walang     │  │             │
│             │  │    Order    │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

Tap one → expands to relevant mini-form only. Tap "May Order" → shows bag count + product. Tap "Nakausap" → shows notes only. Tap "Bukas ulit" → just logs attempt, done.

This reduces the 12-section form to a 2-tap flow for the most common scenario.

---

## 17. TRILINGUAL LABEL SYSTEM

All TSR-facing text uses **3 languages in priority order**: Tagalog first, Bisaya (Cebuano) in parentheses for Mindanao TSRs, English as universal fallback.

### Key Labels

```typescript
export const T = {
  // Navigation
  home:        'Bahay (Balay)',
  stores:      'Mga Tindahan',
  map:         'Mapa',
  profile:     'Profile ko',

  // Store list
  visitToday:  'Bisitahin ngayon (Bisitahon karon)',
  notVisited:  'Hindi pa nabibisita (Wala pa nabisita)',
  lastVisit:   'Huling bisita (Katapusang bisita)',
  daysAgo:     (n: number) => `${n} araw na ang nakakaraan`,
  today:       'Ngayon (Karon)',
  yesterday:   'Kahapon (Kagabie)',

  // Visit outcomes
  withOrder:   'May Order (Adunay Order)',
  noOrder:     'Walang Order (Walay Order)',
  comeback:    'Bukas ulit (Ugma pag-usab)',

  // Actions
  submitVisit: 'I-SUBMIT ANG VISIT',
  takePhoto:   'Kumuha ng litrato (Kuhaa og litrato)',
  addNotes:    'Dagdag ng notes (Dugangi og notes)',
  syncNow:     'I-sync ngayon (I-sync karon)',

  // Sync status
  synced:      'Naka-sync na (Na-sync na)',
  offline:     'Offline',
  pending:     (n: number) => `${n} naghihintay (naghulat)`,
  syncing:     'Nag-sisync... (Nag-sync...)',
  syncError:   'Hindi na-sync. I-retry? (Dili na-sync. I-retry?)',

  // Errors / empty states
  noStores:    'Wala pang tindahan sa lugar mo.',
  noSignal:    'Walang signal. Sine-save namin ang data mo.',
  submitOk:    '✅ Na-save! Mag-sync kapag may signal.',
  submitFail:  '❌ May problema. Subukan ulit.',

  // Onboarding
  welcome:     'Maligayang pagdating sa VieForce Patrol!',
  step1title:  'I-tap ang tindahan para mag-log ng bisita',
  step2title:  'Kumuha ng litrato at i-lagay ang order',
  step3title:  'I-sync kapag may internet na',
}
```

---

## 18. COMPONENT LIBRARY (TSR-SPECIFIC)

There is no React. "Components" in this codebase are vanilla-JS render
functions that build DOM (or return HTML strings) plus matching CSS classes.
Each conceptual component below is already implemented — preserve the design
intent listed when modifying.

### Store row — Messenger chat row pattern
- **Code:** render functions in `js/home-tsr.js` and `js/stores.js`
- **Styles:** `.store-row`, `.store-avatar`, health-dot classes in `css/tsr-field.css` + `css/patrol.css`
- Health-dot color from `store.health_status`; bold name when unvisited today;
  preview text = last visit outcome; relative timestamp ("Kahapon", "2d ago");
  sync tick state from offline queue.

### Outcome chips — First question on visit
- **Code:** `js/visits.js` / `js/visit-wizard.js`
- **Styles:** `.outcome-chip` family in `css/tsr-field.css` / `css/visits-page.css`
- 3 big tappable chips: May Order / Walang Order / Bukas ulit.
  Tap expands to the relevant mini-form; nothing else scrolls.

### Visit bubble — Previous-visit display
- **Code:** render helpers in `js/visits.js`
- **Styles:** `.visit-bubble` in `css/visits-page.css`
- Looks like a received message bubble (gray, left-aligned). Shows date, TSR
  name, outcome, order amount if any. Right-aligned timestamp + sync tick.

### Sync bar — Always-on sync status
- **Code:** `enhancedSyncStatus()` / `patrolUpdatePilotCard()` (called from
  `js/offline.js`, `js/pilot-readiness.js`).
- **Styles:** `.sync-bar` / sync-state classes in `css/tsr-field.css`
- Sticky top bar; hidden when online + everything synced. Tappable when in error.

### Photo capture — Camera button
- **Code:** `capturePhoto()` / `compressImage()` / `uploadPhoto()` in `js/camera.js`
- **Styles:** `.photo-capture-btn` family in `css/tsr-field.css`
- Opens rear camera immediately. Shows thumbnail after capture. Compresses to
  ≤80KB (target 50KB). Uploads to Supabase Storage when online; queues otherwise.

### Big button — Primary CTA
- **Styles:** `.btn-primary-big` / `.btn-messenger-blue` in `css/tsr-field.css`
- Full width, **64px** minimum height (Rule 3). `#00A6CE` background, white 17px
  bold text. Used for: Submit Visit, Sync Now, Save Store.

---

## 19. UPDATED BUILD ORDER

This section is **historical**. The Phase 0 / A–F plan documented here has shipped
(Messenger-hybrid UX foundation, offline queue, Supabase photo upload, assignment,
PWA, custom domain). For current next steps see `docs/AGENT_HANDOFF.md` and the
"UI quality backlog (audit — May 2026)" in `PRODUCT.md`.

---

## 20. FUTURE: CRM 360° MERGE

When Patrol beta and HQ beta are both stable, the two repos consolidate into a
single Vienovo CRM platform:

```
vienovo-crm360/
├── modules/patrol/     ← this codebase (Messenger-hybrid TSR UI + DSM/RSM screens)
├── modules/hq/         ← HQ codebase (executive BI + SAP B1 surface)
├── shared/auth/        ← unified Supabase Auth (one users / org table set)
├── shared/nav/         ← role-based navigation shell
└── api/                ← both serverless API layers (still Vercel + Cloud Run HQ proxy)
```

Note: The Messenger-hybrid UI is TSR-only. DSM/RSM/CEO continue to use the
Vienovo navy executive look (data-dense). The merge shell detects role and
renders the correct design system.

---

## 21. NOTES FOR CLAUDE CODE

- **TSR screens = Messenger-hybrid design (Section 16).** DSM/RSM/CEO screens keep the current Vienovo navy/professional style.
- **Every TSR screen must use T.* translation labels (Section 17).** No hardcoded English strings on TSR-facing screens.
- **Low-tech test:** Every TSR change must pass — "can a non-tech 45-year-old in Mindanao use this in 30 seconds without explanation?"
- **Offline is not optional.** Every write must work without internet. Queue → sync pattern always.
- **Compress photos hard.** Max 50KB. 640×480 at 0.5 JPEG quality.
- **Touch targets: 64px minimum height** on all TSR-facing interactive elements.
- **No spinners for TSRs.** Use skeleton screens or cached data. Spinners cause anxiety for low-tech users.
- **No swipe gestures.** Explicit buttons only. Swipe is invisible to non-tech users.
- **Never show loading spinners to TSRs.** Use skeleton screens or cached data.
- **Do not add npm packages without confirming** — bundle size matters for 2G/3G devices. Browser libs (Dexie, Supabase JS) are loaded from CDN, not npm.
- **Schema changes go in `supabase/migrations/*.sql`** — apply with `npm run sb:push`. Never edit the DB through the dashboard. Never assume `npm run db:migrate` exists; it does not.
- **No build step for the frontend** — `app.html` / `index.html` / `admin*.html` are deployed as-is by Vercel. There is no Next.js, no React, no bundler.
- **All SAP B1 reads go through `api/_lib/hq-client.js`** (Cloud Run HQ proxy with margin stripping). Never call SAP B1 directly from Patrol.
- **Vienovo brand (DSM/RSM/CEO screens):** Navy `#004D71`, Blue `#00A6CE`, Green `#95C93D`, Gold `#F1B11D`
- **Messenger-hybrid (TSR screens):** White background, `#00A6CE` accent, system fonts, health dots
- **Supabase JWT lesson (W1.4 rollback, 2026-05-24):** This project uses Supabase **asymmetric** JWT signing (JWKS-backed). Hand-signing HS256 with a `SUPABASE_JWT_SECRET` env var **never worked** — the project simply does not expose a shared secret because PostgREST validates via the JWKS endpoint. Before designing any custom session/JWT flow, run `npx supabase secrets list` and look at `SUPABASE_JWKS` vs `SUPABASE_JWT_SECRET`. If only `SUPABASE_JWKS` is set → asymmetric project → do NOT attempt hand-signed HS256; either use `supabase.auth.setSession()` end-to-end (real OAuth flow) or keep the legacy session pattern. The W1.4 commit `c03e4a3` is the reference rollback to legacy `verify-pin` + `localStorage` + HYBRID `api/_lib/auth.js`.
- **RLS posture (post-W1.6, 2026-05-24):** Never SELECT from `public.users` as anon — use `public.users_safe` (no `pin_hash`). Server-side service-role reads of `users` are still fine (they bypass RLS). The pre-W1 self-referential policy on `users` triggered Postgres `42P17` infinite recursion under PostgREST; if you see that code, see `docs/PATROL-OPS-RUNBOOK.md` → "42P17 infinite recursion in policy".

---

## APPENDIX — Original Build Order (historical, do not re-execute)

The Phase A–G / Phase 0 plans that previously lived in Sections 15 and 19 are
preserved in git history. They shipped over the April–May 2026 cycle:

- Phase A — Offline Queue (Dexie `PatrolOffline` v2, retry+eject policy)
- Phase B — Photo Upload (Supabase Storage `patrol-photos`, browser-side
  compression — NOT the originally-planned GCS bucket)
- Phase C — Store/Farm Assignment (`#page-assign` + `js/assign.js`)
- Phase D — Excel/PDF Export — partial; still on backlog for admin surfaces
- Phase E — PWA + Custom Domain (`manifest.json`, `sw.js`, `patrol.vienovo.ph`)
- Phase F — UX Polish (ongoing; tracked in `PRODUCT.md`)

Current authoritative status: `docs/AGENT_HANDOFF.md` + `PRODUCT.md`.

---

*CLAUDE.md v3.2 · May 2026 · Vienovo Philippines Inc.*
*Stack: static HTML + vanilla JS PWA + Supabase + Vercel APIs + Cloud Run HQ proxy for SAP*
*UX: Messenger-hybrid (TSR) + Vienovo executive (DSM/RSM/CEO)*

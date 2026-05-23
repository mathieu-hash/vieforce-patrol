<!-- refreshed: 2026-05-04 -->
# Architecture

**Analysis Date:** 2026-05-04

## System Overview

VieForce Patrol is a static-first field PWA: the authenticated shell is `app.html` (single HTML document with many `.page` sections). The browser talks to **Supabase** (PostgREST for app data, GoTrue for auth) and to **Vercel serverless** routes under `api/` for SAP-style analytics. SAP B1 data for most `/api/sap/*` paths flows **Browser → Patrol (Vercel) → HQ Cloud Run → MSSQL (SAP B1)**. A parallel path can query MSSQL **directly** from Patrol for a small set of “speed” list endpoints (see `api/sap/README.md`).

```text
┌────────────────────────────────────────────────────────────────────┐
│  Browser (app.html) — .page sections, #bottom-nav, client JS       │
│  `app.html` + `js/*.js`                                            │
└───────────────┬──────────────────────────────┬──────────────────────┘
                │                              │
                ▼                              ▼
┌───────────────────────────┐   ┌────────────────────────────────────┐
│  Supabase (Auth + DB)     │   │  Patrol Vercel `/api/*`            │
│  `js/supabase.js`         │   │  `api/_lib/auth.js`                │
│  `js/db.js` (CRUD)        │   │  `api/_lib/hq-client.js`           │
└───────────────────────────┘   └──────────────┬─────────────────────┘
                                              │
                     ┌────────────────────────┴──────────────────────┐
                     ▼                        ▼                        │
         ┌──────────────────────┐  ┌──────────────────────┐          │
         │  HQ Cloud Run API     │  │  Direct SAP MSSQL     │ (subset)│
         │  (Bearer + scope)     │  │  `SAP_DB_*` env       │          │
         └──────────┬───────────┘  └──────────┬───────────┘          │
                    ▼                          ▼                       │
         ┌──────────────────────────────────────────────────┐         │
         │  SAP B1 (MSSQL) — Vienovo_Live / analytics host   │◀────────┘
         └──────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  VieForce HQ (separate product) — `https://vieforce-hq.vercel.app`  │
│  Exec/evp: redirect from Patrol after splash (`js/nav-role-device.js`)│
└────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| SPA shell | Loads CSS/JS, defines OAuth bounce to `index.html`, kills SW/cache, hosts all `.page` sections and boot watchdog | `app.html` |
| Page routing | Shows one `.page` at a time via `nav(pageId)`, history via `navBack`, wraps nav to bootstrap lazy page logic | `app.html` (inline `nav` / `window.nav`) |
| Role + device nav | Rebuilds `#bottom-nav` for mobile DSM/RSM/TSR; exec splash + redirect to HQ; observer mode | `js/nav-role-device.js` |
| Session / auth | Supabase session, `getSession`, redirect to `index.html` if unauthenticated | `js/auth.js` |
| UI scope | Role helpers (`PatrolScope.homePageId`, feed scope, visibility flags) — **UI hints only** | `js/role-scope.js` |
| Data (stores, visits, sync) | Supabase CRUD, offline queue | `js/db.js`, `js/offline.js` |
| SAP proxy client | `sapFetch(url)` attaches `x-session-id` | `js/db.js` |
| Serverless auth | Validates `x-session-id` against `public.users` via Supabase service role | `api/_lib/auth.js` |
| HQ upstream | `callHqProxy(hqPath, session, params)` — Bearer `HQ_SERVICE_TOKEN`, `scope=user:<uuid>` | `api/_lib/hq-client.js` |
| Response shaping | Strip margin keys, wrap `patrol_meta` | `api/_lib/scope.js` |
| SAP route handlers | Thin proxies + optional direct-SQL routes | `api/sap/*.js` |

## Pattern Overview

**Overall:** Single-page application with **section-based routing** (no client-side URL router). State for “which page” is the DOM: exactly one `.page` has class `active`.

**Key Characteristics:**
- **Inline orchestration** in `app.html`: `nav`, store detail, visit flows, bottom-nav delegation live beside markup.
- **Progressive enhancement**: `nav` is wrapped after definition to call feature `init*` when entering key pages (stores, visits, map, sales, RSM home, etc.).
- **Serverless BFF**: Browser never sees `HQ_SERVICE_TOKEN`; Patrol verifies session then calls HQ or SAP DB.

## Layers

**Presentation (HTML + CSS):**
- Purpose: Static shell, tokens, component styles.
- Location: `app.html`, `index.html`, `css/*.css`
- Contains: `.page` sections, overlays, bottom nav markup seed.
- Depends on: loaded JS order in `app.html`
- Used by: all field roles after login

**Client logic:**
- Purpose: Auth, i18n, feature modules (stores, visits, map, sales tab, DSM/RSM homes).
- Location: `js/*.js`
- Contains: Plain scripts (IIFE / functions on `window`), no bundler.
- Depends on: `@supabase/supabase-js`, Dexie (`js/offline.js`), MapLibre/Chart.js from CDN in `app.html`
- Used by: `app.html` script tags (see `STRUCTURE.md`)

**API (Vercel Node handlers):**
- Purpose: Session verification, HQ proxy, SAP proxies, health/diagnostics.
- Location: `api/**/*.js` — each file maps to HTTP path (e.g. `api/sap/sales.js` → `/api/sap/sales`)
- Contains: CommonJS handlers; `_lib` prefix excludes routing (`api/_lib/*`).
- Depends on: env vars (`SUPABASE_SERVICE_ROLE_KEY`, `HQ_SERVICE_TOKEN`, optional `SAP_DB_*`)
- Used by: `fetch` from browser (`sapFetch` and direct calls)

**Backend-as-a-service:**
- Purpose: Users, stores, visits, auth users — Postgres via Supabase.
- Location: implied by `js/supabase.js`, `js/db.js`; schema in `supabase/migrations/`, `supabase/schema.sql`

## Data Flow

### Primary request path — SAP KPIs (HQ-mediated)

1. User action in Sales tab or home widgets triggers `sapFetch('/api/sap/sales?period=MTD')` in client (`js/db.js`).
2. Browser sends **GET** with header **`x-session-id: <users.id>`** (UUID from `getSession()`).
3. **`api/sap/sales.js`**: `verifySession(req)` → load user from Supabase REST (`api/_lib/auth.js`).
4. **`callHqProxy('/api/sales', session, params)`** (`api/_lib/hq-client.js`): GET to HQ base URL + path, query includes `scope=user:<session.id>`, **`Authorization: Bearer`** from `HQ_SERVICE_TOKEN`.
5. HQ resolves territory and queries SAP (MSSQL). Response returns JSON.
6. **`stripMarginsIfNeeded`** + **`wrapPatrolMeta`** (`api/_lib/scope.js`) → JSON to browser with **`patrol_meta`** envelope.

**Same pattern** for `api/sap/ar.js`, `customers.js`, `customer/[cardcode].js`, `inventory.js`, `speed.js` mapping to HQ paths documented in `api/sap/README.md`.

### Alternate path — direct MSSQL from Patrol

Some **`/api/sap/sales/*`** endpoints (e.g. by-customer / whitespace / at-risk per `api/sap/README.md`) may use **`SAP_DB_*`** env vars to query MSSQL **without** HQ. Use **`sapFetch`** the same way; server chooses implementation.

### Field operations — Supabase

- **Stores, visits, offline queue**: `js/db.js` uses `supabaseClient` (from `js/supabase.js`) — browser talks **directly** to Supabase with user-scoped credentials, not through `api/`.

### Exec redirect — Patrol → HQ web app

- Roles **`exec`** and **`evp`** (`js/nav-role-device.js`): full-screen splash then **`window.location.href`** to **`https://vieforce-hq.vercel.app`** (canonical exec UI). Optional **observer mode** stays in Patrol with limited UI (`sessionStorage` flag).

### Diagnostics

- **`GET /api/health`** — `api/health.js` — lightweight JSON OK.
- **`GET /api/whoami`** — `api/whoami.js` — Vercel egress IP (for firewall allowlists; no session).

## Key Abstractions

**`nav(pageId)`:**
- Purpose: Switch visible `.page`; maintain `_navHistory`; sync `body[data-patrol-active-page]`; update bottom nav active state; close overlays.
- Examples: `app.html` (definition ~1696–1756), assigned `window.nav` ~2829.
- Pattern: Single-page section show/hide (not hash-based SPA router).

**`sapFetch(endpoint)`:**
- Purpose: Authenticated GET to same-origin `/api/sap/...`.
- Examples: `js/db.js`
- Pattern: Always send **`x-session-id`** from session.

**`callHqProxy`:**
- Purpose: Server-to-server HQ access with scoped user context.
- Examples: `api/_lib/hq-client.js`, used by `api/sap/sales.js` and siblings.

**`PatrolScope.homePageId()`:**
- Purpose: Default landing `.page` id by role (e.g. TSR → `page-home-tsr`, DSM → `page-home-dsm`, RSM/CEO exec-class → `page-rsm-home`).
- Examples: `js/role-scope.js`

## Entry Points

**Authenticated shell:**
- Location: `app.html`
- Triggers: User completes OAuth/email flow on `index.html`, session stored, navigation to `app.html`
- Responsibilities: Load script chain, run auth gate, set initial `.page.active`, wire `nav`, delegate `#bottom-nav` clicks

**Login / OAuth callback:**
- Location: `index.html`
- Triggers: Unauthenticated users; OAuth `code=` must land here (`app.html` redirects query/hash to `index.html` if opened with OAuth params — see lines 38–51 of `app.html`)

**Serverless HTTP:**
- Location: `api/**/*.js` — Vercel filesystem routing
- Triggers: HTTP requests to `/api/...`

## Architectural Constraints

- **No client-side router:** Deep links to internal “pages” are not expressed as paths; bookmarking uses file name (`app.html`) only unless extended.
- **Global state:** `window.nav`, `window.getSession`, `window.sapFetch`, `window.PatrolScope`, session in `localStorage` key used by `js/auth.js` (see that file for `SESSION_KEY`).
- **Service workers:** **Enabled (cache-first shell)** as of commit `4513c05` ("Enable PWA shell cache-first service worker"). `sw.js` at repo root is registered from `index.html` / `app.html`; offline writes still flow through Dexie/queue in JS (`js/offline.js`), while the SW handles shell asset caching for fast reload and basic offline navigation. Opt-out: `?nosw=1` query param or `localStorage.patrol_nosw=1`.
- **CEO vs nav:** `js/nav-role-device.js` maps **CEO** to **RSM-style** bottom nav (`navRole = 'rsm'` when role is `ceo`) for tab strip consistency; `PatrolScope` still treats `ceo` as exec for some feed/scope logic — align UX expectations when changing either file.

## Error Handling

**Strategy:** Client `sapFetch` returns `{ error, status }` on non-OK HTTP; SAP routes return **401** (bad session), **502/504** (HQ/upstream), JSON body often includes `hq_status`.

**Patterns:**
- `api/_lib/auth.js` — `unauthorized(res)` for missing/invalid session
- HQ 5xx — one retry in `callHqProxy` (`api/_lib/hq-client.js`)

## Cross-Cutting Concerns

**Logging:** Client `console.error` for SAP fetch; server `console.error` in `api/_lib/auth.js` on verify failures.

**Validation:** `js/validate.js` (client); query param whitelisting documented in `api/sap/README.md` for SAP routes.

**Authentication:** Supabase session in browser; serverless uses **service role** only to resolve `x-session-id` → user row — not end-user JWT on API routes.

---

*Architecture analysis: 2026-05-04*

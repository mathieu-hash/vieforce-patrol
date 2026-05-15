# SAP Proxy — Patrol → HQ → MSSQL

Patrol-side serverless functions that proxy SAP B1 data through the HQ Cloud Run API. Built so the browser never sees the HQ service token, never sees other-territory data, and never sees gross-margin fields. Patrol is the field app; margin stays in HQ desktop only.

**Architecture (Phase D, 2026-04-19)**

```
Browser
   │  GET /api/sap/sales  +  x-session-id: <user uuid>
   ▼
Patrol Vercel Serverless    ← THIS DIRECTORY
   │
   │  1. verifySession()       → looks up user via Supabase REST + service-role key
   │  2. callHqProxy()         → Bearer HQ_SERVICE_TOKEN + scope=user:<uuid>, 10s timeout, retry-once on 5xx
   │  3. stripMarginsIfNeeded() → recursively DELETES margin keys for every role
   │  4. wrapPatrolMeta()      → adds { patrol_meta: { user_id, role, period, hq_scope, is_empty, fetched_at } } envelope
   │
   ▼
HQ Cloud Run API (vieforce-hq-api-1057619753074.asia-southeast1.run.app)
   │  HQ resolves scope=user:<uuid> → SlpCodes → WHERE clause
   │  Returns scope metadata {role, is_empty, slpCodes_count, ...} in every response
   ▼
MSSQL SAP B1 (analytics.vienovo.ph:4444 → Vienovo_Live)
```

## Endpoints

| Method | Path | Forwards to | Query whitelist |
|--------|------|-------------|-----------------|
| GET | `/api/sap/sales` | HQ `/api/sales` | `period` (default `MTD`) |
| GET | `/api/sap/ar` | HQ `/api/ar` | (none — HQ defaults to current AR) |
| GET | `/api/sap/customers` | HQ `/api/customers` | `search`, `region`, `page` (default 1), `limit` (default 50, max 200), `sort` |
| GET | `/api/sap/customer/:cardcode` | HQ `/api/customer?id=<cardcode>` | cardcode from URL → `params.id` |
| GET | `/api/sap/inventory` | HQ `/api/inventory` | `plant` (default `ALL`) |
| GET | `/api/sap/speed` | HQ `/api/speed` | `period` (default `MTD`) |

All responses are JSON, `private, max-age=30` (60s for inventory).

Every response now includes a top-level `patrol_meta` block:

```json
{
  "patrol_meta": {
    "user_id": "5d710fc6-...",
    "role": "dsm",
    "period": "MTD",
    "hq_scope": { "is_empty": false, "role": "dsm", "slpCodes_count": 12 },
    "is_empty": false,
    "fetched_at": "2026-04-19T12:34:56.789Z"
  },
  "kpis": { ... },
  "by_brand": [ ... ]
}
```

If `patrol_meta.is_empty === true`, the user has no attribution (no SlpCodes mapped yet) — frontend should render the zero-state UI, not the data UI.

## Auth

Patrol endpoints: browser sends `x-session-id: <user.id>` (UUID from Supabase `users`). Handled by `verifySession()`.

HQ upstream: Patrol → HQ uses `Authorization: Bearer $HQ_SERVICE_TOKEN`. The browser never sees this token.

Failure modes:
- Missing/malformed `x-session-id` → `401 Unauthorized`
- Session not in users table or `is_active=false` → `401`
- Customer out of scope (HQ 403) → `403 OUT_OF_SCOPE`
- Customer missing (HQ 404) → `404 NOT_FOUND`
- HQ 5xx / network failure → `502` with `{ error, hq_status }`
- HQ timeout (10s) → `504`

## Troubleshooting: Sales tab stuck / zeros / “SAP unavailable”

1. **Browser Network** — Open DevTools → Network → `sales?period=MTD` (or `sales/all`).
   - **401** on `/api/sap/sales` → missing/invalid `x-session-id` or user inactive; sign in again.
   - **502 / 504** → Patrol could not get a good response from HQ. On Vercel, confirm **`HQ_SERVICE_TOKEN`** matches **`HQ_SERVICE_TOKEN`** on the HQ Cloud Run service (same secret string). Confirm **`SUPABASE_SERVICE_ROLE_KEY`** is set (session verification).
2. **`patrol_meta.is_empty === true`** (or UI: “No SAP territory mapped”) → HQ resolved `scope=user:<uuid>` to **no SlpCodes and no district codes**. Fix **`public.users`**: set **`sap_slpcode`** / **`sap_district_code`** from SAP, and for DSMs ensure TSRs have **`manager_id`** + **`sap_slpcode`**. See VieForce HQ `api/_scope.js`.
3. **Scope not empty but KPIs stay 0** → mapping is narrow or wrong (e.g. SlpCode doesn’t match invoiced BPs). Validate in SAP (OSLP / OCRD) and adjust `users` rows — not a Patrol code bug.
4. **Never** point Patrol browser at SQL Server — Vercel IPs are not on the SAP firewall; all SAP reads go **Patrol → HQ Cloud Run → MSSQL**.

## Required env vars (set in Vercel project settings)

| Name | Required | Default | Purpose |
|------|----------|---------|---------|
| `HQ_SERVICE_TOKEN` | **YES** | — | Bearer token Patrol sends to HQ. Rotated in HQ's Cloud Run env. NEVER expose to browser. |
| `HQ_API_BASE_URL` | no | `https://vieforce-hq-api-1057619753074.asia-southeast1.run.app` | Override for staging or local HQ dev. Legacy `HQ_API_BASE` also accepted. |
| `SUPABASE_SERVICE_ROLE_KEY` | **YES** | — | Lets serverless functions look up users by id. NEVER expose to browser. |
| `SUPABASE_URL` | no | `https://yolxcmeoovztuindrglk.supabase.co` | Override only if pointing at a different project. |

### Direct-SAP endpoints (`/api/sap/sales/*`) — additional env vars

These three endpoints query SAP B1 MSSQL **directly** (skipping HQ) for speed.

| Name | Required | Default | Purpose |
|------|----------|---------|---------|
| `SAP_DB_HOST` | **YES** | — | e.g. `analytics.vienovo.ph` |
| `SAP_DB_PORT` | no | `1433` | SAP B1 SQL port (use `4444` per current setup) |
| `SAP_DB_NAME` | **YES** | — | e.g. `Vienovo_Live` |
| `SAP_DB_USER` | **YES** | — | Read-only SQL login (must NOT have write/DDL) |
| `SAP_DB_PASS` | **YES** | — | Password for the read-only user |
| `SAP_DB_ENCRYPT` | no | `1` | `'0'` to disable TLS (dev only) |
| `SAP_DB_TRUST` | no | `1` | `'0'` to require valid server cert |

**Endpoints added:**

| Path | Returns | Notes |
|------|---------|-------|
| `GET /api/sap/sales/by-customer?period=MTD\|YTD` | `by_customer[]` (top 5 BPs by bags) | Filters: `OINV.SlpCode = user.sap_slpcode`, `CANCELED='N'`, period start |
| `GET /api/sap/sales/whitespace` | `whitespace[]` (BPs with 0 MTD invoices) | Active BPs only (`OCRD.validFor='Y'`) |
| `GET /api/sap/sales/at-risk` | `at_risk[]` (>14d since last invoice) | Tiered: `slowing` 15–30d, `at_risk` >30d, `no_history` null |

All three endpoints:
- Require `x-session-id` (same as HQ-proxied routes).
- Read **only** `OINV` / `INV1` / `OCRD` (volume + BP master).
- Return `{ patrol_meta: { user_id, role, period?, is_empty, fetched_at } }` envelope.
- Return empty list (with `is_empty: true`) when user has no `sap_slpcode`.
- Return `502` with no SQL details on connection / query failures.

## Margin-stripping policy

Every role, including `exec`, `ceo`, `admin`, `evp`, `director`, `rsm`, `dsm`, `tsr`, and `champion`, gets these keys **deleted** (not nulled) recursively across the entire response:

```
gross_profit, gross_margin, margin_pct, cost_of_goods, unit_cost,
gp, gm, gm_ton, gmt, cogs, ytd_gm_ton,
gm_per_ton, gross_margin_pct, gp_pct, margin, gm_per_bag
```

The walker handles nested objects and arrays so a margin field inside a regional rollup is also stripped. Full list in `api/_lib/scope.js` → `MARGIN_KEYS`.

## Scope filter

HQ resolves scope entirely from `scope=user:<uuid>` that Patrol appends on every upstream call. HQ looks up the user's assigned SlpCodes in Supabase and injects the appropriate `WHERE` clause. Patrol no longer does district/region filtering — it's all upstream.

| Role | HQ behavior |
|------|-------------|
| `exec`, `ceo` | No scope filter — national data |
| `rsm` | Filtered to SlpCodes in their region |
| `dsm` | Filtered to SlpCodes in their district |
| `tsr`, `champion` | Filtered to their own SlpCode (or empty if not mapped yet) |

When a user has no SlpCodes mapped, HQ returns `is_empty: true` in the scope block and the data payload is zero-state. Frontend should render an empty state (not crash, not show stale data).

## Files

- `_lib/auth.js` — `verifySession(req)` + `unauthorized(res)`
- `_lib/hq-client.js` — `callHqProxy(hqPath, session, params, opts)` + `HQ_API_BASE`
- `_lib/scope.js` — `stripMarginsIfNeeded()`, `stripMarginsDeep()`, `wrapPatrolMeta()`, `MARGIN_KEYS`
- `sales.js`, `ar.js`, `inventory.js`, `speed.js`, `customers.js`, `customer/[cardcode].js` — handlers (~25 LOC each)

The `_lib` underscore prefix keeps Vercel from auto-routing those files as endpoints.

## Frontend integration

`js/db.js` exports `sapFetch(endpoint)` (also on `window.sapFetch`). Example:

```js
var sales = await sapFetch('/api/sap/sales?period=MTD');
if (sales.error) {
  showToast('SAP not reachable, retry later');
  return;
}
if (sales.patrol_meta.is_empty) {
  renderSalesEmptyState();
  return;
}
renderSalesKpis(sales);
```

The helper auto-attaches `x-session-id` from `getSession()`.

## Smoke test (after env vars propagated to Vercel)

1. Login as Jefrey (DSM, MM-North) → DevTools console:
   ```js
   await fetch('/api/sap/sales?period=MTD', { headers: { 'x-session-id': getSession().id } }).then(r=>r.json())
   ```
   Before Phase E SlpCode seeding: `patrol_meta.is_empty === true`.
   After seeding: MM-North KPIs only, no `gm_ton` / `gp_pct` / `gross_profit` keys present at all.

2. Login as Rina (RSM, Luzon) → same call. Regional aggregate, margin keys stripped.

3. Login as Mat (exec) → same call. Full national scope, but margin keys still stripped because Patrol never exposes margin data.

4. Customer detail RBAC — DSM calling an out-of-scope cardcode:
   ```js
   await fetch('/api/sap/customer/CARDCODE_OUT_OF_SCOPE', { headers: { 'x-session-id': getSession().id } }).then(r=>r.json())
   ```
   Returns `403 { error: 'OUT_OF_SCOPE' }` — HQ handles the gate.

## Unit tests

Run: `npm run test:unit` — Node 22's built-in `node:test`, no external deps.

- `tests/unit/hq-client.test.js` — 8 tests for `callHqProxy`
- `tests/unit/scope.test.js` — 10 tests for strip + wrap helpers
- `tests/unit/sap-*.test.js` — ~48 tests across the 6 endpoints (200/401/403/404/502/504 + margin strip + param whitelisting)

Windows Node 22 note: the `tests/unit/*.test.js` glob pattern is shell-expanded, which works in bash/zsh. For reliability across CMD/PowerShell, `test:unit` in `package.json` lists files explicitly.

# SAP Proxy — Patrol → HQ → MSSQL

Patrol-side serverless functions that proxy SAP B1 data through the HQ Cloud Run API. Built so the browser never sees the HQ API key, never sees other-territory data, and (for non-execs) never sees gross-margin fields.

**Architecture**

```
Browser
   │  GET /api/sap/sales  +  x-session-id: <user uuid>
   ▼
Patrol Vercel Serverless    ← THIS DIRECTORY
   │
   │  1. verifySession() → looks up user via Supabase REST + service-role key
   │  2. callHqApi()    → server-to-server HTTP to HQ Cloud Run
   │  3. applyScopeAndMargins() → DSM/RSM filter + margin redaction
   │
   ▼
HQ Cloud Run API (vieforce-hq-api...)
   ▼
MSSQL SAP B1 (analytics.vienovo.ph:4444)
```

## Endpoints

| Method | Path | Forwards to | Notes |
|--------|------|-------------|-------|
| GET | `/api/sap/sales?period=MTD` | HQ `/api/sales` | DSM/RSM auto-scoped via `district` / `region` query param |
| GET | `/api/sap/ar` | HQ `/api/ar` | Customer/aging arrays filtered by user scope |
| GET | `/api/sap/customer/<cardcode>` | HQ `/api/customer?id=<cardcode>` | RBAC: 403 if customer is out of user's scope |
| GET | `/api/sap/inventory` | HQ `/api/inventory` | Scoped warehouse + low-stock arrays |
| GET | `/api/sap/speed` | HQ `/api/speed` | Daily pullout / velocity |
| GET | `/api/sap/customers?limit=50` | HQ `/api/customers` | Top-N customer list, scoped |

All responses are JSON. Cache headers are `private, max-age=30` (60s for inventory). In-memory 60s server-side cache per warm instance.

## Auth

Every request must send `x-session-id: <user.id>` (UUID from Supabase `users` table). The helper `sapFetch()` in `js/db.js` does this automatically once the user is logged in to Patrol.

Failure modes:
- Missing/malformed header → `401 Unauthorized`
- Session id not in users table or `is_active=false` → `401`
- HQ returned non-2xx → `502` with `{ error: 'HQ_API_ERROR', status }`
- HQ unreachable / timeout → `502` with `{ error: 'HQ_FETCH_FAILED', message }`
- Customer not in caller's scope → `403 OUT_OF_SCOPE`

## Required env vars (set in Vercel project settings)

| Name | Required | Default | Purpose |
|------|----------|---------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | **YES** | — | Lets serverless functions look up users by id without user-level auth. NEVER expose to browser. |
| `SUPABASE_URL` | no | `https://yolxcmeoovztuindrglk.supabase.co` | Override only if pointing at a different project. |
| `HQ_API_BASE` | no | `https://vieforce-hq-api-1057619753074.asia-southeast1.run.app` | Override for staging or local HQ dev. |

## Margin-stripping policy

Roles `exec`, `ceo`, `evp`, `admin` see all fields untouched.

For everyone else, these keys are recursively nulled across the entire response:

```
gm_ton, gm_per_ton, gmt,
gross_margin, gross_margin_pct,
gp, gp_pct,
margin, margin_pct,
cogs, cost_of_goods
```

The walker handles nested objects and arrays so a margin field inside a regional rollup is also nulled.

## Scope filter

| Role | Scope param sent to HQ | Server-side row filter |
|------|------------------------|-----------------------|
| `dsm` | `scope=district&district=<user.district>` | Rows whose `district`/`Territory` substring-matches user's district (case-insensitive) |
| `rsm` | `scope=region&region=<user.region>` | Rows whose `region` exactly matches user's region |
| `exec`/`ceo`/`evp`/`admin` | `scope=national` (default) | No row filter |
| `tsr`/`champion` | (no scope set) | (rows pass through HQ-side filtering only) |

If HQ doesn't honor the `scope` param, the server-side filter still trims the response to the right shape.

## Files

- `_lib/auth.js` — `verifySession(req)` + `unauthorized(res)`
- `_lib/hq-client.js` — `callHqApi()` + `callHqApiCached()`
- `_lib/scope.js` — `applyScopeAndMargins()`, `stripMargins()`, `filterRowsByScope()`
- `sales.js`, `ar.js`, `inventory.js`, `speed.js`, `customers.js`, `customer/[cardcode].js` — handlers

The `_lib` underscore prefix keeps Vercel from auto-routing those files as endpoints.

## Frontend integration (for Agent 3)

`js/db.js` now exports `sapFetch(endpoint)` (also on `window.sapFetch`). Example usage from any TSR/DSM screen:

```js
var sales = await sapFetch('/api/sap/sales?period=MTD');
if (sales.error) {
  showToast('SAP not reachable, retry later');
  return;
}
renderSalesKpis(sales);
```

The helper auto-attaches `x-session-id` from `getSession()`. No additional setup required on the frontend.

## Smoke test (after `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel)

1. Login as Jefrey (DSM, `09180000001`/`1234`) → DevTools console:
   ```js
   await fetch('/api/sap/sales?period=MTD', { headers: { 'x-session-id': getSession().id } }).then(r=>r.json())
   ```
   Expected: sales JSON, `top_customers` only contains stores in MM-North, no `gm_ton` / `gp_pct` fields populated (all `null`).

2. Login as Rina (RSM, `09180000010`/`1234`) → same call.
   Expected: regional aggregate, margin fields still `null`.

3. Login as Mat (exec, `09180000099`/`1234`) → same call.
   Expected: full national data, margin fields **populated**.

4. Customer detail RBAC:
   ```js
   await fetch('/api/sap/customer/CARDCODE_OUT_OF_DSM_SCOPE', { headers: { 'x-session-id': getSession().id } }).then(r=>r.json())
   ```
   As DSM should return `{ error: 'OUT_OF_SCOPE' }` with HTTP 403.

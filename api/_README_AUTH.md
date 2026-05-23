# Patrol API — Auth & Role-Gate Source of Truth

**Wave 1 (W1-ApiGates) — 2026-05-21.** This file is the canonical reference
for what every Patrol serverless endpoint requires from the caller. Audits
should diff against this list, not the source code.

## Contract

All gating goes through `api/_lib/api-auth.js` (Wave 1 shim — at integration
time W1-AuthCore replaces this with equivalent exports inside
`api/_lib/auth.js`).

```js
requireUser(req)                  // -> session or throws { status:401, code:'UNAUTHORIZED' }
requireRole(req, allowedRoles)    // -> session or throws { status:401|403, code:... }
withAuth(handler, { roles })      // -> wraps a Vercel handler to enforce session (+ optional role list)
```

## Role taxonomy

| Role | Description |
|---|---|
| `tsr` | Field worker (Messenger-hybrid UI). Phones, low-tech. |
| `champion` | Peer-champion TSR (1 per 10–15 TSRs). |
| `dsm` | District Sales Manager. |
| `rsm` | Regional Sales Manager. |
| `exec` / `director` / `president` | Executive read-everything roles. |
| `ceo` | CEO — full admin + read everything. |
| `evp` | EVP Sales — User Admin + manager view. |
| `marketing` | Marketing Manager — User Admin only. |
| `admin` | Sales Admin — User Admin power. |

### Convenience sets

- **SAP_ROLES** = `['dsm','rsm','exec','ceo','evp','admin']`
  Every `/api/sap/*` endpoint requires one of these (margin still
  stripped from every response regardless of role).
- **ADMIN_ROLES** = `['admin','ceo','evp','marketing']`
  Every `/api/admin/*` endpoint requires one of these.
- **AUTHENTICATED** = any role (just needs a valid session).

## Endpoint matrix

| Endpoint | Method(s) | Auth | Allowed roles | Margin-strip | Notes |
|---|---|---|---|---|---|
| `/api/health` | any | **PUBLIC** | — | n/a | Intentional liveness probe. Returns version + ts. |
| `/api/whoami` | GET | requireUser | any authenticated | n/a | Returns caller identity + Vercel telemetry + egress IP. Diagnostic. |
| `/api/farms` | POST | requireUser | any authenticated | n/a | Creates a farm; `created_by` forced from session. Audit C P0-S6 fix. |
| `/api/user/language` | PATCH, POST | requireUser | any authenticated | n/a | Self-only: patches the caller's `users.language` row. |
| `/api/admin/org` | GET, POST | requireRole | ADMIN_ROLES | n/a | Region/District/Territory CRUD + SAP sync. |
| `/api/admin/sap-reps` | GET | requireRole | ADMIN_ROLES | n/a | Active OSLP reps merged with Supabase users. |
| `/api/sap/sales` | GET | requireRole | SAP_ROLES | **YES** | HQ `/api/sales` proxy. |
| `/api/sap/sales/all` | GET | requireRole | SAP_ROLES | **YES** | Reshaped multi-section payload. Audit C P0-S5 fix added the strip. |
| `/api/sap/ar` | GET | requireRole | SAP_ROLES | **YES** | HQ `/api/ar` proxy. |
| `/api/sap/customers` | GET | requireRole | SAP_ROLES | **YES** | HQ `/api/customers` proxy. |
| `/api/sap/customer/[cardcode]` | GET | requireRole | SAP_ROLES | **YES** | HQ `/api/customer?id=<cardcode>` proxy. |
| `/api/sap/inventory` | GET | requireRole | SAP_ROLES | **YES** | HQ `/api/inventory` proxy. |
| `/api/sap/speed` | GET | requireRole | SAP_ROLES | **YES** | HQ `/api/speed` proxy. |

## Response-shape contract on auth failures

- **401 UNAUTHORIZED** — no/invalid/inactive session.
  ```json
  { "error": "UNAUTHORIZED", "message": "Missing or invalid session" }
  ```
- **403 FORBIDDEN** — session valid, role not in allowlist.
  ```json
  { "error": "FORBIDDEN", "message": "Role \"tsr\" is not permitted for this endpoint" }
  ```
- **405** — wrong HTTP method (when explicitly checked).
- **502** — upstream (Supabase REST or HQ Cloud Run) unreachable or 5xx.
- **504** — HQ Cloud Run timed out.

## Defence-in-depth invariants

1. **`/api/sap/*` payloads NEVER carry margin keys.** `stripMarginsIfNeeded`
   runs unconditionally on every response, before `wrapPatrolMeta`. This is
   true even for `exec` / `ceo` roles — Patrol is the field app, margins
   live on the HQ desktop only.
2. **Service-role Supabase key never reaches the browser.** Only `api/_lib/*`
   and `api/**/*.js` read `SUPABASE_SERVICE_ROLE_KEY`.
3. **`x-session-id` is the only auth mechanism today.** It is the user's
   raw UUID — W1-Session migrates this to a signed JWT in parallel; this
   file documents the shape of the contract, not the cryptographic strength.
4. **CORS reflective allowlist.** No wildcard `*` for cross-origin in any
   environment; preview/prod origins are configured via
   `PATROL_CORS_ORIGINS` plus the defaults in `api/_lib/patrol-cors.js`.

## How to add a new endpoint

```js
const { requireRole } = require('./_lib/api-auth');
const { applyPatrolCors } = require('./_lib/patrol-cors');

const ALLOWED = ['dsm', 'rsm', 'exec', 'ceo', 'evp', 'admin'];

module.exports = async function handler(req, res) {
  applyPatrolCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let session;
  try {
    session = await requireRole(req, ALLOWED);
  } catch (err) {
    const status = (err && err.status) || 401;
    return res.status(status).json({ error: err.code || 'UNAUTHORIZED', message: err.message });
  }

  try {
    // ... your logic, always wrapped in try/catch ...
    return res.status(200).json(result);
  } catch (err) {
    console.error('[api/your-endpoint] failed:', (err && err.message) || err);
    return res.status(502).json({ error: 'UPSTREAM_UNREACHABLE' });
  }
};
```

Then add a row to the table above. Audit C uses this file as the source of
truth — drift here means drift in production.

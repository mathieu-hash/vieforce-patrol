# VieForce Patrol — Operations Runbook

Concise playbook for production incidents and release verification. Pair with [`PRE-RELEASE-SMOKE-CHECKLIST.md`](./PRE-RELEASE-SMOKE-CHECKLIST.md).

## OAuth / Google redirect failures

**Symptoms:** Blank page after Google, `redirect_uri_mismatch`, or loop back to login with no session.

**Checks:**

1. **Supabase Dashboard → Authentication → URL configuration**
   - `Site URL` must match production (e.g. `https://vieforce-patrol.vercel.app`).
   - **Redirect URLs** must include:
     - `https://vieforce-patrol.vercel.app/**`
     - Any staging host you use, same pattern.
     - Local dev: `http://localhost:<port>/**` if testing Google locally.

2. **App config** — `config.js` → `OAUTH_PUBLIC_ORIGIN` must equal the public HTTPS origin used for OAuth (not `file://`). The app warns in the browser console if the live page origin disagrees with `OAUTH_PUBLIC_ORIGIN`.

3. **Read-only verify (CI / pre-release)** — with a Management API token:

   ```bash
   npm run check:supabase-auth
   ```

   **Write fix** (requires token with auth config permission):

   ```bash
   npm run fix:supabase-auth-url
   ```

## Role mismatch / manager access

**Symptoms:** Google login succeeds but user is rejected or lands as wrong role.

**Checks:**

1. **`users` row** in Supabase: `email` matches Google account, `is_active = true`, `role` in `dsm | rsm | exec | admin | ceo` (managers per `js/auth.js` → `GOOGLE_MANAGER_ROLES`).

2. **Domain** — Google login is intended for `@vienovo.ph` (see `GOOGLE_ALLOWED_DOMAIN` in `auth.js`).

3. **Deactivate user** — set `is_active = false`; session TTL is 24h until logout.

## Stuck offline sync queue

**Symptoms:** Orange/red sync bar, visits/stores never appear in Supabase.

**Checks:**

1. Browser DevTools → Application → IndexedDB → `PatrolOffline` → inspect `pendingVisits` / `pendingStores` / `pendingFarms`.

2. Console helpers (app shell):

   - `patrolInspectQueue()` — dump pending rows.
   - `patrolClearQueue()` — **destructive** local clear; use only after confirming data is duplicated or abandoned.

3. **Permanent eject** — after 3 failed retries the queue drops the row (`MAX_SYNC_RETRIES` in `js/offline.js`). Check console for `[sync] ... permanent fail — ejecting`. User should re-enter the record if needed.

4. **Idempotent duplicates** — if the server already has the row (e.g. retry after timeout), duplicate-key errors are treated as success and the local row is removed.

## User activation / deactivation

- **Deactivate:** `users.is_active = false` — blocks new PIN/Google resolution for that account.
- **Existing sessions:** expire within 24h or clear by user logout; no instant kill of all devices without signing out.

## Boot / blank shell

1. Open app with `?bootlog=1` once (persists `patrol_bootlog` in localStorage) to surface boot trace.
2. **Recovery:** `ensurePatrolShellVisible()` forces `page-home` if no `.page.active`; duplicate `.active` pages are collapsed to one.

## Sales tab — direct SAP endpoints empty/erroring

`/api/sap/sales/all` (and the by-customer / whitespace / at-risk siblings) hit SAP B1 MSSQL directly at `analytics.vienovo.ph:4444 / Vienovo_Live`. If they fail:

1. **`is_empty: true` in response** → user has no `users.sap_slpcode`. Map them in Supabase (e.g. `update users set sap_slpcode = 41 where phone = '...';`).
2. **`502 SAP_UNAVAILABLE`** with `message: "SAP server unreachable. Try again."`
   - Server / network problem upstream — see triage below.
3. **`502 SAP_UNAVAILABLE`** with `message: "SAP query failed."`
   - Auth / DB / SQL problem — see triage below.
4. **Slow first request** → cold-start of `mssql` pool (~500ms). Subsequent requests reuse the pool.

### Connectivity triage (run *before* changing code)

```powershell
# Windows: TCP-level reachability
Test-NetConnection analytics.vienovo.ph -Port 4444
```

```bash
# *nix
nc -vz analytics.vienovo.ph 4444
```

- **`TcpTestSucceeded : True`** → server is up; problem is auth/SQL/DB.
- **Timeout / refused** → upstream issue. **Do not touch code.** Notify IT/DBA.

### Common SAP failure modes

| Symptom | Likely cause | First action |
|---|---|---|
| `Failed to connect ... in 15000ms` | Host unreachable (server down, firewall, IP not allowlisted) | TCP test above; if other tools (Apps Script SBO sheet, MCP) are also failing → infra. |
| `Login failed for user 'gsheet'` | Password rotated or login locked | Coordinate with DBA; update `SAP_DB_PASS` in **all** locations (see "If we rotate `gsheet` password" below). |
| `Cannot open database "Vienovo_Live"` | Login lost DB access | DBA grants `db_datareader` on `Vienovo_Live`. |
| `SSL Handshake failed` | TLS settings mismatch | Patrol uses `SAP_DB_ENCRYPT=0`, `SAP_DB_TRUST=1`. Verify server didn't flip cert behavior. |
| `Connection reset` mid-query | Idle timeout, MTU, or DB restart | Pool is `idleTimeoutMillis=30000`. If persistent, ask DBA for SQL error log. |
| `Invalid object name 'OCRD'` | Wrong DB / wrong company | Confirm `SAP_DB_NAME=Vienovo_Live` (not `Vienovo_Old`). |
| `only SELECT statements allowed` (Patrol logs) | `querySelect` guard tripped | Query started with `WITH`/CTE — rewrite as derived table (see `atRiskSql`). |

### Where Patrol holds these creds

- **Local dev:** `C:\VienovoDev\vieforce-patrol\.env.local`
- **Production:** Vercel project envs (`SAP_DB_HOST/PORT/NAME/USER/PASS/ENCRYPT/TRUST`) — encrypted, set via `vercel env add NAME production --value '...' --yes`
- **Code path:** [`api/_lib/sap-mssql.js`](../api/_lib/sap-mssql.js) → `mssql.connect()`
- **Auth model:** Same `gsheet` SQL Server login as the SBO Google Sheet (read access).

### If we rotate `gsheet` password

Update in **all** of these (otherwise something will silently break):

1. SQL Server: `ALTER LOGIN gsheet WITH PASSWORD = '<new>';`
2. Patrol Vercel: `vercel env rm SAP_DB_PASS production` then re-add with `--value '<new>' --yes`
3. Patrol local: edit `.env.local`
4. Apps Script (SBO sheet): Project Settings → Script Properties → `SCOS_SAP_PASS`
5. Cursor MCP: `~/.claude/settings.json` → `mssql-sap-b1.env.MSSQL_CONNECTION_STRING`

## Escalation contacts

- **Supabase project:** see repo env / `SUPABASE_PROJECT_REF` in scripts.
- **HQ (SAP-heavy modules):** `https://vieforce-hq.vercel.app` — referenced from gated Sales stubs in Patrol.

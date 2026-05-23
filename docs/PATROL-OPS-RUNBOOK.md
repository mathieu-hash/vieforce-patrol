# VieForce Patrol — Operations Runbook

**Last reviewed:** 2026-05-21

Concise playbook for production incidents and release verification. Pair with [`PRE-RELEASE-SMOKE-CHECKLIST.md`](./PRE-RELEASE-SMOKE-CHECKLIST.md).

> **Architecture note:** Live `/api/sap/*` routes go **Browser → Patrol (Vercel) → HQ Cloud Run → MSSQL**. The legacy direct-MSSQL path (`SAP_DB_*` env vars, Azure NSG allowlist) has been retired for the Sales tab and is preserved only as an annex at the bottom of this runbook.

## Sales tab — SAP data empty/erroring (HQ-proxy path)

`/api/sap/sales`, `/api/sap/ar`, `/api/sap/customers`, `/api/sap/inventory`, `/api/sap/speed`, and `/api/sap/customer/[cardcode]` all hit HQ Cloud Run via `callHqProxy()`. If they fail:

1. **`is_empty: true` in response** → user has no SAP scope. Verify `users.sap_slpcode` is mapped in Supabase. For TSR/DSM/RSM, also confirm territory/district/region tables resolve to a non-empty SlpCode set on HQ. Map them with e.g. `update users set sap_slpcode = 41 where phone = '...';`.
2. **`401`** → bad/expired session. Confirm browser is sending `x-session-id` and that `SUPABASE_SERVICE_ROLE_KEY` on Vercel is intact (used by `api/_lib/auth.js` to resolve session → user row).
3. **`502/504` with `hq_status` in body** → HQ upstream is the failure point. Inspect `hq_status` and triage HQ, not Patrol.
4. **Generic `502 SAP_UNAVAILABLE`** → HQ couldn't reach MSSQL. Escalate to HQ on-call; do not change Patrol code.

### HQ-proxy triage checklist (run before changing code)

```bash
# 1. Confirm HQ itself is up
curl -s https://vieforce-hq.vercel.app/api/health

# 2. Confirm Patrol can reach HQ from its serverless egress
curl -s https://vieforce-patrol.vercel.app/api/health

# 3. Confirm session resolves on Patrol
curl -s -H "x-session-id: <uuid>" https://vieforce-patrol.vercel.app/api/sap/sales?period=MTD | jq .

# 4. Read patrol_meta envelope — it carries hq_status and scope diagnostics
```

### Common HQ-proxy failure modes

| Symptom | Likely cause | First action |
|---|---|---|
| All `/api/sap/*` return `401` | `SUPABASE_SERVICE_ROLE_KEY` missing/rotated on Vercel | Re-add via `vercel env add SUPABASE_SERVICE_ROLE_KEY production` and redeploy. |
| All `/api/sap/*` return `502 hq_status:401` | `HQ_SERVICE_TOKEN` rotated on HQ but not on Patrol | Update `HQ_SERVICE_TOKEN` on Patrol Vercel to match HQ; redeploy. |
| `patrol_meta.is_empty: true` for one user | No SlpCode/territory mapping | Map user in Supabase `users` table per their role. |
| `502 hq_status:504` | HQ → MSSQL timeout (DB slow or NSG blocking HQ Cloud Run egress IP) | Page HQ on-call; check HQ Cloud Run logs. |
| Sporadic `502` only on Patrol but HQ direct calls work | Patrol → HQ network blip; one retry already happens in `callHqProxy` | Confirm via Vercel logs; if persistent, raise with HQ. |
| Sales numbers stale/wrong | HQ scope mis-resolution for that user | Verify `scope=user:<uuid>` in Patrol Vercel logs; inspect HQ scope handler. |

### Where Patrol holds the HQ creds

- **Local dev:** `C:\VienovoDev\vieforce-patrol\.env.local` — `HQ_API_BASE_URL`, `HQ_SERVICE_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Production:** Vercel project envs — same three vars, encrypted.
- **Code path:** [`api/_lib/hq-client.js`](../api/_lib/hq-client.js) → `callHqProxy(hqPath, session, params)`.

### If we rotate `HQ_SERVICE_TOKEN`

Update in **both** of these (otherwise Patrol's SAP tab breaks):

1. HQ Vercel: `vercel env rm HQ_SERVICE_TOKEN production` then re-add with the new value.
2. Patrol Vercel: `vercel env rm HQ_SERVICE_TOKEN production` then re-add with the **same** new value.
3. Redeploy both.

---

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

## PIN reset for a TSR who can't log in

**Symptoms:** TSR or Champion reports they cannot log in with their phone + PIN. Calls or messages the admin.

**Procedure (Sales Admin):**

1. **Verify identity** out-of-band (Messenger, phone call, manager confirms) before changing credentials. Never reset a PIN on an anonymous request.
2. Open Sales Admin: `https://vieforce-patrol.vercel.app/admin.html` (Google-OAuth gated; admin role required).
3. Find the user by phone or name. Confirm:
   - `is_active = true`
   - `role` matches expected (`tsr` / `champion` / `dsm` / etc.)
   - `phone` matches the number the TSR is calling from.
4. Click **Edit User** → **Set new PIN** → enter a temporary 4–6 digit PIN (avoid `0000`, `1234`, or birthday-like patterns).
5. SMS the new PIN to the TSR's registered phone (use the admin's own phone or the corporate SMS account — never paste into Messenger group chats).
6. Tell the TSR to log in immediately and change it if/when self-service PIN change is shipped (currently not in product — admin must set each time).
7. Audit trail: PIN updates are logged via the `verify-pin` Edge Function path on Supabase; check the function logs if you need to confirm when the change took effect.

**If the TSR still cannot log in after a PIN reset:**

- Confirm `users.is_active = true` (deactivated users get a generic "login failed" message).
- Confirm the phone field has no leading zero / country-code drift (`09171234567` vs `+639171234567`).
- Check the TSR is on the latest `app.html` (hard refresh; `?nosw=1` to bypass the service worker shell cache once).

## Photo upload failure on TSR phone

**Symptoms:** Red toast in the visit form ("Hindi na-upload" / photo upload failed). TSR cannot finish submitting a visit, or the visit submits but the photo is missing in Supabase.

**Triage:**

1. **Confirm the TSR is online.** In the browser console of the TSR's device (or by asking them to retry on WiFi), check `navigator.onLine === true`. If offline, photo upload is deferred — see workaround below.
2. **Check `js/camera.js` compression flow** — the file compresses to 640px max / JPEG q0.5 / ~50KB before upload. If a phone is hitting the compression failure path (very low-RAM device, corrupt camera blob), the error toast fires before any network call. Reproduce on the device's Chrome and watch the console; a `[camera] compress failed` log is the smoking gun. Workaround: ask the TSR to re-take the photo; the compression path runs again on retry.
3. **Check Supabase Storage bucket policy on `patrol-photos`.** The bucket must allow authenticated `INSERT` for the TSR's role. From the Supabase dashboard → Storage → `patrol-photos` → Policies. If a policy was tightened (e.g. anon revoked), photo upload returns 403 even though visit insert works.
4. **Check Supabase Storage quota / billing status.** A full or suspended project surfaces as a 5xx on upload but not on `users` reads — the visit form may look healthy until the camera step.

**Workaround for the TSR in the field (verify before promising it):**

> **GAP — needs Wave 2 verification.** As of 2026-05-21 the visit form's "save without photo and re-attach later" path is **not confirmed**. The submit handler in `js/db.js` accepts a missing `photo_url`, so submitting without a photo does succeed and the visit syncs; however there is no re-attach UI today (no "edit visit → add photo" flow). Treat this as a **P1 gap** for W2: either build the re-attach UI, or make the absence explicit in the visit form copy. Until then, the TSR's only workaround is to retake the photo until it succeeds, or skip the photo entirely (the visit will sync without it but the photo cannot be added later from the app).

**Escalation:**

- If multiple TSRs simultaneously hit photo upload errors → almost always Supabase Storage policy or quota. Page the admin and roll back any recent storage-policy migration.
- If a single TSR is affected and online → device-specific. Have them re-install or use the web app on a different phone for the day.

## Vercel deploy rollback

**Symptoms:** A production deploy broke the app (auth loop, blank shell, JS exception on boot, /api/sap/* universally failing) and the cause is not obviously fixable in <10 minutes.

**Procedure:**

1. **Confirm it's a deploy regression, not an upstream outage.** Hit `https://vieforce-patrol.vercel.app/api/health` — if 200, Patrol is up; the issue is in the new code. If 5xx and `/api/whoami` also 5xx, the platform itself is degraded — check the Vercel status page before rolling back.
2. **Identify the previous good deploy.** Vercel Dashboard → `vieforce-patrol` project → Deployments → find the most recent `Ready` deploy **before** the broken one. Note its deployment ID (e.g. `dpl_Gnru4...`).
3. **Roll back via CLI** (preferred — instant, auditable):

   ```bash
   vercel rollback <deployment-url-or-id> --token <vercel-token>
   ```

   Or from the dashboard: open the previous good deploy → **Promote to Production**.

4. **Wait <30 seconds** for the alias `vieforce-patrol.vercel.app` (and `patrol.vienovo.ph`) to flip.
5. **Smoke-check post-rollback** (mandatory):
   - Open `https://vieforce-patrol.vercel.app` in an incognito window.
   - `index.html` loads, Google OAuth button renders, phone+PIN box renders.
   - Log in as a manager → DSM Pulse loads (skeleton then data).
   - `/api/health` returns 200.
   - `/api/sap/sales?period=MTD` with a valid `x-session-id` returns data (or `is_empty:true`, not 5xx).
   - Visit form opens; photo button responds.
   - **Hard-refresh** at least once to bust the service-worker shell cache from the bad deploy.
6. **Tell the team in the active channel.** Include: rolled-back deploy ID, restored deploy ID, suspected cause, and that you have NOT yet redeployed forward.
7. **Investigate the broken deploy on a branch**, fix, PR, re-deploy. Do **not** re-promote the broken deploy.

**Useful links:**

- Vercel project: `https://vercel.com/mathieu-7782s-projects/vieforce-patrol`
- Deployments tab: filter by `Ready` to find candidates.

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
3. If a bad service worker is suspected, open once with `?nosw=1` (or set `localStorage.patrol_nosw=1`) to bypass the SW shell cache.

## Escalation contacts

- **Supabase project:** see repo env / `SUPABASE_PROJECT_REF` in scripts.
- **HQ (SAP-heavy modules):** `https://vieforce-hq.vercel.app` — referenced from gated Sales stubs in Patrol.

---

# Annex: Legacy direct-MSSQL tooling (retired)

> **Status:** The live Patrol Sales tab no longer uses this path. All `/api/sap/*` routes proxy through HQ Cloud Run (see top of runbook). This annex is retained for: (a) the small set of `/api/sap/sales/*` "speed" endpoints that may still flip to direct-MSSQL per `api/sap/README.md`, and (b) local-tooling/scripts that still read `SAP_DB_*` env vars (Apps Script SBO sheet, Cursor MCP). Do **not** start triage here for production Sales tab incidents.

## Sales "speed" endpoints — direct SAP path

Some `/api/sap/sales/*` siblings (by-customer / whitespace / at-risk per `api/sap/README.md`) historically used direct MSSQL at `analytics.vienovo.ph:4444 / Vienovo_Live`. Symptoms when they fail:

1. **`502 SAP_UNAVAILABLE`** with `message: "SAP server unreachable. Try again."` → upstream/network. See connectivity triage below.
2. **`502 SAP_UNAVAILABLE`** with `message: "SAP query failed."` → auth/DB/SQL.
3. **Slow first request** → cold-start of `mssql` pool (~500ms). Subsequent requests reuse the pool.

### Connectivity triage

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

### Common direct-MSSQL failure modes

| Symptom | Likely cause | First action |
|---|---|---|
| `Failed to connect ... in 15000ms` | Host unreachable (server down, firewall, IP not allowlisted) | TCP test above; if other tools (Apps Script SBO sheet, MCP) are also failing → infra. |
| `Login failed for user 'gsheet'` | Password rotated or login locked | Coordinate with DBA; update `SAP_DB_PASS` in all locations (see below). |
| `Cannot open database "Vienovo_Live"` | Login lost DB access | DBA grants `db_datareader` on `Vienovo_Live`. |
| `SSL Handshake failed` | TLS settings mismatch | Patrol uses `SAP_DB_ENCRYPT=0`, `SAP_DB_TRUST=1`. Verify server didn't flip cert behavior. |
| `Connection reset` mid-query | Idle timeout, MTU, or DB restart | Pool is `idleTimeoutMillis=30000`. If persistent, ask DBA for SQL error log. |
| `Invalid object name 'OCRD'` | Wrong DB / wrong company | Confirm `SAP_DB_NAME=Vienovo_Live` (not `Vienovo_Old`). |
| `only SELECT statements allowed` (Patrol logs) | `querySelect` guard tripped | Query started with `WITH`/CTE — rewrite as derived table (see `atRiskSql`). |

### Where direct-MSSQL creds live (legacy)

- **Local dev:** `C:\VienovoDev\vieforce-patrol\.env.local` (legacy block).
- **Production:** Vercel envs `SAP_DB_HOST/PORT/NAME/USER/PASS/ENCRYPT/TRUST` (only consumed by the speed endpoints that have not migrated to HQ).
- **Code path:** [`api/_lib/sap-mssql.js`](../api/_lib/sap-mssql.js) → `mssql.connect()`.
- **Auth model:** Same `gsheet` SQL Server login as the SBO Google Sheet (read access).

### If we rotate `gsheet` password

Update in **all** of these (otherwise something will silently break):

1. SQL Server: `ALTER LOGIN gsheet WITH PASSWORD = '<new>';`
2. Patrol Vercel: `vercel env rm SAP_DB_PASS production` then re-add with `--value '<new>' --yes`
3. Patrol local: edit `.env.local`
4. Apps Script (SBO sheet): Project Settings → Script Properties → `SCOS_SAP_PASS`
5. Cursor MCP: `~/.claude/settings.json` → `mssql-sap-b1.env.MSSQL_CONNECTION_STRING`

## Azure NSG allowlist for direct-MSSQL (legacy)

> **Note:** Azure NSG behavior only matters for the legacy direct-MSSQL "speed" endpoints and for local-tooling/scripts. The live Patrol Sales tab does not touch the NSG — its traffic goes Patrol → HQ → MSSQL and is allowlisted at HQ's egress, not Patrol's.

The Azure VM `analytics` (host `analytics.vienovo.ph`, port `4444`) restricts inbound traffic via NSG. Any client that needs direct SAP MSSQL access must have its source IP explicitly allowlisted.

### Required entries

- Google Apps Script ranges (for the SBO sheet — already in place)
- `vieforce-hq` Vercel egress IPs (find via `/api/whoami`)
- `vieforce-patrol` Vercel egress IPs (only if direct-MSSQL endpoints are still in use)
- Each developer's current home public IP (`https://ifconfig.me`)
- Vienovo office static IP (if applicable)
- The `C:\VieForce\` daemon machine's public IP (often = a developer IP)

### Why connections fail with TIMEOUT (not REFUSED)

The NSG drops blocked packets silently → TCP **timeout**. If you see `connection refused` the SQL Server is down; if you see `timeout`, it's almost always the NSG.

### When direct-MSSQL "goes down" — order of investigation

1. **Test from an allowlisted source** (the SBO Google Sheet, or `vieforce-hq` Vercel) — if it works there, SAP is up and the issue is **your source IP isn't allowlisted** (90% of cases).
2. **Confirm Vercel egress IP** via `GET /api/whoami` — Vercel rotates IPs per invocation on Hobby plans. Hit it 5+ times to collect the rotation set:

   ```bash
   for i in 1 2 3 4 5; do curl -s https://vieforce-patrol.vercel.app/api/whoami | jq .egress_ip; done
   for i in 1 2 3 4 5; do curl -s https://vieforce-hq.vercel.app/api/whoami    | jq .egress_ip; done
   ```

3. **RDP to the analytics VM** only if (1) and (2) both fail.

### Adding new IPs to NSG (Azure Portal)

1. **Azure Portal** → VM `analytics` → **Networking** → **Network security group** → **Inbound security rules**.
2. Find the rule that opens port `4444` (or create one).
3. Append the new IPs to **Source IP addresses/ranges**, comma-separated.
4. Save. Effective in <30 sec.

### Durable options (Vercel rotates IPs — Phase-1 fix breaks within days)

| Option | Cost | Effort | Stability |
|---|---|---|---|
| **A. Vercel Secure Compute (Pro plan)** | $20/seat/mo + add-on | 1 hour | Static IP, supported |
| **B. Bastion proxy on small Azure VM in same VNet** (Patrol/HQ call it instead of SAP directly) | ~$5/mo | 2–4 hours | Most robust |
| **C. Cloudflare Tunnel from `C:\VieForce` machine + allowlist Cloudflare ranges** | Free | 30 min | Depends on home internet |
| **D. Keep allowlisting Vercel ranges as they change** | Free | Recurring pain | Will break repeatedly |

**Recommended (historical):** **Option B** — bastion VM in the analytics VNet, allowlist only its private IP on the SAP NSG, both apps call the bastion. SAP is never exposed beyond the VNet. **Current state:** Patrol moved to the HQ-proxy path, which is functionally equivalent to a bastion (HQ Cloud Run is the bastion). The NSG only needs HQ's egress IPs allowlisted, plus the tooling clients above.

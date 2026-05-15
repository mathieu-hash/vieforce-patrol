# Patrol session resume log — 2026-05-03

Use this file to pick up where the team left off. Safe to commit (no secrets).

---

## Latest production deploy

| Field | Value |
|--------|--------|
| **When** | 2026-05-03 (deploy completed successfully from this machine) |
| **Stable URL** | https://vieforce-patrol.vercel.app |
| **Deployment ID** | `dpl_Gnru4KmA1b2xbU7WZfa3hiASeTMd` |
| **Inspect** | https://vercel.com/mathieu-7782s-projects/vieforce-patrol/Gnru4KmA1b2xbU7WZfa3hiASeTMd |
| **This build URL** | https://vieforce-patrol-n57152ope-mathieu-7782s-projects.vercel.app |

---

## Shipped in this deploy (nav UX)

**Problem:** DSM/RSM/CEO **6-tab** bottom bar often **hides Visit / Sales / Leaders** on narrow phones — bar is `overflow-x: auto` but WebViews stay at `scrollLeft=0`, so users think tabs are “gone” (recurring report).

**Fix:** `js/nav-role-device.js` — after `updateNavActive()`, call `scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' })` on the active `.nav-item` so the selected tab scrolls into view.

**Cache bust:** `app.html` → `js/nav-role-device.js?v=17`

**Tests:** `npm run test:unit` — all passing before deploy.

---

## Supabase / HQ scope (Windel) — already applied

| User | UUID | Notes |
|------|------|--------|
| **WINDEL OLIVA** | `989b03e0-2d55-4c0d-88bf-41c72d94ba8a` | `sap_slpcode=41` (OSLP confirmed). `sap_district_code=8`, `district_label=Cebu South` — matches `OCRD.U_districtName` integer for primary Cebu South book. |
| **Marvin Dela Cruz** | `1ea620dd-a652-4023-b89d-430af09bbd56` | Not in OSLP — `sap_slpcode` / `sap_district_code` stay **NULL** (empty HQ scope until SAP mapping exists). |
| **Demo TSRs** | Alpha/Beta/Gamma | Reverted: `sap_slpcode` NULL, `manager_id` NULL (detached from Windel) — clean rollups / audit. |

**HQ DSM scope rule (summary):** own `sap_slpcode` + TSRs under `manager_id` with non-null `sap_slpcode` + `sap_district_code` → `districtCodes` for SQL. `district_mappings` table is **not** read by HQ `api/_scope.js` for `/api/sales` scope.

---

## SAP / Sales “zeros” — not a bug

Direct SAP check: **no OINV in May 2026 MTD yet** for Windel’s scoped book; last invoice **2026-04-29**. So **`kpis.bags: 0`** for MTD May is **correct** until May invoices post. Patrol + HQ + scope wiring verified via `GET /api/sap/sales/all?period=MTD` + `x-session-id: <Windel UUID>` → **200**, `is_empty: false`.

---

## HQ product note — leaderboard tiers (RSM vs DSM)

**Ask:** Align VieForce HQ roadmap so **RSM and DSM are never one mixed rank level** (same podium / same ordinal rank across tiers). Patrol now mirrors that locally: when **two or more** of Executive / RSM / DSM / Field have people on the board, the Leaders tab renders **separate podiums and ranking sections per tier** (`partitionRowsByLeaderTier`, `shouldUseTieredLeaderLayout` in `js/phase4-social.js`). Confirm wording and analytics expectations with HQ before changing HQ-owned APIs.

---

## Still open (next session)

1. **Marvin:** When OSLP exists, set `sap_slpcode` (and `sap_district_code` if district-scoped) — do not guess.
2. **HQ_SERVICE_TOKEN:** One-time parity check **Vercel** ↔ **Google Cloud Run** (or rotate both together).
3. **SAP MCP / `gsheet`:** If `Login failed for user 'gsheet'`, fix SQL password in MCP config then **Cursor → MCP: Restart MCP Servers** (password may live in `~/.claude/settings.json` per local setup). VPN alone does not fix SQL auth failures.
4. **Field verification:** After deploy, DSM phone — confirm **Visit/Sales/Leaders** tabs **scroll into view** when selected; hard-refresh once to load `nav-role-device.js?v=17`.

---

## Key file references

- Leaderboard tier split: `js/phase4-social.js` (`assignLeaderTier`, `renderPodiumStacked`, `renderRankingsTiered`)
- Bottom nav config: `js/nav-role-device.js`
- Nav scroll + active: `updateNavActive` / `scrollActiveBottomNavTabIntoView`
- Bottom bar CSS: `css/patrol.css` (`.bottom-nav`), `css/density-pass.css`, `css/dsm-rsm-mobile.css`
- SAP proxy: `api/sap/sales/all.js`, `api/_lib/hq-client.js`
- Ops: `docs/PATROL-OPS-RUNBOOK.md`, `api/sap/README.md`

---

## Resume checklist (copy)

- [ ] Open `docs/PATROL-SESSION-RESUME-2026-05-03.md` (this file)
- [ ] Confirm https://vieforce-patrol.vercel.app loads `nav-role-device.js?v=17`
- [ ] Windel: Sales MTD after first May invoice in SAP
- [ ] Marvin mapping when SAP salesperson exists
- [ ] Token parity + MCP SQL auth if doing server-side SAP queries from Cursor

# VieForce Patrol — Agent Handoff
**Date:** 2026-05-19  
**Repo:** `c:\VienovoDev\vieforce-patrol`  
**Branch:** `main` (in sync with `origin/main` at commit `2b13b4b`)  
**Live:** https://vieforce-patrol.vercel.app  

---

## Quick start (paste into a new agent chat)

```
You are taking over VieForce Patrol (vieforce-patrol repo).

Read these first:
1. docs/SESSION_HANDOFF_2026-05-19-org-admin.md (this file)
2. CLAUDE.md (TSR design rules — offline-first, 64px targets, no spinners on TSR screens)

Priority: finish and ship the unpushed "org admin" work (Region/District/Territory from SAP).
Then ask the user what they want next.

Do NOT commit unless the user explicitly asks.
```

---

## What was just built (NOT committed / NOT deployed)

### Goal
Admin page to manage **Region** and **District** (SAP-synced) plus **Territory** (Patrol-only sub-routes), replacing free-text org fields on user records.

### Files (all local — verify with `git status`)

| Area | Path |
|------|------|
| Page | `admin-org.html` |
| UI script | `js/admin-org.js` |
| Styles | `css/admin-org.css` |
| API route | `api/admin/org.js` |
| Libs | `api/_lib/org-sync.js`, `api/_lib/supabase-service.js`, `api/_lib/user-admin.js` |
| Migration | `supabase/migrations/20260518120000_patrol_org_master.sql` |
| Unit test | `tests/unit/org-sync.test.js` (added to `package.json` test:unit) |
| Sales Admin wiring | `admin.html`, `js/admin.js` (dropdowns + link to org page) |

### Already on production (`2b13b4b`)
- Sales Admin user list → **card layout** (not wide table) — hint text "layout v3 (cards)"
- DSM squad feed read-only (no composer)
- Various pilot hardening from that commit

### Supabase
- Migration **`patrol_org_master`** was applied via Supabase MCP during the session (tables: `patrol_org_regions`, `patrol_org_districts`, `patrol_org_territories`).
- RLS enabled, **no anon policies** — org API uses **service role** (`SUPABASE_SERVICE_ROLE_KEY` on Vercel).

### API behavior
- `GET /api/admin/org` — full tree + user counts (matches `users.region/district/territory` by normalized name)
- `POST /api/admin/org` actions:
  - `sync_sap` — HQ paths then fallback `sap_accounts` + users
  - `territory_create` / `territory_update` / `territory_delete`
  - `region_update` / `district_update` (is_active, name)

### Auth gate (org + user admin)
Roles allowed: `ceo`, `admin`, `evp`, `marketing` — see `api/_lib/user-admin.js` and `canAccessUserAdmin()` in `js/auth.js`.

### Sales Admin integration
- Link: **Region / District / Territory (SAP + Patrol)** → `admin-org.html`
- Add/Edit user: Region, District, Territory are **select** elements wired via `window.PatrolAdminOrgPicklists` in `js/admin-org.js` (`wireSelects`, `applyValues`).

### Known follow-ups
1. **Commit + push** all org-admin files so Vercel serves `admin-org.html` and `/api/admin/org`.
2. After deploy: open `admin-org.html` → **Sync from SAP** (empty tree until first sync).
3. Optional: E2E test for `admin-org.html`.
4. Untracked `scripts/_patch_assign.py` — likely scratch; do not commit unless user wants it.
5. User edit modal on production still shows text inputs until deploy; local has dropdowns.

### Bug fixes done this session
- Removed erroneous `motion.div` tags in `js/admin-org.js` and `admin-org.html` (invalid HTML from autocomplete).

---

## How to verify locally

```powershell
cd c:\VienovoDev\vieforce-patrol
npm run test:unit
```

Manual:
1. Log in as Sales Admin → `admin.html` — card list, org link, dropdowns on Add/Edit.
2. `admin-org.html` — Sync from SAP, pick region/district, add territory.

---

## Architecture reminders

- **Stack:** Static HTML/JS on Vercel + `api/*` serverless routes + Supabase (auth, DB, photos).
- **TSR screens:** Messenger-hybrid UX, offline-first (Dexie `js/offline.js`), `CLAUDE.md` rules are non-negotiable.
- **DSM/RSM/CEO:** Navy executive UI on `app.html` / pulse / admin.
- **HQ data:** `callHqProxy` in `api/_lib/hq-client.js` — Cloud Run HQ with `HQ_SERVICE_TOKEN`.
- **User org fields:** Still plain text columns on `users` (`region`, `district`, `territory`); master tables are the source of truth for dropdown labels.

---

## Suggested next commit message (when user asks)

```
Add SAP-backed org master admin for regions, districts, and Patrol territories.

Introduces admin-org UI, /api/admin/org, and picklist wiring on Sales Admin so region/district align with SAP instead of free-text typos.
```

---

## Transcript reference

Parent conversation: Org admin + Sales Admin — transcript id `2a054764-28a6-4f77-94be-cf5e73a207d3`.

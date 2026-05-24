# VieForce Patrol — Product context

**Register:** product (app UI, admin, dashboards — design serves the product; not marketing/landing).

## Purpose

Patrol is Vienovo Philippines’ **field sales execution app**: store mapping, visits, lightweight CRM, and manager visibility for the livestock and pet feed channel. It must work on **mid-range Android phones** in sun and poor connectivity, and on **desktop** for managers and admin.

## Users

| Persona | Primary surfaces | Auth | Job to be done |
|---------|------------------|------|----------------|
| **TSR / Champion** | `app.html` — stores, visits, map, profile | **Phone + PIN** | Daily route, offline visits, photos, sync when online |
| **DSM / RSM** | `app.html` — Pulse, assign, sales tab, team | **Google OAuth** (`@vienovo.ph`) | Team coverage, coaching, assignees, territory KPIs |
| **Exec / EVP / CEO** | `app.html` — rich home, portfolio KPIs | **Google OAuth** | Hierarchy visibility; often HQ-aligned reads |
| **Sales Admin** | `admin.html`, `admin-org.html`, `admin-users-sap.html` | **Google OAuth** (Sales Admin role) or PIN where provisioned | Patrol accounts, org master, SAP roster alignment |
| **Marketing Manager** | `admin.html` (user admin) | **Google OAuth** | User admin alongside Sales Admin / EVP |

**TSR design register:** Messenger-hybrid (white, `#00A6CE`, chat-row store list). See `CLAUDE.md` §16–17 — 64px taps, trilingual `T.*` / `labels-v2.js`, skeletons not spinners, offline-first, max **4** bottom tabs.

**Manager / exec register:** Vienovo navy / Elite tokens (`css/tokens.css`), data-dense but mobile-tolerant.

**Admin register:** Desktop-first acceptable; card layouts on narrow screens; shared `admin-page.css` patterns.

## Authentication

Two login paths on `index.html`:

1. **TSR — Phone + PIN**  
   Matches `users.phone` + `pin_hash` via Supabase `verify-pin`. No email required.

2. **Manager — Google OAuth**  
   Domain locked to **`@vienovo.ph`**. After OAuth, Patrol loads the manager row with **`users.email`** (exact match, lowercased). Roles allowed: `dsm`, `rsm`, `exec`, `admin`, `ceo` (`js/auth.js` → `GOOGLE_MANAGER_ROLES`).

**Sales Admin Google login requires a profile email.** Set in **Sales Admin → Edit User → Email** (`admin.html`). Must be the same `@vienovo.ph` address as the Google account. Manager roles without email show **“No email — Google login blocked”** on the user list.

User Admin access (not the same as Google manager roles): `ceo`, `admin`, `evp`, `marketing` → `canAccessUserAdmin()`.

## Admin surfaces

| Page | Purpose |
|------|---------|
| `admin.html` | Create/edit users (name, phone, **email**, PIN, role, Region/District/Territory, active) |
| `admin-org.html` | Org master — sync Region/District from SAP; maintain Patrol Territory list |
| `admin-users-sap.html` | Read-only SAP roster vs Patrol accounts (desktop-first) |

Org fields on users drive dashboards, maps, and team scoping. Region/District should come from org master picklists after SAP sync; Territory is Patrol-only.

## Strategic principles

1. **Field-first:** thumb reach, large taps, tolerate flaky networks; offline queue must not lose user intent (`js/offline.js` — IndexedDB before server).
2. **Honest data:** SAP-backed figures show margins only where policy allows; Patrol strips sensitive KPIs per role.
3. **One brand:** Vienovo navy / cyan / green / gold; TSR accent `#00A6CE` (Messenger-hybrid), not generic SaaS-only blue.
4. **Not HQ:** Patrol is the mobile shell; long-form analytics and some admin tasks may deep-link to VieForce HQ.

## Anti-patterns to avoid

- Parity with every HQ screen on a phone.
- Admin UI that only works on a 13" Mac (without a usable mobile fallback).
- Hidden margin or revenue data for roles that must not see it.
- i18n strings hand-edited in three places (use `js/labels-v2.js`, `data-i18n`, and locale files).
- Creating manager accounts without **`@vienovo.ph` email** when they must use Google login.
- **Spinners** on TSR-facing loads (use skeleton rows/blocks).
- **Swipe-only** actions on TSR screens (explicit buttons only).

## “Impeccable” bar (this repo)

- **Product UI** uses `css/tokens.css` (Elite) where Phase 2+ screens apply; **legacy** `patrol.css` variables remain for TSR/messenger-hybrid until migrated.
- **Visual emphasis:** prefer **top-border / full border / tint** over left-edge stripes; avoid **gradient typography** (`background-clip: text`) for KPIs and callouts — details in `DESIGN.md`.
- **User Admin:** shared `role-badge` / `tbl-btn` / modal patterns; focus trap + **Escape** to close (`js/admin.js`). Prefer `admin-page.css` over duplicated inline CSS.
- **Beta:** visible channel (`config.js` `RELEASE_CHANNEL`) must match manifest and deploy expectations.
- **Accessibility:** allow zoom where possible; modals labelled; toasts use `role="status"`.

---

## Recent (2026-05-24)

Shipped today on top of the v3.2.0-beta.1 (6-waves) baseline:

- **W1.3 hotfix** (`dcff776`) — `users` RLS loosened to handle the `auth.users.id` vs `public.users.id` collision; `verify-pin` Edge Function handles email-collision.
- **W1.4 rollback** (`c03e4a3`) — `AuthCore` reverted entirely. Hand-signed HS256 JWTs never worked because this Supabase project uses asymmetric (JWKS) signing. Restored legacy `verify-pin` (returns user row directly), `js/auth.js` `localStorage` flow, and HYBRID `api/_lib/auth.js` that accepts `x-session-id` OR `Authorization: Bearer <jwt>`. See `CLAUDE.md` §21 for the lesson.
- **W1.5 nuclear** (`0383726`) — Pre-W1 legacy policy on `users` had a self-referential subquery against the same table → `42P17` infinite recursion at PostgREST. Catch-all dropped every policy on 11 tables + disabled RLS entirely for triage.
- **W1.6 + W1.6b** (`acae59f`) — RLS re-enabled with explicit scoping. `users_safe` VIEW (no `pin_hash`) is the anon-readable surface; base `users` REVOKE SELECT from anon. `sap_accounts` + `store_sap_matches` authenticated-only. `stores` / `visits` / `farms` anon-writable (offline-queue replay). `patrol_org_*` read-open.
- **Polish waves** (commits `0303b3e` → `36dc04c`) — 14 polish items: UPPERCASE drop on Tindahan rows, `#00A6CE` rebase across 29 hex sweeps, sync-badge CSS finally shipped, `prefers-reduced-motion` honored, WCAG btn-reset-pin contrast fix, compact home/Tindahan headers + filter grid, KPI label overlap fix, visit-history photo thumbnails.
- **R2 Track 1** (`d6be200`, `1cca873`) — `getAuthBearer()` restored, `js/export.js` scoped (no `pin_hash` leak in CSV), `ux-polish` idempotency, 2 final `Loading...` text leaks killed.

Migrations applied today: `20260524093000_rls_hotfix_users_select`, `20260524104500_rollback_w1_rls`, `20260524110000_disable_rls_test_phase`, `20260524150000_w16_rls_scoping_hardening`, `20260524151500_w16_rls_users_view`.

Validation snapshot (2026-05-24): `npm run test:unit` → 244/244 · `npm run check:locales` → 209 keys × 3.

---

## UI quality backlog (audit — May 2026)

*Last verified against code: 2026-05-24.*

Prioritized punch list from a full HTML-shell review. Mockups (`patrol-fb-mockup.html`, `prototype-demo-reference.html`, `docs/*`) are out of scope.

### Cross-cutting themes

| Theme | Severity | Notes (2026-05-21 snapshot) |
|-------|----------|--------|
| Trilingual gaps on first paint | Closed | Wave 3 + R2 Track 1B killed remaining `Loading...` leaks; TSR + DSM headers seed trilingual at first paint. |
| TSR touch targets &lt; 64px | Closed | TSR controls enforce 64px via `css/tsr-field.css`; manager `.hdr-btn` bumped to 48px in W5. |
| TSR tab count &gt; 4 | Closed | Exactly 4 TSR bottom tabs (Home / POS / Mapa / Higit pa); Profile + Visits + Logout live in More sheet. |
| Admin loading = text only | Closed | `admin-skeleton-wrap` blocks shipped on `admin-org.html` and `admin-users-sap.html`. |
| CSS / token drift | P2 | Admin shells still skip `tokens.css`; 177-line inline `<style>` block remains in `app.html` for the assign page; ~10 inline `style="..."` attrs persist on admin pages. |
| TSR bundle weight | Closed | All manager-only CSS lazy-loaded (W5); ~32KB off TSR cold-load. |
| `user-scalable=no` | Closed | No zoom lock in any in-scope shell (only the out-of-scope prototype carries it). |

### Phase A — Admin & auth (do first)

| Item | Description | Status |
|------|-------------|--------|
| **A1** | Consolidate `admin.html` inline CSS into `admin-page.css` (single source). | ✅ DONE — big `<style>` block consolidated; ~10 inline `style="..."` attrs remain (cosmetic). |
| **A2** | Skeleton loaders on `admin-org.html` and `admin-users-sap.html` (replace text-only). | ✅ DONE |
| **A3** | SAP roster mobile: card/stack view under ~640px instead of wide table scroll. | ✅ DONE |
| **A4** | Admin actions: min-height 44–48px; full-width buttons on mobile card actions. | ✅ DONE |
| **A5** | `index.html`: section titles + Google error strings through `LABELS` / trilingual pills. | ✅ DONE |
| **A6** | Revisit `user-scalable=no` on auth and admin (or bump base font size). | ✅ DONE |
| **A7** | Shared admin subnav header across `admin.html`, `admin-org.html`, `admin-users-sap.html`. | ✅ DONE |

### Phase B — TSR field (`app.html`)

| Item | Description | Status |
|------|-------------|--------|
| **B1 (P0)** | Audit TSR tap targets → **64px min** (`hdr-btn`, visit CTA, FAB, chips). | ✅ DONE |
| **B2 (P0)** | Bottom nav: **4 tabs max** for TSR; fold Profile/More into one trilingual "Higit pa" sheet. | ✅ DONE |
| **B3 (P0)** | Replace HTML `Loading...` / English placeholders with `data-i18n` or `T.*` at first paint. | ✅ DONE — R2 Track 1B + Wave 3 killed remaining `Loading...` text leaks on TSR paths (commit `1cca873`). |
| **B4** | Store empty state: trilingual + CTA matches visible control (FAB hidden for some TSR roles). | ✅ DONE |
| **B5** | Remove "Loading from Supabase…" copy; user-facing trilingual sync status only. | ✅ DONE |
| **B6** | Lazy-load manager-only CSS/JS (sales, assign, xlsx) off the TSR critical path. | ✅ DONE — W5 bundle work (commit `4774250`) lazy-loaded the 3 remaining manager CSS files; ~32KB off TSR cold-load. |
| **B7** | Visit list: skeleton-only pattern (extend `js/stores.js` approach). | ✅ DONE |
| **B8** | Submit visit: full-width Messenger blue, **64px** CTA. | ✅ DONE |

### Phase C — Manager / DSM / RSM

> Implemented locally on `main`; commit pending. Status reflects code state as of 2026-05-21.

| Item | Description | Status |
|------|-------------|--------|
| **C1** | Manager nav overflow + i18n labels; 48px+ targets. | ✅ DONE — W5 bumped manager `.hdr-btn` to 48px (commit `4774250` / merged `654c99a`). |
| **C2** | Sales tab: skeleton KPI blocks instead of `.sales-sap-spinner`. | ✅ DONE |
| **C3** | DSM Pulse / feed: skeleton-first in `js/home-dsm.js` / dashboard loaders. | ✅ DONE |
| **C4** | Assign UI: localize stats bar and list placeholders. | ✅ DONE |
| **C5** | Lazy-load Chart.js / xlsx when sales/export opens. | ✅ DONE |
| **C6** | Leaderboard: top performers only (Filipino hiya rule — no public low ranks). | ✅ DONE — hiya gate implemented at `js/phase4-social.js:1014-1092` (`_buildVisibleRanks` + `_shouldShowFullLeaderboard`); only admin-class roles (`ceo`, `admin`, `evp`, `marketing`) see ranks 4..N. Wave 3 commit `379b12c`. |

## **Pilot-blocking issues (from 2026-05-21 audit — see `_audit/MASTER_PLAN.md`)**

All four 2026-05-21 pilot-blockers resolved over 6 waves + R2 Tracks (2026-05-21 → 2026-05-24):

- ✅ **C6 leaderboard hiya** — fixed by Wave 3 commit `379b12c`; gate lives in `js/phase4-social.js:1014-1092`.
- ✅ **Store-detail "Loading..." text on TSR path** — killed by Wave 3 (`051a97e`) + R2 Track 1B (`1cca873`).
- ✅ **DSM home mock `seed % 11` data** — Wave 3 (`130c87a`) replaced mocks with real Supabase aggregates + 1h IDB cache.
- ✅ **PIN visible in admin CSV** — scrubbed in Wave 1 + R2 Track 1A (`d6be200`) scoped `js/export.js` users SELECT so `pin_hash` is never read.

*Full pilot-gate list lives in `_audit/MASTER_PLAN.md` §2.*

### TSR rules compliance snapshot

| Rule | Status |
|------|--------|
| Offline first | ✅ Wave 2 routed `updateStore`, `assignStores/Farms`, `last_visit_at`, profile edits through the queue (Dexie v4). |
| 64px touch (TSR) | ✅ `css/tsr-field.css` enforces 64px on all TSR controls. |
| No spinners (TSR) | ✅ Wave 3 + R2 Track 1B killed `Loading...` text on every TSR path. |
| Trilingual first-paint | ✅ Wave 3 + R2 Track 1B closed the residual gaps. |
| Messenger hybrid (TSR) | ✅ Production shell. |
| Max 4 TSR tabs | ✅ Home / POS / Mapa / Higit pa. |
| No swipe-only actions | ✅ Explicit buttons only; More sheet opens via tap. |
| No `user-scalable=no` | ✅ None in any in-scope shell. |
| Leaderboard hiya | ✅ `js/phase4-social.js:1014-1092` enforces top-3 + own-row only for non-admin viewers. |

---

*Last updated: 2026-05-24 — post-W1.6 RLS scoping + polish waves; backlog refreshed.*

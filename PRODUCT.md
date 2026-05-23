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

## UI quality backlog (audit — May 2026)

*Last verified against code: 2026-05-21.*

Prioritized punch list from a full HTML-shell review. Mockups (`patrol-fb-mockup.html`, `prototype-demo-reference.html`, `docs/*`) are out of scope.

### Cross-cutting themes

| Theme | Severity | Notes (2026-05-21 snapshot) |
|-------|----------|--------|
| Trilingual gaps on first paint | P1 | Largely resolved on TSR shell; residual English on DSM header `Loading...` (`app.html:242`) and store-detail TSR path (`app.html:1898,1902`). |
| TSR touch targets &lt; 64px | Closed (TSR) / P1 (manager) | TSR controls now enforce 64px via `css/tsr-field.css`. Manager `.hdr-btn` icons still render ~36px (no width/height set) — see C1 partial. |
| TSR tab count &gt; 4 | Closed | Exactly 4 TSR bottom tabs (Home / POS / Mapa / Higit pa); Profile + Visits + Logout live in More sheet. |
| Admin loading = text only | Closed | `admin-skeleton-wrap` blocks shipped on `admin-org.html` and `admin-users-sap.html`. |
| CSS / token drift | P2 | Admin shells still skip `tokens.css`; 177-line inline `<style>` block remains in `app.html` for the assign page; ~10 inline `style="..."` attrs persist on admin pages. |
| TSR bundle weight | P1 | `sales-tab-v2.css`, Chart.js, xlsx lazy-loaded. `rsm.css`, `phase4-social.css`, `phase3-sales-stores.css` still eager on TSR critical path (≈+50KB). |
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
| **B3 (P0)** | Replace HTML `Loading...` / English placeholders with `data-i18n` or `T.*` at first paint. | ⚠️ PARTIAL — DSM header (`app.html:242`) and store-detail TSR path (`app.html:1898,1902`) still seed English. |
| **B4** | Store empty state: trilingual + CTA matches visible control (FAB hidden for some TSR roles). | ✅ DONE |
| **B5** | Remove "Loading from Supabase…" copy; user-facing trilingual sync status only. | ✅ DONE |
| **B6** | Lazy-load manager-only CSS/JS (sales, assign, xlsx) off the TSR critical path. | ⚠️ PARTIAL — `sales-tab-v2.css` / Chart / xlsx lazy; `rsm.css`, `phase4-social.css`, `phase3-sales-stores.css` still eager. |
| **B7** | Visit list: skeleton-only pattern (extend `js/stores.js` approach). | ✅ DONE |
| **B8** | Submit visit: full-width Messenger blue, **64px** CTA. | ✅ DONE |

### Phase C — Manager / DSM / RSM

> Implemented locally on `main`; commit pending. Status reflects code state as of 2026-05-21.

| Item | Description | Status |
|------|-------------|--------|
| **C1** | Manager nav overflow + i18n labels; 48px+ targets. | ⚠️ PARTIAL — bottom-nav ≥52px shipped; manager `.hdr-btn` icons (`app.html:545,546,658,662`) still render ~36px. |
| **C2** | Sales tab: skeleton KPI blocks instead of `.sales-sap-spinner`. | ✅ DONE |
| **C3** | DSM Pulse / feed: skeleton-first in `js/home-dsm.js` / dashboard loaders. | ✅ DONE |
| **C4** | Assign UI: localize stats bar and list placeholders. | ✅ DONE |
| **C5** | Lazy-load Chart.js / xlsx when sales/export opens. | ✅ DONE |
| **C6** | Leaderboard: top performers only (Filipino hiya rule — no public low ranks). | ❌ MISSING — `renderRankingsRest` / `renderRankingsTiered` in `js/phase4-social.js:1015-1115` still expose ranks 4..N. |

## **Pilot-blocking issues (from 2026-05-21 audit — see `_audit/MASTER_PLAN.md`)**

- **C6 leaderboard hiya violation** — `js/phase4-social.js:1015-1115` (`renderRankingsRest` + `renderRankingsTiered`) renders every rank 4..N with name + bags + delta. Violates `CLAUDE.md` Rule 8 and `PRODUCT.md` C6. Cap to top 3–5 + render viewer's own rank separately.
- **Store-detail "Loading..." text on TSR path** — `app.html:1898,1902` injects raw `Loading...` instead of skeleton on TSR navigation into a store. Violates `CLAUDE.md` Rule 7 (no spinners/loading text for TSRs).
- **DSM home mock `seed % 11` data** — `js/home-dsm.js:37-72` produces deterministic mock figures rather than live SAP/Patrol data; flagged as pilot-blocking by Audit D.
- **PIN visible in admin CSV** — `js/admin.js` includes raw PIN material in the CSV export path; must be redacted before pilot.

*Full pilot-gate list lives in `_audit/MASTER_PLAN.md` §2.*

### TSR rules compliance snapshot

| Rule | Status |
|------|--------|
| Offline first | ⚠️ Partial — `js/offline.js` queue shipped; some writes bypass the queue per Audit D. |
| 64px touch (TSR) | ✅ `css/tsr-field.css` enforces 64px on all TSR controls. |
| No spinners (TSR) | ❌ Store detail still injects `Loading...` text (`app.html:1898,1902`). |
| Trilingual first-paint | ⚠️ Partial (B3) — DSM header + store-detail TSR path still seed English. |
| Messenger hybrid (TSR) | ✅ Production shell. |
| Max 4 TSR tabs | ✅ Home / POS / Mapa / Higit pa. |
| No swipe-only actions | ✅ Explicit buttons only; More sheet opens via tap. |
| No `user-scalable=no` | ✅ None in any in-scope shell. |
| Leaderboard hiya | ❌ C6 — ranks 4..N still exposed in `js/phase4-social.js`. |

---

*Last updated: May 2026 — includes user-profile email for Google login and org-admin handoff.*

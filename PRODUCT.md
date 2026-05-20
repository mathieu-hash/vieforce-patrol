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

Prioritized punch list from a full HTML-shell review. Mockups (`patrol-fb-mockup.html`, `prototype-demo-reference.html`, `docs/*`) are out of scope.

### Cross-cutting themes

| Theme | Severity | Notes |
|-------|----------|--------|
| Trilingual gaps on first paint | P0–P1 | HTML still seeds English (`Loading...`, nav labels) before `labels-v2.js` runs |
| TSR touch targets &lt; 64px | **P0** | 36px header buttons, 52px FAB, ~56px bottom nav in places |
| TSR tab count &gt; 4 | P1 | Five bottom tabs (includes Profile + More) |
| Admin loading = text only | P1 | Org + SAP pages; skeleton preferred |
| CSS / token drift | P2 | Admin pages skip `tokens.css`; large inline blocks in `admin.html` |
| TSR bundle weight | P1 | Many CSS + font files on every session |
| `user-scalable=no` | P1 | Auth + app viewport limits zoom |

### Phase A — Admin & auth (do first)

1. **A1** — Consolidate `admin.html` inline CSS into `admin-page.css` (single source).
2. **A2** — Skeleton loaders on `admin-org.html` and `admin-users-sap.html` (replace text-only).
3. **A3** — SAP roster mobile: card/stack view under ~640px instead of wide table scroll.
4. **A4** — Admin actions: min-height 44–48px; full-width buttons on mobile card actions.
5. **A5** — `index.html`: section titles + Google error strings through `LABELS` / trilingual pills.
6. **A6** — Revisit `user-scalable=no` on auth and admin (or bump base font size).
7. **A7** — Shared admin subnav header across `admin.html`, `admin-org.html`, `admin-users-sap.html`.

### Phase B — TSR field (`app.html`)

1. **B1 (P0)** — Audit TSR tap targets → **64px min** (`hdr-btn`, visit CTA, FAB, chips).
2. **B2 (P0)** — Bottom nav: **4 tabs max** for TSR; fold Profile/More into one trilingual “Higit pa” sheet.
3. **B3 (P0)** — Replace HTML `Loading...` / English placeholders with `data-i18n` or `T.*` at first paint.
4. **B4** — Store empty state: trilingual + CTA matches visible control (FAB hidden for some TSR roles).
5. **B5** — Remove “Loading from Supabase…” copy; user-facing trilingual sync status only.
6. **B6** — Lazy-load manager-only CSS/JS (sales, assign, xlsx) off the TSR critical path.
7. **B7** — Visit list: skeleton-only pattern (extend `js/stores.js` approach).
8. **B8** — Submit visit: full-width Messenger blue, **64px** CTA.

### Phase C — Manager / DSM / RSM

1. **C1** — Manager nav overflow + i18n labels; 48px+ targets.
2. **C2** — Sales tab: skeleton KPI blocks instead of `.sales-sap-spinner`.
3. **C3** — DSM Pulse / feed: skeleton-first in `js/home-dsm.js` / dashboard loaders.
4. **C4** — Assign UI: localize stats bar and list placeholders.
5. **C5** — Lazy-load Chart.js / xlsx when sales/export opens.
6. **C6** — Leaderboard: top performers only (Filipino hiya rule — no public low ranks).

### TSR rules compliance snapshot

| Rule | Status |
|------|--------|
| Offline first | ✅ `js/offline.js` |
| 64px touch | ⚠️ Partial |
| No spinners (TSR) | ⚠️ Partial (stores ✅) |
| Trilingual | ⚠️ Partial |
| Messenger hybrid (TSR) | ⚠️ Partial |
| Max 4 tabs | ❌ Five tabs today |
| No swipe gestures | ✅ Production shell |

---

*Last updated: May 2026 — includes user-profile email for Google login and org-admin handoff.*

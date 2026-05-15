# VieForce Patrol — Product context

## Purpose

Patrol is Vienovo Philippines’ **field sales execution app**: store mapping, visits, lightweight CRM, and manager visibility for the livestock and pet feed channel. It must work on **mid-range Android phones** in sun and poor connectivity, and on **desktop** for managers and admin.

## Users

- **TSR / Champion:** daily route, visits, stores, sync when online.
- **DSM / RSM:** team coverage, coaching, assignees, optional exports.
- **Exec / EVP / CEO:** portfolio KPIs, hierarchy visibility (often HQ-aligned).
- **Sales Admin / Marketing Manager (User Admin roles):** manage Patrol accounts, SAP roster alignment, not day-to-day selling.

## Strategic principles

1. **Field-first:** thumb reach, large taps, tolerate flaky networks; offline queue must not lose user intent.
2. **Honest data:** SAP-backed figures show margins only where policy allows; Patrol strips sensitive KPIs per role.
3. **One brand:** Vienovo navy / cyan / green / gold; avoid generic “SaaS blue” as the only identity.
4. **Not HQ:** Patrol is the mobile shell; long-form analytics and some admin tasks may deep-link to VieForce HQ.

## Anti-patterns to avoid

- Parity with every HQ screen on a phone.
- Admin UI that only works on a 13" Mac.
- Hidden margin or revenue data for roles that must not see it.
- i18n strings hand-edited in three places (use locale files and `data-t` where applicable).

## “Impeccable” bar (this repo)

- **Product UI** uses `css/tokens.css` (Elite) where Phase 2+ screens apply; **legacy** `patrol.css` variables remain for TSR/messenger-hybrid until migrated.
- **Visual emphasis:** prefer **top-border / full border / tint** over left-edge stripes; avoid **gradient typography** (`background-clip: text`) for KPIs and callouts — details in `DESIGN.md`.
- **User Admin** uses shared `admin-table` / `role-badge` / `tbl-btn` patterns, not one-off inline tables; modals trap focus and close with **Escape** (`js/admin.js`).
- **Beta:** visible channel (`config.js` `RELEASE_CHANNEL`) must match manifest and deploy expectations.

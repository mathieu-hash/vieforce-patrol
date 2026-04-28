# Patrol Sales tab — live SAP summary (approved design)

**Date:** 2026-04-27  
**Status:** Implemented per this spec.

## Goal

Expose one SAP-backed (via HQ proxy) surface on the DSM/RSM **Sales** tab so managers see scoped sales KPIs without leaving Patrol.

## Scope

- **In:** Hero summary from `GET /api/sap/sales?period=MTD|YTD`, MTD/YTD toggle, empty/error/loading states, optional `by_brand` strip (non-margin fields only).
- **Out:** Wiring `pg-ar`, inventory, or other stub modules; changing HQ `/api/sales` contract.

## UX

1. Period control: **MTD** / **YTD** (query param `period`).
2. Primary KPI: **`kpis.volume_mt`** — label “Volume (MT)”.
3. Secondary KPI: first present among safe keys on `kpis`: `revenue`, `net_revenue`, `bags`, `orders`, `order_count`, `amount`, `total_amount` (revenue-like values formatted as PHP).
4. **by_brand:** up to 5 rows — `name` + first of `volume_mt`, `volume`, `bags`, `revenue`.
5. **Empty scope:** `patrol_meta.is_empty` or `scope.is_empty` — copy directs to HQ/user mapping, no fake numbers.
6. **Errors:** 401 → `index.html`; 502/504/other → retry; offline message when `navigator.onLine === false`.
7. Sub-module list remains **HQ-gated** via `patrolOpenStubSalesModule`.

## Technical

- **UI:** [`js/sales-tab.js`](../../../js/sales-tab.js) — `initSalesTab()`, `refreshSalesTab(period)`, ~28s client cache aligned with API `Cache-Control`.
- **Bootstrap:** [`app.html`](../../../app.html) `nav` wrapper + active-on-load for `pg-sales`.
- **Transport:** [`js/db.js`](../../../js/db.js) `sapFetch`.
- **Margins:** Never shown; server strips in [`api/_lib/scope.js`](../../../api/_lib/scope.js).

## Verification

- Manager mobile: Sales tab → data loads → YTD toggle.
- `npm run test:unit` (includes optional formatter tests if present).

# VieForce Patrol — pilot known issues

Living list for champion / DSM rollout. Update as items close.

| ID | Area | Symptom | Workaround | Target fix |
|----|------|---------|------------|------------|
| P1 | HQ SAP proxy | Sales modules show toast “temporarily unavailable” on mobile when stubs are off | Use HQ web for deep SAP; or set `PATROL_SALES_MODULES_LIVE` / enable `CONFIG.PATROL_FEATURES.salesSubModules` for demos only | Wire read-only SAP cards or retire stubs |
| P2 | Mapa (TSR) | Stub list page vs full Leaflet map depends on `mapaFullMap` flag | Default nav sends TSR to `page-map` when flag off | Full geographic map on `page-mapa-tsr` |
| P3 | Phase 4 social | Mock notifications / feed when `phase4Social` / `socialFeed` enabled | Keep flags `false` in production pilot | Backend + RLS for real notifs |

**Env notes**

- `PATROL_CORS_ORIGINS` — comma-separated extra browser origins for `/api/*` and Supabase `verify-pin`.
- `PATROL_WHOAMI_KEY` — required in production for `GET /api/whoami?key=…` (egress IP helper).
- `HQ_SERVICE_TOKEN` — required in Vercel **production** for HQ proxy routes (otherwise 503 `HQ_NOT_CONFIGURED`).

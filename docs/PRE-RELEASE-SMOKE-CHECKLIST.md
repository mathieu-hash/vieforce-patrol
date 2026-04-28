# Pre-release smoke checklist — VieForce Patrol

Run before tagging a release or promoting Vercel production.

## Automated (local)

```bash
npm run test:unit
```

Optional (requires `SUPABASE_ACCESS_TOKEN`):

```bash
npm run check:supabase-auth
```

## Manual matrix (production URL)

Use `https://vieforce-patrol.vercel.app` (or current production host).

| # | Scenario | Pass criteria |
|---|----------|----------------|
| 1 | **TSR PIN login** | Lands on `app.html`, home KPIs load, no redirect loop |
| 2 | **Manager Google** (DSM / RSM / CEO test accounts) | Lands on dashboard or RSM home; Team tab works |
| 3 | **Offline create** | Airplane mode → create queued item → online → sync bar clears, row in Supabase |
| 4 | **Visit submit** | Message matches reality: “saved and synced” only when queue empty |
| 5 | **Sales tab (manager mobile)** | Stub modules prompt for HQ; `PATROL_SALES_MODULES_LIVE=true` in console enables in-app navigation (dev only) |
| 6 | **Boot** | No blank shell; optional `?bootlog=1` shows trace without errors |

## OAuth quick verification

- [ ] Google redirect returns to `/index.html` on production
- [ ] New manager test user: `users` row active with correct `role`

## Sync / queue

- [ ] `patrolInspectQueue()` returns empty after successful field save online
- [ ] Duplicate retry (if simulating) does not strand user in permanent error state without console explanation

## Sign-off

- Tester: _______________  Date: _______________
- Version / commit: _______________

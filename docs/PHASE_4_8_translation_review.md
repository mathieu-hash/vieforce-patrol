# Phase 4.8 — Translation review notes

## Deployment prerequisites

1. **Database:** Apply `supabase/migrations/20260430120000_add_user_language.sql` in the Supabase SQL Editor (or `supabase db push` after `supabase link`). Until this runs, `verify-pin` and `/api/user/language` must not select/update `language` or they will error.

2. **Edge function:** Redeploy `verify-pin` after the migration so it returns `language` in the login payload.

## Cebuano (ceb) strings

- Copy uses **informal Cebuano / Bisaya** field tone. Some retail/CRM phrases stay in **English** per product rules (MTD, AR, KPI, ROI, Hot Streak, VieForce, NBA, SAP, POS, TSR, DSM, etc.).
- **Uncertainty:** `dsm.coaching_stuck_text` and long DSM coaching strings — verify with a native speaker for naturalness.

## Tagalog (tl) strings

- Mix of **Filipino retail English** for metrics (MTD, coverage, peer avg) and Tagalog for narrative — intentional for field users.

## Manual SQL (if CLI unavailable)

```sql
-- Paste contents of supabase/migrations/20260430120000_add_user_language.sql
```

## API

- `PATCH /api/user/language` with header `x-session-id` and body `{ "language": "en"|"tl"|"ceb" }` updates `users.language` via service role (same pattern as `/api/farms`).

# POS Ownership Model — VieForce Patrol

**Diagnosed: 2026-04-25 · Author: Saturday autonomous sprint**

## TL;DR — the reported bug is NOT an ownership problem

Mat's hypothesis (W2 brief): *"OSLP has no TSRs. POS ownership assumes TSRs own stores. DSMs creating POS get rows with no visibility match."*

**Verified: hypothesis is wrong.** The current `getStores` in `js/db.js:45-69` only restricts the read for `role === 'tsr'` — every other role (DSM/RSM/director/exec/CEO/admin/EVP) gets an unfiltered SELECT. Jefrey's reload-shows-nothing was caused by a separate bug: a `stores_store_type_check` constraint that rejected the chatbot's 5 quick-reply values, causing every DSM-driven POS create to fail at sync time and silently eject from the offline queue.

Constraint fix shipped same day in `migrations/stores-store-type-widen-check.sql` + a defence-in-depth normaliser in `createStore`. The bug Mat described is now closed.

## Current ownership model (post-2026-04-25 fix)

| Role | Read scope |
|---|---|
| `tsr` | Stores where `created_by = session.id` OR `assigned_tsr = session.id` |
| `dsm` | All stores (no filter) |
| `rsm` | All stores (no filter) |
| `director` / `evp` / `exec` / `ceo` / `admin` | All stores (no filter) |

Write side: anyone who can authenticate can `INSERT` (RLS open on `stores`); `created_by` is set to `session.id` automatically by `js/db.js::createStore`.

## Gaps in the current model — known but **not** fixed today

These are not bugs Mat reported; they are observations from reading the code. Document them so the next call knows the trade-offs.

### 1. DSM/RSM read scope is unscoped
A DSM should see only stores in their district; an RSM should see only stores under their region's DSMs. Today they all see everything. For Vienovo's distributor model this is over-permissive — once we have >1 RSM mapped (we shipped 9 today), an RSM in MM-North will see every store nationally, not just their book.

**Why not fix today**: would require a SAP-territory-aware filter on the read query, which depends on the SAP `OSLP` ↔ Supabase user mapping being well-formed for *all* mapped users (we just onboarded 9 RSMs/director with `manager_id = null` — chicken-and-egg with Joel in the same batch). Fix is meaningful only after the manager_id graph is stitched.

### 2. Store assignment via `assigned_tsr` (shipped)
`stores.assigned_tsr` is written by DSM/RSM/admin via `#page-assign` (`js/assign.js`, `assignStores` in `js/db.js`). TSR reads filter on `created_by = self OR assigned_tsr = self`.

**Farm assignment**: `farms.assigned_tsr` exists in schema and TSR map reads respect it, but DSM assign UI for farms is not yet wired (stores only today).

### 3. RLS on `stores` is currently open
PostgREST anon SELECT + INSERT both succeed (verified during diagnosis). When we tighten the read scope, we should also tighten RLS so a malicious browser can't exfil the entire `stores` table by hitting `/rest/v1/stores` directly with the anon key.

**Pattern to copy**: same `users_public_read` + `users_admin_*` policy structure we shipped for `public.users` on 2026-04-24. Wrap the role check in a `SECURITY DEFINER` function (`is_admin_user()` already exists; we'd add `can_see_store(store_id)` or similar).

## Recommended next-iteration model — when actually needed

Drive-by observation; not a sprint goal.

```
       can_see ?
TSR   :  created_by = self          OR assigned_tsr = self
DSM   :  district matches self.sap_district_code
         OR created_by IN { self's TSRs' ids }
RSM   :  district matches any self-managed-DSM's district
         OR created_by IN { self's DSMs' + their TSRs' ids }
DIR   :  no filter — see everything
EXEC  :  no filter
CEO   :  no filter
```

Implementation hooks:
- Reuse the `scopeForUser` walker pattern from `vieforce-hq/api/_scope.js` for HQ-side scoping.
- Add a `stores.district` column (or join via the rep mapping) so the filter is fast.
- New SECURITY DEFINER fn `public.user_can_see_store(store_id uuid)` — RLS policy invokes it.

**Effort estimate**: ~2-3 hours when prioritised. Not in scope for today's sprint; flagged for later.

## What today's commit changed

- **`migrations/stores-store-type-widen-check.sql`** — widen the check constraint to accept the chatbot's 6 values + null. Idempotent. Mat applies via Supabase SQL editor.
- **`js/db.js::createStore`** — defence-in-depth: normalise `store_type` to `'other'` if it's not in the allowed set. Belt-and-suspenders so the DB rejection can't bite again if a flow drifts from the constraint.
- **No schema additions** — no new columns, no RLS changes. Surgical fix to the actual reported bug.

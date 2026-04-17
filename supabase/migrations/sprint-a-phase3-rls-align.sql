-- Sprint A.1 — align RLS + role constraint for exec + champion
-- Fixes C-02 (exec sees nothing) + C-03 (role CHECK rejects champion/exec).
-- Run in Supabase SQL Editor. Idempotent.
-- Must run AFTER sprint-a-hierarchy.sql.

-- 1. Role CHECK alignment (C-03). Base schema.sql was authored before champion + exec existed.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('tsr','champion','dsm','rsm','exec','admin'));

-- 2. Stores — add exec + champion to manager visibility (C-02)
DROP POLICY IF EXISTS "TSR sees own stores" ON public.stores;
CREATE POLICY "TSR sees own stores" ON public.stores
  FOR SELECT USING (
    created_by::text = auth.uid()::text
    OR assigned_tsr::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text
               AND u.role IN ('champion','dsm','rsm','exec','admin'))
  );

DROP POLICY IF EXISTS "TSR updates own stores" ON public.stores;
CREATE POLICY "TSR updates own stores" ON public.stores
  FOR UPDATE USING (
    created_by::text = auth.uid()::text
    OR assigned_tsr::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text
               AND u.role IN ('champion','dsm','rsm','exec','admin'))
  );

-- 3. Visits — add exec + champion to manager visibility
DROP POLICY IF EXISTS "TSR sees own visits" ON public.visits;
CREATE POLICY "TSR sees own visits" ON public.visits
  FOR SELECT USING (
    tsr_id::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text
               AND u.role IN ('champion','dsm','rsm','exec','admin'))
  );

-- 4. Farms — add exec + champion to manager visibility
DROP POLICY IF EXISTS "TSR sees own farms" ON public.farms;
CREATE POLICY "TSR sees own farms" ON public.farms
  FOR SELECT USING (
    created_by::text = auth.uid()::text
    OR assigned_tsr::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text
               AND u.role IN ('champion','dsm','rsm','exec','admin'))
  );

DROP POLICY IF EXISTS "TSR updates own farms" ON public.farms;
CREATE POLICY "TSR updates own farms" ON public.farms
  FOR UPDATE USING (
    created_by::text = auth.uid()::text
    OR assigned_tsr::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text
               AND u.role IN ('champion','dsm','rsm','exec','admin'))
  );

-- NOTES:
-- * users-table SELECT stays as `USING (true)` for now. Tightening it (H-05) breaks the
--   leaderboard + champion-team widgets which read users cross-territory. Defer to Sprint C
--   alongside proper Supabase Auth migration.
-- * store_products + store_competitors inherit via EXISTS(stores) passthrough — no changes needed.

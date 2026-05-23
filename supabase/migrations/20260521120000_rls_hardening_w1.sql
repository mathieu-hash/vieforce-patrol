-- ============================================================
-- Wave 1 — RLS HARDENING
-- ============================================================
-- Author: W1-RLS agent · 2026-05-21
-- Branch: fix/w1-rls
--
-- Purpose:
--   * Close the P0 USING(true) leak on public.users (Audit F S2).
--   * Replace vacuous auth.uid() lookups against public.users with
--     stateless helpers that read app_metadata claims stamped by the
--     W1-AuthCore Edge Function.
--   * Apply consistent SELECT/INSERT/UPDATE/DELETE scope per spec
--     across users, stores, visits, farms, store_products,
--     store_competitors, sap_accounts, patrol_org_*.
--
-- Depends on (must land first in production):
--   W1-AuthCore Edge Function — stamps auth.jwt() with
--     app_metadata.role + app_metadata.region/district/territory +
--     app_metadata.patrol_user_id and sets sub = users.id.
--
-- Idempotent: uses DROP POLICY IF EXISTS + CREATE POLICY everywhere.
-- ============================================================


-- ── 0. Helper functions ─────────────────────────────────────────
-- All reads come from the Supabase Auth JWT claims set by AuthCore.
-- STABLE so the planner can cache within a statement.

CREATE OR REPLACE FUNCTION public.patrol_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role')::text, '')
$$;

CREATE OR REPLACE FUNCTION public.patrol_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.patrol_role() IN ('admin', 'ceo', 'evp', 'marketing')
$$;

CREATE OR REPLACE FUNCTION public.patrol_is_manager() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.patrol_role() IN ('dsm', 'rsm', 'exec', 'ceo', 'evp', 'admin')
$$;

-- Top managers (exec/CEO/EVP/admin/marketing) see ALL rows — they sit
-- above the RSM→DSM→TSR hierarchy.
CREATE OR REPLACE FUNCTION public.patrol_is_top_manager() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.patrol_role() IN ('admin', 'ceo', 'evp', 'exec', 'marketing')
$$;

-- True if caller is an RSM whose region matches the given value.
CREATE OR REPLACE FUNCTION public.patrol_rsm_in_region(p_region text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.patrol_role() = 'rsm'
     AND public.patrol_jwt_region() IS NOT NULL
     AND public.patrol_jwt_region() = p_region
$$;

-- True if caller is a DSM whose district matches the given value.
CREATE OR REPLACE FUNCTION public.patrol_dsm_in_district(p_district text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.patrol_role() = 'dsm'
     AND public.patrol_jwt_district() IS NOT NULL
     AND public.patrol_jwt_district() = p_district
$$;

CREATE OR REPLACE FUNCTION public.patrol_jwt_region() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF((auth.jwt() -> 'app_metadata' ->> 'region')::text, '')
$$;

CREATE OR REPLACE FUNCTION public.patrol_jwt_district() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF((auth.jwt() -> 'app_metadata' ->> 'district')::text, '')
$$;


-- ── 1. users ────────────────────────────────────────────────────
-- Drops the P0 USING(true) leak; locks SELECT/UPDATE to self+admin
-- and INSERT/DELETE to admin only.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own record" ON public.users;
DROP POLICY IF EXISTS "Admins manage users"   ON public.users;
DROP POLICY IF EXISTS users_self_or_admin_select ON public.users;
DROP POLICY IF EXISTS users_self_or_admin_update ON public.users;
DROP POLICY IF EXISTS users_admin_insert        ON public.users;
DROP POLICY IF EXISTS users_admin_delete        ON public.users;

CREATE POLICY users_self_or_admin_select ON public.users
  FOR SELECT
  USING (auth.uid() = id OR public.patrol_is_admin());

CREATE POLICY users_self_or_admin_update ON public.users
  FOR UPDATE
  USING (auth.uid() = id OR public.patrol_is_admin())
  WITH CHECK (auth.uid() = id OR public.patrol_is_admin());

CREATE POLICY users_admin_insert ON public.users
  FOR INSERT
  WITH CHECK (public.patrol_is_admin());

CREATE POLICY users_admin_delete ON public.users
  FOR DELETE
  USING (public.patrol_is_admin());


-- ── 2. stores ───────────────────────────────────────────────────
-- TSR sees rows assigned to them; managers see rows in their region
-- OR district scope; admin sees all. INSERT allowed for any
-- authenticated user (TSRs create stores during visits). UPDATE
-- allowed for creator, assigned TSR, or any manager. DELETE admin.

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TSR sees own stores"     ON public.stores;
DROP POLICY IF EXISTS "TSR inserts stores"      ON public.stores;
DROP POLICY IF EXISTS "TSR updates own stores"  ON public.stores;
DROP POLICY IF EXISTS stores_select_scoped     ON public.stores;
DROP POLICY IF EXISTS stores_insert_auth       ON public.stores;
DROP POLICY IF EXISTS stores_update_scoped     ON public.stores;
DROP POLICY IF EXISTS stores_delete_admin      ON public.stores;

-- Hierarchy: TSR (own) → DSM (district) → RSM (region) → top-manager (all).
CREATE POLICY stores_select_scoped ON public.stores
  FOR SELECT
  USING (
    public.patrol_is_top_manager()
    OR public.patrol_rsm_in_region(stores.region)
    OR public.patrol_dsm_in_district(stores.district)
    OR stores.assigned_tsr = auth.uid()
    OR stores.created_by = auth.uid()
  );

CREATE POLICY stores_insert_auth ON public.stores
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY stores_update_scoped ON public.stores
  FOR UPDATE
  USING (
    public.patrol_is_top_manager()
    OR public.patrol_rsm_in_region(stores.region)
    OR public.patrol_dsm_in_district(stores.district)
    OR stores.assigned_tsr = auth.uid()
    OR stores.created_by = auth.uid()
  )
  WITH CHECK (
    public.patrol_is_top_manager()
    OR public.patrol_rsm_in_region(stores.region)
    OR public.patrol_dsm_in_district(stores.district)
    OR stores.assigned_tsr = auth.uid()
    OR stores.created_by = auth.uid()
  );

CREATE POLICY stores_delete_admin ON public.stores
  FOR DELETE
  USING (public.patrol_is_admin());


-- ── 3. visits ───────────────────────────────────────────────────
-- TSR sees own; managers see team's; admin sees all. INSERT must
-- be self-attributed (tsr_id = auth.uid()). UPDATE: TSR within 24h
-- of visited_at; manager any time. DELETE admin only.

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TSR sees own visits"      ON public.visits;
DROP POLICY IF EXISTS "TSR inserts own visits"   ON public.visits;
DROP POLICY IF EXISTS visits_select_scoped       ON public.visits;
DROP POLICY IF EXISTS visits_insert_self         ON public.visits;
DROP POLICY IF EXISTS visits_update_self_or_mgr  ON public.visits;
DROP POLICY IF EXISTS visits_delete_admin        ON public.visits;

-- Visits inherit hierarchy via the parent store's region/district.
-- Note: EXISTS-join cost is fine at pilot scale; if we hit perf issues
-- post-pilot, denormalize region/district onto visits.
CREATE POLICY visits_select_scoped ON public.visits
  FOR SELECT
  USING (
    public.patrol_is_top_manager()
    OR visits.tsr_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = visits.store_id
        AND (
          public.patrol_rsm_in_region(s.region)
          OR public.patrol_dsm_in_district(s.district)
        )
    )
  );

CREATE POLICY visits_insert_self ON public.visits
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND visits.tsr_id = auth.uid()
  );

CREATE POLICY visits_update_self_or_mgr ON public.visits
  FOR UPDATE
  USING (
    public.patrol_is_top_manager()
    OR (
      visits.tsr_id = auth.uid()
      AND visits.visited_at >= (now() - interval '24 hours')
    )
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = visits.store_id
        AND (
          public.patrol_rsm_in_region(s.region)
          OR public.patrol_dsm_in_district(s.district)
        )
    )
  )
  WITH CHECK (
    public.patrol_is_top_manager()
    OR (
      visits.tsr_id = auth.uid()
      AND visits.visited_at >= (now() - interval '24 hours')
    )
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = visits.store_id
        AND (
          public.patrol_rsm_in_region(s.region)
          OR public.patrol_dsm_in_district(s.district)
        )
    )
  );

CREATE POLICY visits_delete_admin ON public.visits
  FOR DELETE
  USING (public.patrol_is_admin());


-- ── 4. farms ────────────────────────────────────────────────────
-- Same pattern as stores.

ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TSR sees own farms"     ON public.farms;
DROP POLICY IF EXISTS "TSR inserts farms"      ON public.farms;
DROP POLICY IF EXISTS "TSR updates own farms"  ON public.farms;
DROP POLICY IF EXISTS farms_select_scoped    ON public.farms;
DROP POLICY IF EXISTS farms_insert_auth      ON public.farms;
DROP POLICY IF EXISTS farms_update_scoped    ON public.farms;
DROP POLICY IF EXISTS farms_delete_admin     ON public.farms;

-- Farms hierarchy is region-only (no district column on farms).
-- DSMs do NOT have farm visibility unless they're also assigned/creator.
-- If farms gain a district column later, add patrol_dsm_in_district here.
CREATE POLICY farms_select_scoped ON public.farms
  FOR SELECT
  USING (
    public.patrol_is_top_manager()
    OR public.patrol_rsm_in_region(farms.region)
    OR farms.assigned_tsr = auth.uid()
    OR farms.created_by = auth.uid()
  );

CREATE POLICY farms_insert_auth ON public.farms
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY farms_update_scoped ON public.farms
  FOR UPDATE
  USING (
    public.patrol_is_top_manager()
    OR public.patrol_rsm_in_region(farms.region)
    OR farms.assigned_tsr = auth.uid()
    OR farms.created_by = auth.uid()
  )
  WITH CHECK (
    public.patrol_is_top_manager()
    OR public.patrol_rsm_in_region(farms.region)
    OR farms.assigned_tsr = auth.uid()
    OR farms.created_by = auth.uid()
  );

CREATE POLICY farms_delete_admin ON public.farms
  FOR DELETE
  USING (public.patrol_is_admin());


-- ── 5. store_products ───────────────────────────────────────────
-- Inherit visibility from the parent store. Mutation gated to
-- store-mutation rights (creator, assigned TSR, manager, admin).

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store products inherit access" ON public.store_products;
DROP POLICY IF EXISTS store_products_select_via_store ON public.store_products;
DROP POLICY IF EXISTS store_products_mutate_via_store ON public.store_products;
DROP POLICY IF EXISTS store_products_delete_admin     ON public.store_products;

CREATE POLICY store_products_select_via_store ON public.store_products
  FOR SELECT
  USING (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_products.store_id
        AND (
          public.patrol_is_manager()
          OR s.assigned_tsr = auth.uid()
          OR s.created_by = auth.uid()
        )
    )
  );

CREATE POLICY store_products_mutate_via_store ON public.store_products
  FOR ALL
  USING (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_products.store_id
        AND (
          public.patrol_is_manager()
          OR s.assigned_tsr = auth.uid()
          OR s.created_by = auth.uid()
        )
    )
  )
  WITH CHECK (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_products.store_id
        AND (
          public.patrol_is_manager()
          OR s.assigned_tsr = auth.uid()
          OR s.created_by = auth.uid()
        )
    )
  );


-- ── 6. store_competitors ────────────────────────────────────────

ALTER TABLE public.store_competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store competitors inherit access"  ON public.store_competitors;
DROP POLICY IF EXISTS store_competitors_select_via_store ON public.store_competitors;
DROP POLICY IF EXISTS store_competitors_mutate_via_store ON public.store_competitors;

CREATE POLICY store_competitors_select_via_store ON public.store_competitors
  FOR SELECT
  USING (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_competitors.store_id
        AND (
          public.patrol_is_manager()
          OR s.assigned_tsr = auth.uid()
          OR s.created_by = auth.uid()
        )
    )
  );

CREATE POLICY store_competitors_mutate_via_store ON public.store_competitors
  FOR ALL
  USING (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_competitors.store_id
        AND (
          public.patrol_is_manager()
          OR s.assigned_tsr = auth.uid()
          OR s.created_by = auth.uid()
        )
    )
  )
  WITH CHECK (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_competitors.store_id
        AND (
          public.patrol_is_manager()
          OR s.assigned_tsr = auth.uid()
          OR s.created_by = auth.uid()
        )
    )
  );


-- ── 7. sap_accounts ─────────────────────────────────────────────
-- Read-only mirror of SAP B1 OCRD. Managers may read; nobody
-- mutates from the app (sync is service-role).

ALTER TABLE public.sap_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sap_accounts_exec_all     ON public.sap_accounts;
DROP POLICY IF EXISTS sap_accounts_rsm_region   ON public.sap_accounts;
DROP POLICY IF EXISTS sap_accounts_dsm_district ON public.sap_accounts;
DROP POLICY IF EXISTS sap_accounts_manager_read ON public.sap_accounts;
DROP POLICY IF EXISTS sap_accounts_deny_mutate  ON public.sap_accounts;

CREATE POLICY sap_accounts_manager_read ON public.sap_accounts
  FOR SELECT
  USING (public.patrol_is_manager());

-- Mutations: no policy created → RLS denies by default for
-- INSERT/UPDATE/DELETE through PostgREST. Service-role writes
-- bypass RLS as intended for the nightly SAP mirror sync.


-- ── 8. store_sap_matches ────────────────────────────────────────
-- Audit log of store↔SAP mapping attempts. Tightened to admin-only
-- (Mat 2026-05-21) — DSMs do not need visibility into raw match
-- attempts; surfaced data flows through the curated stores table.

ALTER TABLE public.store_sap_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_sap_matches_manager_read ON public.store_sap_matches;
DROP POLICY IF EXISTS store_sap_matches_admin_mutate ON public.store_sap_matches;
DROP POLICY IF EXISTS store_sap_matches_admin_only   ON public.store_sap_matches;

CREATE POLICY store_sap_matches_admin_only ON public.store_sap_matches
  FOR ALL
  USING (public.patrol_is_admin())
  WITH CHECK (public.patrol_is_admin());


-- ── 9. patrol_org_regions / districts / territories ─────────────
-- Org tree. Read by any authenticated user (TSR + manager need the
-- region/district labels). Mutate admin only.

ALTER TABLE public.patrol_org_regions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_org_districts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_org_territories ENABLE ROW LEVEL SECURITY;

-- regions
DROP POLICY IF EXISTS patrol_org_regions_auth_read     ON public.patrol_org_regions;
DROP POLICY IF EXISTS patrol_org_regions_admin_mutate  ON public.patrol_org_regions;

CREATE POLICY patrol_org_regions_auth_read ON public.patrol_org_regions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY patrol_org_regions_admin_mutate ON public.patrol_org_regions
  FOR ALL
  USING (public.patrol_is_admin())
  WITH CHECK (public.patrol_is_admin());

-- districts
DROP POLICY IF EXISTS patrol_org_districts_auth_read    ON public.patrol_org_districts;
DROP POLICY IF EXISTS patrol_org_districts_admin_mutate ON public.patrol_org_districts;

CREATE POLICY patrol_org_districts_auth_read ON public.patrol_org_districts
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY patrol_org_districts_admin_mutate ON public.patrol_org_districts
  FOR ALL
  USING (public.patrol_is_admin())
  WITH CHECK (public.patrol_is_admin());

-- territories
DROP POLICY IF EXISTS patrol_org_territories_auth_read    ON public.patrol_org_territories;
DROP POLICY IF EXISTS patrol_org_territories_admin_mutate ON public.patrol_org_territories;

CREATE POLICY patrol_org_territories_auth_read ON public.patrol_org_territories
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY patrol_org_territories_admin_mutate ON public.patrol_org_territories
  FOR ALL
  USING (public.patrol_is_admin())
  WITH CHECK (public.patrol_is_admin());


-- ── 10. Verification hints ──────────────────────────────────────
-- After applying, sanity-check from psql:
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
--   FROM pg_policy
--   WHERE polrelid IN ('public.users'::regclass,'public.stores'::regclass,
--                      'public.visits'::regclass,'public.farms'::regclass,
--                      'public.sap_accounts'::regclass,'public.store_sap_matches'::regclass,
--                      'public.store_products'::regclass,'public.store_competitors'::regclass,
--                      'public.patrol_org_regions'::regclass,
--                      'public.patrol_org_districts'::regclass,
--                      'public.patrol_org_territories'::regclass)
--   ORDER BY polrelid::regclass::text, polname;

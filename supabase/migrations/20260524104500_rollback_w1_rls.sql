-- ============================================================
-- Wave 1.4 — ROLLBACK of W1.1+W1.2 RLS hardening
-- ============================================================
-- 2026-05-24
--
-- Why:
--   The W1-AuthCore design (hand-signed HS256 JWT) is incompatible
--   with this project's asymmetric JWT signing (JWKS / publishable
--   keys / secret keys). The Edge Function cannot issue session
--   tokens GoTrue will accept. Without a valid Supabase Auth
--   session for TSR users, all the "auth.uid() = ..." policies
--   I added in W1.1/W1.2 fail closed — TSR clients (using the
--   restored legacy x-session-id flow) hit RLS as the anon role
--   and are denied everything.
--
--   Proper fix is a magic-link / OTP exchange flow which is a
--   2-day refactor. For the test-phase pilot, revert to the
--   pre-W1 permissive policies and rely on the Vercel API proxy
--   layer for role enforcement (which is unchanged from W1 —
--   margin-strip, role gates, XSS sweep, PIN UI scrub all stay).
--
-- Idempotent: DROP IF EXISTS everywhere.
-- ============================================================

-- ── Drop all W1.1/W1.2/W1.3 policies on public tables ──────────

-- users
DROP POLICY IF EXISTS users_self_or_admin_select       ON public.users;
DROP POLICY IF EXISTS users_self_or_admin_update       ON public.users;
DROP POLICY IF EXISTS users_admin_insert               ON public.users;
DROP POLICY IF EXISTS users_admin_delete               ON public.users;
DROP POLICY IF EXISTS users_authenticated_select       ON public.users;

-- stores
DROP POLICY IF EXISTS stores_select_scoped             ON public.stores;
DROP POLICY IF EXISTS stores_insert_auth               ON public.stores;
DROP POLICY IF EXISTS stores_update_scoped             ON public.stores;
DROP POLICY IF EXISTS stores_delete_admin              ON public.stores;

-- visits
DROP POLICY IF EXISTS visits_select_scoped             ON public.visits;
DROP POLICY IF EXISTS visits_insert_self               ON public.visits;
DROP POLICY IF EXISTS visits_update_self_or_mgr        ON public.visits;
DROP POLICY IF EXISTS visits_delete_admin              ON public.visits;

-- farms
DROP POLICY IF EXISTS farms_select_scoped              ON public.farms;
DROP POLICY IF EXISTS farms_insert_auth                ON public.farms;
DROP POLICY IF EXISTS farms_update_scoped              ON public.farms;
DROP POLICY IF EXISTS farms_delete_admin               ON public.farms;

-- store_products
DROP POLICY IF EXISTS store_products_select_via_store  ON public.store_products;
DROP POLICY IF EXISTS store_products_mutate_via_store  ON public.store_products;
DROP POLICY IF EXISTS store_products_delete_admin      ON public.store_products;

-- store_competitors
DROP POLICY IF EXISTS store_competitors_select_via_store ON public.store_competitors;
DROP POLICY IF EXISTS store_competitors_mutate_via_store ON public.store_competitors;

-- sap_accounts
DROP POLICY IF EXISTS sap_accounts_manager_read        ON public.sap_accounts;
DROP POLICY IF EXISTS sap_accounts_deny_mutate         ON public.sap_accounts;

-- store_sap_matches
DROP POLICY IF EXISTS store_sap_matches_manager_read   ON public.store_sap_matches;
DROP POLICY IF EXISTS store_sap_matches_admin_mutate   ON public.store_sap_matches;
DROP POLICY IF EXISTS store_sap_matches_admin_only     ON public.store_sap_matches;

-- patrol_org_*
DROP POLICY IF EXISTS patrol_org_regions_auth_read     ON public.patrol_org_regions;
DROP POLICY IF EXISTS patrol_org_regions_admin_mutate  ON public.patrol_org_regions;
DROP POLICY IF EXISTS patrol_org_districts_auth_read   ON public.patrol_org_districts;
DROP POLICY IF EXISTS patrol_org_districts_admin_mutate ON public.patrol_org_districts;
DROP POLICY IF EXISTS patrol_org_territories_auth_read ON public.patrol_org_territories;
DROP POLICY IF EXISTS patrol_org_territories_admin_mutate ON public.patrol_org_territories;

-- ── Drop W1 helper functions (no longer referenced) ────────────
DROP FUNCTION IF EXISTS public.patrol_dsm_in_district(text);
DROP FUNCTION IF EXISTS public.patrol_rsm_in_region(text);
DROP FUNCTION IF EXISTS public.patrol_is_top_manager();
DROP FUNCTION IF EXISTS public.patrol_is_manager();
DROP FUNCTION IF EXISTS public.patrol_is_admin();
DROP FUNCTION IF EXISTS public.patrol_jwt_district();
DROP FUNCTION IF EXISTS public.patrol_jwt_region();
DROP FUNCTION IF EXISTS public.patrol_role();

-- ── Restore permissive pre-W1 state (test-phase pilot) ─────────
-- Both anon (Patrol clients pre-Supabase-Auth) and authenticated
-- (Google OAuth managers) can read/write. Role enforcement now
-- lives in the Vercel API proxy layer (api/_lib/auth.js + role
-- gates on api/admin/* and api/sap/* — unchanged by this rollback).

CREATE POLICY users_permissive_all  ON public.users  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY stores_permissive_all ON public.stores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY visits_permissive_all ON public.visits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY farms_permissive_all  ON public.farms  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON POLICY users_permissive_all  ON public.users  IS 'W1.4 rollback 2026-05-24: permissive until proper magic-link auth is designed. App role enforcement in Vercel API proxy.';
COMMENT ON POLICY stores_permissive_all ON public.stores IS 'W1.4 rollback 2026-05-24: permissive until proper magic-link auth is designed.';
COMMENT ON POLICY visits_permissive_all ON public.visits IS 'W1.4 rollback 2026-05-24: permissive until proper magic-link auth is designed.';
COMMENT ON POLICY farms_permissive_all  ON public.farms  IS 'W1.4 rollback 2026-05-24: permissive until proper magic-link auth is designed.';

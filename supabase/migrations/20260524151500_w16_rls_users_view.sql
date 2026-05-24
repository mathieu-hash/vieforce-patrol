-- ============================================================
-- Wave 1.6b — users view to block pin_hash from anon SELECT
-- ============================================================
-- 2026-05-24
--
-- Why:
--   W1.6 tried column-level REVOKE SELECT (pin_hash) ON users
--   FROM anon. Verified at the REST layer that anon could STILL
--   SELECT pin_hash via PostgREST — column-level privileges don't
--   gate PostgREST the way they do base PostgreSQL.
--
--   Switching to the Supabase-recommended pattern: hide the base
--   `users` table from anon entirely, and provide a view
--   `users_safe` that exposes everything EXCEPT pin_hash.
--
-- Idempotent.
-- ============================================================

-- 1. Restore the column-level grant so the privilege graph is clean.
GRANT SELECT (pin_hash) ON public.users TO anon;

-- 2. Drop anon's SELECT on the base table entirely (table-level).
REVOKE SELECT ON public.users FROM anon;

-- 3. Create the safe view.
DROP VIEW IF EXISTS public.users_safe;
CREATE VIEW public.users_safe AS
SELECT
  id,
  name,
  phone,
  email,
  role,
  region,
  district,
  territory,
  is_active,
  is_champion,
  language,
  sap_slpcode,
  sap_district_code,
  district_label,
  auth_type,
  created_at,
  updated_at
FROM public.users;

-- 4. Grant SELECT on the view to anon + authenticated.
GRANT SELECT ON public.users_safe TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'W1.6b: users_safe view created. anon must now query users_safe (no pin_hash); authenticated keeps full users access.';
END$$;

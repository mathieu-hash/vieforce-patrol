-- ============================================================
-- Wave 1.6 — RLS scoping for test-phase pilot (Option A)
-- ============================================================
-- 2026-05-24
--
-- Why:
--   W1.5 disabled RLS on 11 tables to unblock login. That left:
--   - C-1: anon key + RLS off = anyone with a curl can SELECT
--     all `users` including plaintext `pin_hash`. One HTTP call =
--     full credential dump.
--   - SAP / store_sap_matches anon-readable
--
--   Mat 2026-05-24 chose Option A: scope-and-revoke. Re-enable
--   RLS with policies that:
--     - DENY anon SELECT on pin_hash (column-level REVOKE)
--     - DENY anon all mutation on `users` (admin manages users
--       via authenticated Google OAuth session OR service-role
--       API endpoints)
--     - DENY anon all access on sap_accounts + store_sap_matches
--       (manager-only data)
--     - KEEP stores/visits/farms anon-writable (TSR PIN client
--       legitimately mutates these via the anon flow)
--     - KEEP patrol_org_* read-open (picklist data needs to load
--       for every user on every shell)
--
--   This restores the W1 anti-PIN-dump goal without breaking
--   the legacy TSR PIN flow.
--
-- Idempotent: DROP IF EXISTS + CREATE everywhere.
-- ============================================================


-- ── 1. USERS — anon SELECT allowed (without pin_hash), no mutations
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_permissive_all       ON public.users;
DROP POLICY IF EXISTS users_authenticated_only   ON public.users;
DROP POLICY IF EXISTS users_anon_select          ON public.users;
DROP POLICY IF EXISTS users_authenticated_all    ON public.users;

-- Anon (TSR PIN clients without Supabase Auth session) can SELECT
-- — the column-level REVOKE below prevents pin_hash from being read.
CREATE POLICY users_anon_select ON public.users
  FOR SELECT TO anon USING (true);

-- Authenticated (Google OAuth managers) get full access.
CREATE POLICY users_authenticated_all ON public.users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Column-level revoke: this is the KEY defense against the PIN dump.
-- Even if anon constructs a query that requests pin_hash, PostgREST
-- will reject the query because anon lacks SELECT privilege on the
-- column. Authenticated keeps full column SELECT.
REVOKE SELECT (pin_hash) ON public.users FROM anon;
GRANT  SELECT (pin_hash) ON public.users TO authenticated, service_role;


-- ── 2. STORES — open (TSR client legitimately mutates)
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stores_permissive_all ON public.stores;
DROP POLICY IF EXISTS stores_all_access      ON public.stores;
CREATE POLICY stores_all_access ON public.stores
  FOR ALL USING (true) WITH CHECK (true);


-- ── 3. VISITS — open
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visits_permissive_all ON public.visits;
DROP POLICY IF EXISTS visits_all_access      ON public.visits;
CREATE POLICY visits_all_access ON public.visits
  FOR ALL USING (true) WITH CHECK (true);


-- ── 4. FARMS — open
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farms_permissive_all ON public.farms;
DROP POLICY IF EXISTS farms_all_access      ON public.farms;
CREATE POLICY farms_all_access ON public.farms
  FOR ALL USING (true) WITH CHECK (true);


-- ── 5. STORE_PRODUCTS, STORE_COMPETITORS — open
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_products_all_access ON public.store_products;
CREATE POLICY store_products_all_access ON public.store_products
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.store_competitors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_competitors_all_access ON public.store_competitors;
CREATE POLICY store_competitors_all_access ON public.store_competitors
  FOR ALL USING (true) WITH CHECK (true);


-- ── 6. SAP_ACCOUNTS — authenticated only (manager-level data)
ALTER TABLE public.sap_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sap_accounts_authenticated_only ON public.sap_accounts;
CREATE POLICY sap_accounts_authenticated_only ON public.sap_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- anon implicitly denied (no policy applies to anon role)


-- ── 7. STORE_SAP_MATCHES — authenticated only
ALTER TABLE public.store_sap_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_sap_matches_authenticated_only ON public.store_sap_matches;
CREATE POLICY store_sap_matches_authenticated_only ON public.store_sap_matches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 8. PATROL_ORG_* — read open (picklists), mutate authenticated
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['patrol_org_regions', 'patrol_org_districts', 'patrol_org_territories'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_read_anon ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_write_auth ON public.%I', t, t);
      EXECUTE format('CREATE POLICY %I_read_anon ON public.%I FOR SELECT USING (true)', t, t);
      EXECUTE format('CREATE POLICY %I_write_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
    END IF;
  END LOOP;
END$$;


-- ── Sanity log (visible in supabase db push output) ────────────
DO $$
BEGIN
  RAISE NOTICE 'W1.6 RLS scoping complete. anon SELECT on users.pin_hash is now blocked at the column level. sap_accounts + store_sap_matches are manager-only. stores/visits/farms remain anon-writable.';
END$$;

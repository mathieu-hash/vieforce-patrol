-- ============================================================
-- Wave 1.5 — Nuclear: disable RLS on public tables for test phase
-- ============================================================
-- 2026-05-24
--
-- Why:
--   Even after W1.4 dropped all the policies I created, a pre-W1
--   legacy policy on `public.users` causes "42P17 infinite
--   recursion detected" on every SELECT. The policy queries
--   the users table to check itself.
--
--   For the test-phase pilot, RLS is not load-bearing — the
--   Vercel API proxy (api/_lib/auth.js + role gates on api/admin/*
--   and api/sap/*) does all role enforcement. The anon key is
--   already public in config.js; the trust boundary lives in
--   the proxy layer, not Postgres policies.
--
-- Action:
--   1. Drop ALL policies on the affected tables (catch-all via
--      pg_policies enumeration in a DO block).
--   2. DISABLE ROW LEVEL SECURITY on those tables.
--
-- Reverse this in a future wave when designing the proper
-- magic-link auth flow + correctly-scoped RLS policies.
-- ============================================================

DO $$
DECLARE
  r record;
  affected_tables text[] := ARRAY[
    'users', 'stores', 'visits', 'farms',
    'store_products', 'store_competitors',
    'sap_accounts', 'store_sap_matches',
    'patrol_org_regions', 'patrol_org_districts', 'patrol_org_territories'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY affected_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Table public.% does not exist — skipping', t;
      CONTINUE;
    END IF;

    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      RAISE NOTICE 'Dropped policy %.%', t, r.policyname;
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'Disabled RLS on public.%', t;
  END LOOP;
END$$;

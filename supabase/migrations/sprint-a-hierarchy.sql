-- Sprint A — DSM / RSM / Exec role hierarchy
-- Run this in Supabase SQL Editor before sprint-a-test-accounts.sql.
-- Idempotent: safe to re-run.

-- Expand user roles to include champion + exec
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role IN ('tsr','champion','dsm','rsm','exec','admin')
  );

-- Manager relationships (TSR.manager_id -> DSM, DSM.manager_id -> RSM, RSM.manager_id -> Exec)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS users_manager_idx
  ON public.users(manager_id);

-- Auth type (for future Google SSO in Sprint C)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_type text
  DEFAULT 'pin' CHECK (auth_type IN ('pin','email'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text UNIQUE;

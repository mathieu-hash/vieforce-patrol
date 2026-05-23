-- VieForce Patrol — Database Schema
-- Run in Supabase SQL Editor in order

-- 1. Users
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  pin_hash text not null,
  name text not null,
  role text not null check (role in ('tsr','champion','dsm','rsm','exec','admin')),
  region text,
  district text,
  territory text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists users_phone_idx on public.users(phone);

-- 2. Stores (POS Master)
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text,
  phone text,
  address text,
  city text,
  province text,
  region text,
  store_type text check (store_type in ('feeds_dealer','farm_supply','pet_shop','veterinary','supermarket','other')),
  lat double precision,
  lng double precision,
  photo_url text,
  health_status text default 'ok' check (health_status in ('ok','warn','crit')),
  vol_class text check (vol_class in ('A','B','C')),
  cov_class text check (cov_class in ('A','B','C')),
  segment text,
  bags_per_month integer default 0,
  last_visit_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists stores_region_idx on public.stores(region);

-- 3. Store Products
create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  brand text not null,
  product_group text not null check (product_group in ('hog','poultry','gamefowl','aqua','pet','dairy','other')),
  bags_per_month integer default 0,
  is_vienovo boolean default false,
  created_at timestamptz default now()
);
create index if not exists store_products_store_idx on public.store_products(store_id);

-- 4. Store Competitors
create table if not exists public.store_competitors (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  brand_name text not null,
  product_group text,
  est_bags_per_month integer default 0,
  notes text,
  created_at timestamptz default now()
);
create index if not exists store_competitors_store_idx on public.store_competitors(store_id);

-- 5. Visits
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  tsr_id uuid not null references public.users(id),
  visit_type text not null check (visit_type in ('mapping','regular','order','merch','farm')),
  lat double precision,
  lng double precision,
  photo_url text,
  notes text,
  order_taken boolean default false,
  order_amount numeric(12,2) default 0,
  merch_score integer check (merch_score between 0 and 5),
  duration_mins integer,
  offline_id text unique,
  visited_at timestamptz default now(),
  synced_at timestamptz default now()
);
create index if not exists visits_tsr_idx on public.visits(tsr_id);
create index if not exists visits_store_idx on public.visits(store_id);
create index if not exists visits_date_idx on public.visits(visited_at desc);

-- 5b. Farms
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in ('hog','poultry','gamefowl','aqua','dairy','mixed','other')),
  owner_name text,
  phone text,
  address text,
  city text,
  province text,
  region text,
  lat double precision,
  lng double precision,
  photo_url text,
  health_status text default 'ok' check (health_status in ('ok','warn','crit')),
  heads integer default 0,
  size_hectares numeric(8,2),
  segment text,
  bags_per_month integer default 0,
  last_visit_at timestamptz,
  created_by uuid references public.users(id),
  assigned_tsr uuid references public.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farms_region_idx on public.farms(region);
create index if not exists farms_assigned_tsr_idx on public.farms(assigned_tsr);

-- 6. Migration: Add assigned_tsr column (for DSM→TSR store assignment)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS assigned_tsr uuid REFERENCES public.users(id);
CREATE INDEX IF NOT EXISTS stores_assigned_tsr_idx ON public.stores(assigned_tsr);

-- 6b. Migration: Add is_champion flag (Peer Champion model — 1 per 10-15 TSRs)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_champion boolean DEFAULT false;

-- 7. Seed Data
insert into public.users (phone, pin_hash, name, role, region, district, territory) values
('09170000001', '1234', 'Rico Abante', 'tsr', 'Luzon', 'Metro Manila', 'MM-North'),
('09170000002', '1234', 'Jake Santos', 'tsr', 'Luzon', 'Metro Manila', 'MM-South'),
('09170000003', '1234', 'Jefrey Florentino', 'dsm', 'Luzon', 'Metro Manila', null),
('09170000099', '1234', 'Admin User', 'admin', null, null, null)
on conflict (phone) do nothing;

-- ============================================================
-- 8. ROW LEVEL SECURITY POLICIES (consolidated — Wave 1 hardening)
-- Authoritative migration: 20260521120000_rls_hardening_w1.sql
-- Depends on W1-AuthCore Edge Function stamping auth.jwt() with
-- app_metadata.role / region / district / patrol_user_id and using
-- users.id as the JWT sub. Safe to re-run.
-- ============================================================

-- Helper functions (read claims from the AuthCore-stamped JWT)
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

-- Top managers (exec/CEO/EVP/admin/marketing) see ALL rows — above hierarchy.
CREATE OR REPLACE FUNCTION public.patrol_is_top_manager() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.patrol_role() IN ('admin', 'ceo', 'evp', 'exec', 'marketing')
$$;

CREATE OR REPLACE FUNCTION public.patrol_rsm_in_region(p_region text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.patrol_role() = 'rsm'
     AND public.patrol_jwt_region() IS NOT NULL
     AND public.patrol_jwt_region() = p_region
$$;

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

-- Enable RLS on every Patrol-managed table
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_competitors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farms               ENABLE ROW LEVEL SECURITY;

-- USERS: self + admin SELECT/UPDATE; admin INSERT/DELETE only.
DROP POLICY IF EXISTS users_self_or_admin_select ON public.users;
DROP POLICY IF EXISTS users_self_or_admin_update ON public.users;
DROP POLICY IF EXISTS users_admin_insert        ON public.users;
DROP POLICY IF EXISTS users_admin_delete        ON public.users;

CREATE POLICY users_self_or_admin_select ON public.users
  FOR SELECT USING (auth.uid() = id OR public.patrol_is_admin());

CREATE POLICY users_self_or_admin_update ON public.users
  FOR UPDATE
  USING      (auth.uid() = id OR public.patrol_is_admin())
  WITH CHECK (auth.uid() = id OR public.patrol_is_admin());

CREATE POLICY users_admin_insert ON public.users
  FOR INSERT WITH CHECK (public.patrol_is_admin());

CREATE POLICY users_admin_delete ON public.users
  FOR DELETE USING (public.patrol_is_admin());

-- STORES: TSR own/assigned; manager scoped by region OR district; admin all.
DROP POLICY IF EXISTS stores_select_scoped ON public.stores;
DROP POLICY IF EXISTS stores_insert_auth   ON public.stores;
DROP POLICY IF EXISTS stores_update_scoped ON public.stores;
DROP POLICY IF EXISTS stores_delete_admin  ON public.stores;

-- Hierarchy: TSR (own) → DSM (district) → RSM (region) → top-manager (all).
CREATE POLICY stores_select_scoped ON public.stores
  FOR SELECT USING (
    public.patrol_is_top_manager()
    OR public.patrol_rsm_in_region(stores.region)
    OR public.patrol_dsm_in_district(stores.district)
    OR stores.assigned_tsr = auth.uid()
    OR stores.created_by = auth.uid()
  );

CREATE POLICY stores_insert_auth ON public.stores
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

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
  FOR DELETE USING (public.patrol_is_admin());

-- STORE_PRODUCTS: inherit access from parent store; admin override.
DROP POLICY IF EXISTS store_products_select_via_store ON public.store_products;
DROP POLICY IF EXISTS store_products_mutate_via_store ON public.store_products;

CREATE POLICY store_products_select_via_store ON public.store_products
  FOR SELECT USING (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_products.store_id
        AND (public.patrol_is_manager()
             OR s.assigned_tsr = auth.uid()
             OR s.created_by = auth.uid())
    )
  );

CREATE POLICY store_products_mutate_via_store ON public.store_products
  FOR ALL
  USING (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_products.store_id
        AND (public.patrol_is_manager()
             OR s.assigned_tsr = auth.uid()
             OR s.created_by = auth.uid())
    )
  )
  WITH CHECK (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_products.store_id
        AND (public.patrol_is_manager()
             OR s.assigned_tsr = auth.uid()
             OR s.created_by = auth.uid())
    )
  );

-- STORE_COMPETITORS: same pattern as store_products.
DROP POLICY IF EXISTS store_competitors_select_via_store ON public.store_competitors;
DROP POLICY IF EXISTS store_competitors_mutate_via_store ON public.store_competitors;

CREATE POLICY store_competitors_select_via_store ON public.store_competitors
  FOR SELECT USING (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_competitors.store_id
        AND (public.patrol_is_manager()
             OR s.assigned_tsr = auth.uid()
             OR s.created_by = auth.uid())
    )
  );

CREATE POLICY store_competitors_mutate_via_store ON public.store_competitors
  FOR ALL
  USING (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_competitors.store_id
        AND (public.patrol_is_manager()
             OR s.assigned_tsr = auth.uid()
             OR s.created_by = auth.uid())
    )
  )
  WITH CHECK (
    public.patrol_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_competitors.store_id
        AND (public.patrol_is_manager()
             OR s.assigned_tsr = auth.uid()
             OR s.created_by = auth.uid())
    )
  );

-- VISITS: TSR own; manager any; admin all. UPDATE limited to 24h for TSR.
DROP POLICY IF EXISTS visits_select_scoped      ON public.visits;
DROP POLICY IF EXISTS visits_insert_self        ON public.visits;
DROP POLICY IF EXISTS visits_update_self_or_mgr ON public.visits;
DROP POLICY IF EXISTS visits_delete_admin       ON public.visits;

-- Visits inherit hierarchy via parent store (EXISTS-join).
CREATE POLICY visits_select_scoped ON public.visits
  FOR SELECT USING (
    public.patrol_is_top_manager()
    OR visits.tsr_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = visits.store_id
        AND (public.patrol_rsm_in_region(s.region)
             OR public.patrol_dsm_in_district(s.district))
    )
  );

CREATE POLICY visits_insert_self ON public.visits
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND visits.tsr_id = auth.uid()
  );

CREATE POLICY visits_update_self_or_mgr ON public.visits
  FOR UPDATE
  USING (
    public.patrol_is_top_manager()
    OR (visits.tsr_id = auth.uid()
        AND visits.visited_at >= (now() - interval '24 hours'))
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = visits.store_id
        AND (public.patrol_rsm_in_region(s.region)
             OR public.patrol_dsm_in_district(s.district))
    )
  )
  WITH CHECK (
    public.patrol_is_top_manager()
    OR (visits.tsr_id = auth.uid()
        AND visits.visited_at >= (now() - interval '24 hours'))
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = visits.store_id
        AND (public.patrol_rsm_in_region(s.region)
             OR public.patrol_dsm_in_district(s.district))
    )
  );

CREATE POLICY visits_delete_admin ON public.visits
  FOR DELETE USING (public.patrol_is_admin());

-- FARMS: same pattern as stores.
DROP POLICY IF EXISTS farms_select_scoped ON public.farms;
DROP POLICY IF EXISTS farms_insert_auth   ON public.farms;
DROP POLICY IF EXISTS farms_update_scoped ON public.farms;
DROP POLICY IF EXISTS farms_delete_admin  ON public.farms;

-- Farms hierarchy is region-only (no district column). DSM gets farms
-- only if assigned or creator. Add district column later for DSM scope.
CREATE POLICY farms_select_scoped ON public.farms
  FOR SELECT USING (
    public.patrol_is_top_manager()
    OR public.patrol_rsm_in_region(farms.region)
    OR farms.assigned_tsr = auth.uid()
    OR farms.created_by = auth.uid()
  );

CREATE POLICY farms_insert_auth ON public.farms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

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
  FOR DELETE USING (public.patrol_is_admin());

-- SAP_ACCOUNTS: manager-read only; deny mutations (service-role syncs).
ALTER TABLE public.sap_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sap_accounts_manager_read ON public.sap_accounts;

CREATE POLICY sap_accounts_manager_read ON public.sap_accounts
  FOR SELECT USING (public.patrol_is_manager());

-- STORE_SAP_MATCHES: admin-only (Mat 2026-05-21 — DSMs don't need raw
-- match-log visibility; curated data flows through stores).
ALTER TABLE public.store_sap_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_sap_matches_manager_read ON public.store_sap_matches;
DROP POLICY IF EXISTS store_sap_matches_admin_mutate ON public.store_sap_matches;
DROP POLICY IF EXISTS store_sap_matches_admin_only   ON public.store_sap_matches;

CREATE POLICY store_sap_matches_admin_only ON public.store_sap_matches
  FOR ALL
  USING      (public.patrol_is_admin())
  WITH CHECK (public.patrol_is_admin());

-- PATROL_ORG_* (regions / districts / territories): any authenticated user reads,
-- admin mutates.
ALTER TABLE public.patrol_org_regions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_org_districts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_org_territories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patrol_org_regions_auth_read       ON public.patrol_org_regions;
DROP POLICY IF EXISTS patrol_org_regions_admin_mutate    ON public.patrol_org_regions;
DROP POLICY IF EXISTS patrol_org_districts_auth_read     ON public.patrol_org_districts;
DROP POLICY IF EXISTS patrol_org_districts_admin_mutate  ON public.patrol_org_districts;
DROP POLICY IF EXISTS patrol_org_territories_auth_read   ON public.patrol_org_territories;
DROP POLICY IF EXISTS patrol_org_territories_admin_mutate ON public.patrol_org_territories;

CREATE POLICY patrol_org_regions_auth_read ON public.patrol_org_regions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY patrol_org_regions_admin_mutate ON public.patrol_org_regions
  FOR ALL USING (public.patrol_is_admin()) WITH CHECK (public.patrol_is_admin());

CREATE POLICY patrol_org_districts_auth_read ON public.patrol_org_districts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY patrol_org_districts_admin_mutate ON public.patrol_org_districts
  FOR ALL USING (public.patrol_is_admin()) WITH CHECK (public.patrol_is_admin());

CREATE POLICY patrol_org_territories_auth_read ON public.patrol_org_territories
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY patrol_org_territories_admin_mutate ON public.patrol_org_territories
  FOR ALL USING (public.patrol_is_admin()) WITH CHECK (public.patrol_is_admin());

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
  farm_type text check (farm_type in ('hog','poultry','gamefowl','aqua','dairy','mixed','other')),
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
-- 8. ROW LEVEL SECURITY POLICIES
-- Run after seed data. Safe to re-run (uses IF NOT EXISTS pattern).
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

-- USERS: own record (select) + admin full access
DROP POLICY IF EXISTS "Users read own record" ON public.users;
CREATE POLICY "Users read own record" ON public.users
  FOR SELECT USING (true);
  -- Note: PIN auth is via Edge Function, not RLS. Allow read for login flow.

DROP POLICY IF EXISTS "Admins manage users" ON public.users;
CREATE POLICY "Admins manage users" ON public.users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text AND u.role = 'admin')
  );

-- STORES: TSR sees own created + assigned, managers see all
DROP POLICY IF EXISTS "TSR sees own stores" ON public.stores;
CREATE POLICY "TSR sees own stores" ON public.stores
  FOR SELECT USING (
    created_by::text = auth.uid()::text
    OR assigned_tsr::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text AND u.role IN ('dsm','rsm','admin'))
  );

DROP POLICY IF EXISTS "TSR inserts stores" ON public.stores;
CREATE POLICY "TSR inserts stores" ON public.stores
  FOR INSERT WITH CHECK (created_by::text = auth.uid()::text);

DROP POLICY IF EXISTS "TSR updates own stores" ON public.stores;
CREATE POLICY "TSR updates own stores" ON public.stores
  FOR UPDATE USING (
    created_by::text = auth.uid()::text
    OR assigned_tsr::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text AND u.role IN ('dsm','rsm','admin'))
  );

-- STORE_PRODUCTS: inherit store access
DROP POLICY IF EXISTS "Store products inherit access" ON public.store_products;
CREATE POLICY "Store products inherit access" ON public.store_products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id)
  );

-- STORE_COMPETITORS: inherit store access
DROP POLICY IF EXISTS "Store competitors inherit access" ON public.store_competitors;
CREATE POLICY "Store competitors inherit access" ON public.store_competitors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id)
  );

-- VISITS: TSR sees own, managers see all
DROP POLICY IF EXISTS "TSR sees own visits" ON public.visits;
CREATE POLICY "TSR sees own visits" ON public.visits
  FOR SELECT USING (
    tsr_id::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text AND u.role IN ('dsm','rsm','admin'))
  );

DROP POLICY IF EXISTS "TSR inserts own visits" ON public.visits;
CREATE POLICY "TSR inserts own visits" ON public.visits
  FOR INSERT WITH CHECK (tsr_id::text = auth.uid()::text);

-- FARMS: same pattern as stores
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TSR sees own farms" ON public.farms;
CREATE POLICY "TSR sees own farms" ON public.farms
  FOR SELECT USING (
    created_by::text = auth.uid()::text
    OR assigned_tsr::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text AND u.role IN ('dsm','rsm','admin'))
  );

DROP POLICY IF EXISTS "TSR inserts farms" ON public.farms;
CREATE POLICY "TSR inserts farms" ON public.farms
  FOR INSERT WITH CHECK (created_by::text = auth.uid()::text);

DROP POLICY IF EXISTS "TSR updates own farms" ON public.farms;
CREATE POLICY "TSR updates own farms" ON public.farms
  FOR UPDATE USING (
    created_by::text = auth.uid()::text
    OR assigned_tsr::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = auth.uid()::text AND u.role IN ('dsm','rsm','admin'))
  );

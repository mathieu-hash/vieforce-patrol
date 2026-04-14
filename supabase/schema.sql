-- VieForce Patrol — Database Schema
-- Run in Supabase SQL Editor in order

-- 1. Users
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  pin_hash text not null,
  name text not null,
  role text not null check (role in ('tsr','dsm','rsm','admin')),
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

-- 6. Seed Data
insert into public.users (phone, pin_hash, name, role, region, district, territory) values
('09170000001', '1234', 'Rico Abante', 'tsr', 'Luzon', 'Metro Manila', 'MM-North'),
('09170000002', '1234', 'Jake Santos', 'tsr', 'Luzon', 'Metro Manila', 'MM-South'),
('09170000003', '1234', 'Jefrey Florentino', 'dsm', 'Luzon', 'Metro Manila', null),
('09170000099', '1234', 'Admin User', 'admin', null, null, null)
on conflict (phone) do nothing;

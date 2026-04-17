-- Sprint A Phase 3 — Lifecycle evaluation framework
-- Adds Prospection / Conversion / Retention / Growth columns to stores.
-- Run in Supabase SQL Editor. Idempotent.

-- Prospect lifecycle
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_status text DEFAULT 'active'
  CHECK (store_status IN ('prospect','active','inactive','lost'));

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS prospect_stage text
  CHECK (prospect_stage IN
    ('identified','contacted','interested','trial','converted'));

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS lost_reason text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS lost_competitor text;

-- Retention tracking (synced from SAP later)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS last_order_at timestamptz;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS mtd_volume_mt numeric(10,2);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS mtd_amount numeric(12,2);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS risk_status text DEFAULT 'healthy'
  CHECK (risk_status IN ('healthy','at_risk','lost','recovered'));

-- Growth tracking
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS prev_month_volume_mt numeric(10,2);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS ytd_volume_mt numeric(10,2);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS share_of_stomach numeric(5,2);

CREATE INDEX IF NOT EXISTS stores_status_idx
  ON public.stores(store_status);
CREATE INDEX IF NOT EXISTS stores_risk_idx
  ON public.stores(risk_status);

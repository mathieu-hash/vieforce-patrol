-- ============================================================
-- Sprint B — Patrol as Mobile Hub
-- Adds SAP customer mapping to the stores table + sap_accounts
-- cache + store_sap_matches audit log.
-- Author: Sprint B-DSM Agent · 2026-04-18
-- Idempotent: safe to re-run. Run in Supabase SQL Editor.
-- Depends on: sprint-a-hierarchy.sql (manager_id + champion/exec roles)
-- ============================================================

-- ── 1. Add SAP mapping columns to stores ──────────────────────
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS sap_cardcode   TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS sap_cardname   TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS account_type   TEXT DEFAULT 'pos';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS sap_mapped_at  TIMESTAMPTZ;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS sap_mapped_by  UUID REFERENCES public.users(id);

COMMENT ON COLUMN public.stores.account_type IS
  'pos: TSR-managed POS store, direct_account: SAP distributor, key_account: VIP SAP customer';

-- Backfill NULLs BEFORE applying the CHECK constraint
UPDATE public.stores SET account_type = 'pos' WHERE account_type IS NULL;

-- CHECK constraint — idempotent via DO block (no IF NOT EXISTS for CHECK < PG17)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stores_account_type_check'
      AND conrelid = 'public.stores'::regclass
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_account_type_check
      CHECK (account_type IN ('pos', 'direct_account', 'key_account'));
  END IF;
END $$;

-- Indexes for SAP lookup (partial on sap_cardcode since most rows are POS-only)
CREATE INDEX IF NOT EXISTS idx_stores_sap_cardcode
  ON public.stores(sap_cardcode) WHERE sap_cardcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stores_account_type
  ON public.stores(account_type);

-- ── 2. SAP accounts cache ─────────────────────────────────────
-- Mirrors the minimum fields Patrol needs from SAP B1 OCRD for
-- mapping + map rendering. Synced nightly from analytics.vienovo.ph.
CREATE TABLE IF NOT EXISTS public.sap_accounts (
  cardcode        TEXT PRIMARY KEY,
  cardname        TEXT NOT NULL,
  region          TEXT,
  district        TEXT,
  address         TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  bu              TEXT,
  slp_code        TEXT,
  slp_name        TEXT,
  last_synced_at  TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sap_accounts_region   ON public.sap_accounts(region);
CREATE INDEX IF NOT EXISTS idx_sap_accounts_district ON public.sap_accounts(district);
CREATE INDEX IF NOT EXISTS idx_sap_accounts_slp      ON public.sap_accounts(slp_code);
CREATE INDEX IF NOT EXISTS idx_sap_accounts_location ON public.sap_accounts(lat, lng);

-- ── 3. RLS policies on sap_accounts ───────────────────────────
ALTER TABLE public.sap_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sap_accounts_exec_all      ON public.sap_accounts;
DROP POLICY IF EXISTS sap_accounts_rsm_region    ON public.sap_accounts;
DROP POLICY IF EXISTS sap_accounts_dsm_district  ON public.sap_accounts;

CREATE POLICY sap_accounts_exec_all ON public.sap_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id::text = auth.uid()::text
        AND u.role IN ('exec','ceo','evp','admin')
    )
  );

CREATE POLICY sap_accounts_rsm_region ON public.sap_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id::text = auth.uid()::text
        AND u.role = 'rsm'
        AND upper(u.region) = upper(sap_accounts.region)
    )
  );

CREATE POLICY sap_accounts_dsm_district ON public.sap_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id::text = auth.uid()::text
        AND u.role = 'dsm'
        AND upper(u.district) = upper(sap_accounts.district)
    )
  );

-- ── 4. Store ↔ SAP match audit log ────────────────────────────
-- Each manual or automated mapping attempt is recorded here for
-- forensic traceability. One store can have multiple rows over
-- time as mappings are revised.
CREATE TABLE IF NOT EXISTS public.store_sap_matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sap_cardcode  TEXT NOT NULL,
  confidence    TEXT, -- 'manual' | 'fuzzy_high' | 'fuzzy_med' | 'gps_match'
  matched_by    UUID REFERENCES public.users(id),
  matched_at    TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_store_sap_matches_store    ON public.store_sap_matches(store_id);
CREATE INDEX IF NOT EXISTS idx_store_sap_matches_cardcode ON public.store_sap_matches(sap_cardcode);

-- confidence CHECK (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'store_sap_matches_confidence_check'
      AND conrelid = 'public.store_sap_matches'::regclass
  ) THEN
    ALTER TABLE public.store_sap_matches
      ADD CONSTRAINT store_sap_matches_confidence_check
      CHECK (confidence IS NULL OR confidence IN ('manual','fuzzy_high','fuzzy_med','fuzzy_low','gps_match'));
  END IF;
END $$;

-- ── 5. Verification hints ────────────────────────────────────
-- After running:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'stores' AND column_name LIKE 'sap_%' OR column_name = 'account_type';
--   -- Expect: sap_cardcode, sap_cardname, account_type, sap_mapped_at, sap_mapped_by
--
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.stores'::regclass;
--   -- Expect users_role_check + stores_account_type_check
--
--   SELECT count(*) FROM public.sap_accounts;
--   -- Expect 0 (or 5 if sprint-b-sap-seed.sql ran).

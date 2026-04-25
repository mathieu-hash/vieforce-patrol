-- ==============================================================
-- Reduce store_type CHECK constraint to 4 categories.
--
-- Was: 6 (feeds_dealer, farm_supply, pet_shop, veterinary,
--         supermarket, other) — never deployed; was an interim
--         widening proposed earlier in the same Saturday sprint.
-- Now: 4 (feeds_dealer, farm, pet_shop, other)
--
-- Reason: Mat scoped down to the 4 categories Vienovo actively
-- targets in 2026. Vet + Supermarket are out-of-scope for now and
-- can be added back via a one-line ALTER if needed.
--
-- Also: 'farm_supply' renamed to 'farm' for the cleaner DB value.
-- Safe because public.stores is empty (no rows to migrate).
--
-- Idempotent: DROP IF EXISTS + ADD. Apply via Supabase SQL editor.
-- ==============================================================

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_store_type_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_store_type_check
  CHECK (store_type IS NULL OR store_type IN (
    'feeds_dealer',
    'farm',
    'pet_shop',
    'other'
  ));

-- ==============================================================
-- Verify (run after applying):
--   SELECT pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conname = 'stores_store_type_check';
--   -- Expected: CHECK ((store_type IS NULL) OR (store_type = ANY
--   --           ('{feeds_dealer,farm,pet_shop,other}'::text[])))
-- ==============================================================

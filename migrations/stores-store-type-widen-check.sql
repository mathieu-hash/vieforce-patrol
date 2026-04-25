-- ==============================================================
-- Patrol — widen stores_store_type_check to allow chatbot values
--
-- Diagnosed 2026-04-25 during the Saturday autonomous sprint:
-- the existing CHECK constraint on public.stores.store_type only
-- accepts NULL and 'other'. Every other value (including all 5
-- chatbot quick-reply values: feeds_dealer / farm_supply / pet_shop
-- / veterinary / supermarket) rejects with HTTP 400.
--
-- Symptom: a DSM (e.g. Jefrey Gatchalian) registers a POS in the
-- VieForce Assistant chat → queueStore writes to IndexedDB →
-- syncPending tries to INSERT → 23514 violation → 3 retries →
-- _markRetryOrEject drops the record silently. User sees a "saved"
-- toast on the queue write, then reloads and sees nothing.
--
-- This migration widens the constraint to the union of:
--   - the 6 chatbot quick-reply values (Section app.html:1623)
--   - the legacy 'other' (already accepted)
--   - NULL (already accepted)
--
-- Idempotent: DROP IF EXISTS + ADD. No data loss possible (every
-- existing row is either NULL or 'other' — both still pass).
-- ==============================================================

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_store_type_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_store_type_check
  CHECK (store_type IS NULL OR store_type IN (
    'feeds_dealer',
    'farm_supply',
    'pet_shop',
    'veterinary',
    'supermarket',
    'other'
  ));

-- ==============================================================
-- Verify (run after applying):
--   SELECT pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conname = 'stores_store_type_check';
--   -- Expected: CHECK ((store_type IS NULL) OR (store_type = ANY ...))
--
-- Smoke test (any of these should now succeed):
--   INSERT INTO public.stores (name, store_type, health_status)
--   VALUES ('SMOKE_TEST', 'feeds_dealer', 'ok');
--
--   DELETE FROM public.stores WHERE name = 'SMOKE_TEST';
-- ==============================================================

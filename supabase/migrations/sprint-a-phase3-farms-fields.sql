-- Sprint A.1 — farm chatbot captures fields not in base schema (H-07)
-- Adds: breed, feed_partner, vet_support (text columns)
-- Expands the type enum to include 'layer' (chatbot offers it).
-- NOTE: the live farms table column is named `type`, not `farm_type` — the original
-- schema.sql was wrong. This migration targets the real column.
-- Idempotent.

ALTER TABLE public.farms DROP CONSTRAINT IF EXISTS farms_type_check;
ALTER TABLE public.farms DROP CONSTRAINT IF EXISTS farms_farm_type_check;
ALTER TABLE public.farms
  ADD CONSTRAINT farms_type_check
  CHECK (type IN ('hog','poultry','layer','gamefowl','aqua','dairy','mixed','other'));

ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS breed text;
ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS feed_partner text;
ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS vet_support text
  CHECK (vet_support IN ('regular','occasional','none') OR vet_support IS NULL);

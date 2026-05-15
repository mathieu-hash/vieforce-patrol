-- Optional Facebook Messenger contact for POS owners (often used instead of phone).
-- Idempotent.

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS owner_messenger TEXT;

COMMENT ON COLUMN public.stores.owner_messenger IS
  'Owner FB Messenger: full https://m.me/... link, m.me/username, or Facebook username.';

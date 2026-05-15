-- Phase 4.8 — user language preference (en | tl | ceb)
-- Idempotent: safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

UPDATE public.users SET language = 'en' WHERE language IS NULL OR trim(language) = '';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_language_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_language_check CHECK (language IN ('en', 'tl', 'ceb'));

CREATE INDEX IF NOT EXISTS users_language_idx ON public.users(language);

COMMENT ON COLUMN public.users.language IS 'Patrol UI locale: en, tl (Tagalog), ceb (Cebuano/Bisaya).';

-- Marketing Manager role slug used by Patrol User Admin gate (`marketing`).
-- Expands users.role CHECK to match roles referenced across Patrol + HQ onboarding.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (
  role IN (
    'tsr',
    'champion',
    'dsm',
    'rsm',
    'exec',
    'admin',
    'ceo',
    'evp',
    'director',
    'president',
    'marketing'
  )
);

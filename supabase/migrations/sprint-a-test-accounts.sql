-- Sprint A — Test accounts for DSM / RSM / Exec roles
-- Run AFTER sprint-a-hierarchy.sql.
-- Idempotent: ON CONFLICT (phone) updates role so re-running is safe.
-- PINs stored as plain text for testing (verify-pin compares pin_hash to entered PIN).

-- Test DSMs
INSERT INTO public.users (phone, pin_hash, name, role, region, district, territory, is_active)
VALUES
  ('09180000001', '1234', 'Jefrey Florentino', 'dsm', 'Luzon', 'MM-North', 'MM-North', true),
  ('09180000002', '1234', 'Marvin Dela Cruz',   'dsm', 'Luzon', 'MM-South', 'MM-South', true)
ON CONFLICT (phone) DO UPDATE SET role = EXCLUDED.role;

-- Test RSM
INSERT INTO public.users (phone, pin_hash, name, role, region, is_active)
VALUES
  ('09180000010', '1234', 'Rina Morales', 'rsm', 'Luzon', true)
ON CONFLICT (phone) DO UPDATE SET role = EXCLUDED.role;

-- Test Exec
INSERT INTO public.users (phone, pin_hash, name, role, is_active)
VALUES
  ('09180000099', '1234', 'Mathieu Guillaume', 'exec', true)
ON CONFLICT (phone) DO UPDATE SET role = EXCLUDED.role;

-- Link TSRs to their DSM (Rico + Jake -> Jefrey)
UPDATE public.users
SET manager_id = (SELECT id FROM public.users WHERE phone = '09180000001')
WHERE phone IN ('09170000001','09170000002');

-- Link DSMs to their RSM (Jefrey + Marvin -> Rina)
UPDATE public.users
SET manager_id = (SELECT id FROM public.users WHERE phone = '09180000010')
WHERE phone IN ('09180000001','09180000002');

-- Link RSM to Exec (Rina -> Mat)
UPDATE public.users
SET manager_id = (SELECT id FROM public.users WHERE phone = '09180000099')
WHERE phone = '09180000010';

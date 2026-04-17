-- Sprint A Phase 3 — realistic test data to make scorecards show values.
-- Run AFTER sprint-a-phase3-lifecycle.sql.
-- Idempotent-ish: UPDATE is safe to re-run; INSERTs will create duplicates if re-run, so only run once.
-- NOTE: our visits table does NOT have an "outcome" column — we use order_taken (boolean).

-- 1. Sprinkle realistic monthly data on existing assigned stores
UPDATE public.stores SET
  mtd_volume_mt        = (random() * 40 + 10)::numeric(10,2),
  prev_month_volume_mt = (random() * 35 + 5)::numeric(10,2),
  share_of_stomach     = (random() * 60 + 20)::numeric(5,2),
  last_order_at        = now() - (random() * interval '30 days'),
  risk_status = CASE
    WHEN random() < 0.7 THEN 'healthy'
    WHEN random() < 0.9 THEN 'at_risk'
    ELSE 'lost'
  END
WHERE assigned_tsr IN (
  SELECT id FROM public.users WHERE role IN ('tsr','champion')
);

-- 2. Create 2 prospect stores per TSR (only if none exist yet for them)
INSERT INTO public.stores
  (name, owner_name, phone, store_type, city, province,
   vol_class, store_status, prospect_stage,
   assigned_tsr, created_by)
SELECT
  'Prospect POS ' || substr(md5(random()::text), 1, 6),
  'Owner ' || u.phone,
  '0918' || lpad((random()*10000000)::int::text, 7, '0'),
  'feeds_dealer', 'Manila', 'Metro Manila',
  'B', 'prospect', 'identified',
  u.id, u.id
FROM public.users u
CROSS JOIN generate_series(1, 2)
WHERE u.role = 'tsr'
  AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.assigned_tsr = u.id AND s.store_status = 'prospect'
  );

-- 3. Seed visits this month for retention calculation (~70% of active stores)
INSERT INTO public.visits
  (store_id, tsr_id, visit_type, visited_at, order_taken, order_amount)
SELECT
  s.id,
  s.assigned_tsr,
  CASE (random()*3)::int
    WHEN 0 THEN 'order'
    WHEN 1 THEN 'regular'
    ELSE 'regular'
  END,
  now() - (random() * interval '15 days'),
  random() < 0.5,
  (random() * 100000)::numeric(10,2)
FROM public.stores s
WHERE s.assigned_tsr IS NOT NULL
  AND s.store_status = 'active'
  AND random() < 0.7;

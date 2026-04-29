-- Windel DSM demo team — 3 TSRs, ~10 active stores + prospects each, sample visits.
-- Target DSM: phone 09180000041 (WINDEL OLIVA). Safe to re-run: wipes prior rows tagged segment = 'windel_demo_v1'.
-- Run in Supabase SQL Editor after sprint-a-hierarchy + sprint-a-phase3-lifecycle.
-- PIN for demo TSR logins: 1234 (same as other test accounts).

DO $$
DECLARE
  wid   uuid;
  reg   text;
  dist  text;
  t1    uuid;
  t2    uuid;
  t3    uuid;
  cities text[] := ARRAY[
    'Dalaguete', 'Argao', 'Sibonga', 'Carcar', 'San Fernando',
    'Naga', 'Talisay', 'Toledo', 'Pinamungajan', 'Balamban'
  ];
  i     int;
  sid   uuid;
  tsrs  uuid[];
  tsr_phones text[] := ARRAY['09180101001','09180101002','09180101003'];
BEGIN
  SELECT id, region, district
    INTO wid, reg, dist
  FROM public.users
  WHERE phone = '09180000041'
  LIMIT 1;

  IF wid IS NULL THEN
    RAISE NOTICE 'seed_windel_demo_team: user 09180000041 not found — insert Windel first; skipping.';
    RETURN;
  END IF;

  INSERT INTO public.users (phone, pin_hash, name, role, region, district, territory, manager_id, is_active)
  VALUES
    ('09180101001', '1234', 'Demo TSR Alpha', 'tsr', COALESCE(reg, 'Visayas'), COALESCE(dist, 'CEBU-SOUTH'), 'Oliva Cluster A', wid, true),
    ('09180101002', '1234', 'Demo TSR Beta', 'tsr', COALESCE(reg, 'Visayas'), COALESCE(dist, 'CEBU-SOUTH'), 'Oliva Cluster B', wid, true),
    ('09180101003', '1234', 'Demo TSR Gamma', 'tsr', COALESCE(reg, 'Visayas'), COALESCE(dist, 'CEBU-SOUTH'), 'Oliva Cluster C', wid, true)
  ON CONFLICT (phone) DO UPDATE SET
    manager_id = EXCLUDED.manager_id,
    name       = EXCLUDED.name,
    role       = 'tsr',
    territory  = EXCLUDED.territory,
    region     = COALESCE(EXCLUDED.region, public.users.region),
    district   = COALESCE(EXCLUDED.district, public.users.district),
    is_active  = true;

  SELECT id INTO t1 FROM public.users WHERE phone = '09180101001';
  SELECT id INTO t2 FROM public.users WHERE phone = '09180101002';
  SELECT id INTO t3 FROM public.users WHERE phone = '09180101003';
  tsrs := ARRAY[t1, t2, t3];

  DELETE FROM public.visits
  WHERE store_id IN (SELECT id FROM public.stores WHERE segment = 'windel_demo_v1');

  DELETE FROM public.stores WHERE segment = 'windel_demo_v1';

  -- Active stores: 10 per TSR (30 total), varied health + lifecycle fields.
  FOR i IN 1..30 LOOP
    INSERT INTO public.stores (
      name,
      owner_name,
      phone,
      city,
      province,
      region,
      store_type,
      vol_class,
      health_status,
      bags_per_month,
      last_visit_at,
      assigned_tsr,
      created_by,
      segment,
      store_status,
      prospect_stage,
      mtd_volume_mt,
      prev_month_volume_mt,
      ytd_volume_mt,
      share_of_stomach,
      last_order_at,
      risk_status
    )
    VALUES (
      '[WINDEL-DEMO] Feed Dealer ' || chr(64 + ((i - 1) % 26) + 1) || '-' || lpad(i::text, 2, '0'),
      'Owner ' || lpad((9000000 + i)::text, 7, '0'),
      '0918' || lpad((1000000 + i)::text, 7, '0'),
      cities[((i - 1) % 10) + 1],
      'Cebu',
      COALESCE(reg, 'Visayas'),
      'feeds_dealer',
      CASE (i % 3) WHEN 0 THEN 'A' WHEN 1 THEN 'B' ELSE 'C' END,
      CASE (i % 5) WHEN 0 THEN 'crit' WHEN 1 THEN 'warn' ELSE 'ok' END,
      (20 + (i % 15) * 3),
      now() - ((i % 12)::text || ' days')::interval,
      tsrs[((i - 1) / 10) + 1],
      tsrs[((i - 1) / 10) + 1],
      'windel_demo_v1',
      'active',
      NULL,
      (15 + (i % 20))::numeric(10,2),
      (12 + (i % 18))::numeric(10,2),
      ((15 + (i % 20)) * (8 + (i % 5)))::numeric(10,2),
      (25 + (i % 55))::numeric(5,2),
      now() - ((i % 20)::text || ' days')::interval,
      CASE (i % 7) WHEN 0 THEN 'at_risk' WHEN 1 THEN 'lost' ELSE 'healthy' END
    );
  END LOOP;

  -- Prospects: 4 per TSR (12 total), stages spread across the funnel.
  FOR i IN 1..12 LOOP
    INSERT INTO public.stores (
      name,
      owner_name,
      phone,
      city,
      province,
      region,
      store_type,
      vol_class,
      health_status,
      assigned_tsr,
      created_by,
      segment,
      store_status,
      prospect_stage,
      mtd_volume_mt,
      risk_status
    )
    VALUES (
      '[WINDEL-DEMO] Prospect ' || CASE i % 4 WHEN 0 THEN 'identified' WHEN 1 THEN 'contacted' WHEN 2 THEN 'interested' ELSE 'trial' END || ' ' || i::text,
      'Prospect Owner ' || i::text,
      '0919' || lpad((2000000 + i)::text, 7, '0'),
      cities[((i + 3) % 10) + 1],
      'Cebu',
      COALESCE(reg, 'Visayas'),
      'feeds_dealer',
      'B',
      'ok',
      tsrs[((i - 1) / 4) + 1],
      tsrs[((i - 1) / 4) + 1],
      'windel_demo_v1',
      'prospect',
      CASE i % 4 WHEN 0 THEN 'identified' WHEN 1 THEN 'contacted' WHEN 2 THEN 'interested' ELSE 'trial' END,
      NULL,
      'healthy'
    );
  END LOOP;

  -- Visits this month on active demo stores (≈70% of actives).
  FOR sid IN
    SELECT id FROM public.stores
    WHERE segment = 'windel_demo_v1' AND store_status = 'active'
    ORDER BY random()
    LIMIT 21
  LOOP
    INSERT INTO public.visits (
      store_id,
      tsr_id,
      visit_type,
      visited_at,
      order_taken,
      order_amount,
      notes
    )
    SELECT
      sid,
      s.assigned_tsr,
      CASE (random() * 3)::int WHEN 0 THEN 'order'::text WHEN 1 THEN 'regular'::text ELSE 'merch'::text END,
      now() - (random() * interval '14 days'),
      random() < 0.45,
      (random() * 85000 + 5000)::numeric(12,2),
      'WINDEL-DEMO:v1'
    FROM public.stores s
    WHERE s.id = sid;
  END LOOP;

  RAISE NOTICE 'seed_windel_demo_team: OK — demo TSR phones: %, ~30 active + 12 prospects, visits seeded.', array_to_string(tsr_phones, ', ');
END $$;

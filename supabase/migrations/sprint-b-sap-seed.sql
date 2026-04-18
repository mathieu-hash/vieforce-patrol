-- ============================================================
-- Sprint B — SAP accounts test seed
-- Populates sap_accounts with a handful of rows across regions
-- so the matcher + map can be exercised without the full SAP sync.
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- Run AFTER sprint-b-patrol-hub.sql.
-- ============================================================

INSERT INTO public.sap_accounts (cardcode, cardname, region, district, address, lat, lng, bu, slp_code, slp_name) VALUES
  ('CA-001', 'Metro Feeds Corp.',       'Luzon',    'MM-NORTH',    'Quezon City, Metro Manila',   14.6760, 121.0437, 'COMMERCIAL', 'SLP-01', 'Santos, A.'),
  ('CA-002', 'Rizal Farm Supply',       'Luzon',    'MM-NORTH',    'Antipolo, Rizal',             14.6255, 121.1245, 'COMMERCIAL', 'SLP-01', 'Santos, A.'),
  ('CA-003', 'Nueva Feeds Malabon',     'Luzon',    'MM-NORTH',    'Malabon, Metro Manila',       14.6619, 120.9566, 'COMMERCIAL', 'SLP-02', 'Dela Cruz, R.'),
  ('CA-010', 'Bulacan Agrivet Center',  'Luzon',    'BULACAN',     'Malolos, Bulacan',            14.8436, 120.8111, 'COMMERCIAL', 'SLP-03', 'Reyes, M.'),
  ('CA-015', 'Cebu Agri Partners',      'Visayas',  'CEBU-NORTH',  'Cebu City, Cebu',             10.3157, 123.8854, 'COMMERCIAL', 'SLP-10', 'Tan, L.'),
  ('CA-016', 'Iloilo Feeds Trading',    'Visayas',  'ILOILO',      'Iloilo City, Iloilo',         10.7202, 122.5621, 'COMMERCIAL', 'SLP-11', 'Gonzales, B.'),
  ('CA-023', 'Davao Livestock Inc.',    'Mindanao', 'DAVAO',       'Davao City, Davao del Sur',    7.1907, 125.4553, 'COMMERCIAL', 'SLP-20', 'Abante, J.'),
  ('CA-024', 'Cagayan Feed Depot',      'Mindanao', 'MISAMIS-OR',  'Cagayan de Oro, Misamis Or.',  8.4542, 124.6319, 'COMMERCIAL', 'SLP-21', 'Fernandez, K.')
ON CONFLICT (cardcode) DO NOTHING;

-- Verify:
--   SELECT count(*) FROM public.sap_accounts WHERE cardcode LIKE 'CA-%';
--   -- Expect 8 rows.

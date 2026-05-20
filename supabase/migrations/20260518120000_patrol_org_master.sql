-- Patrol org master: Region / District (SAP-synced) + Territory (Patrol-only routes)
-- Access via Vercel /api/admin/org* using service role (no anon RLS policies).

CREATE TABLE IF NOT EXISTS public.patrol_org_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sap_region_code text,
  source text NOT NULL DEFAULT 'patrol' CHECK (source IN ('sap', 'patrol')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patrol_org_regions_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.patrol_org_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.patrol_org_regions(id) ON DELETE CASCADE,
  name text NOT NULL,
  sap_district_code integer,
  sap_district_label text,
  source text NOT NULL DEFAULT 'patrol' CHECK (source IN ('sap', 'patrol')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patrol_org_districts_region_name_unique UNIQUE (region_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS patrol_org_districts_sap_code_unique
  ON public.patrol_org_districts (sap_district_code)
  WHERE sap_district_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.patrol_org_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES public.patrol_org_districts(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patrol_org_territories_district_name_unique UNIQUE (district_id, name)
);

CREATE INDEX IF NOT EXISTS patrol_org_districts_region_id_idx ON public.patrol_org_districts(region_id);
CREATE INDEX IF NOT EXISTS patrol_org_territories_district_id_idx ON public.patrol_org_territories(district_id);

ALTER TABLE public.patrol_org_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_org_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_org_territories ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.patrol_org_regions IS 'Patrol geography — regions (SAP + optional Patrol labels)';
COMMENT ON TABLE public.patrol_org_districts IS 'Patrol geography — districts keyed to SAP U_districtName when synced';
COMMENT ON TABLE public.patrol_org_territories IS 'Patrol-only sub-routes under a district (optional TSR territory label)';

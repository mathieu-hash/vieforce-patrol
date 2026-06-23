-- 20260623120000_marketing_request_module.sql
--
-- Marketing Request module (Functional Spec v1.1).
-- Chatbot intake -> 3-level approval (RSM -> Marketing -> EVP) -> transactional
-- email -> back-office dashboard.
--
-- Design notes:
--   * Self-contained. Does NOT alter public.users (avoids the role-CHECK / OAuth
--     email-storage mismatch). Approver routing is EMAIL-based, driven by
--     marketing_config (admin-editable -> re-route without a code change, per
--     spec 4.2 / 6.5). DSM identity is snapshotted onto each request at submit.
--   * The /api/marketing serverless handler (service role) is the single
--     read/write path and enforces approver authorization in JS (the codebase
--     pattern: server-side scope guards + service role). RLS below is a
--     defense-in-depth backstop, not the primary gate.
--   * email_log records every notification; if no RESEND_API_KEY is configured
--     the handler marks rows status='deferred' so the audit trail is intact
--     even before email sending is switched on.

-- 1. Human-readable request number: MR-<year>-<5-digit seq>  (e.g. MR-2026-00001)
CREATE SEQUENCE IF NOT EXISTS public.marketing_request_seq START 1;

-- 2. marketing_requests — one row per individual request (a session can yield many)
CREATE TABLE IF NOT EXISTS public.marketing_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number       TEXT NOT NULL UNIQUE
                       DEFAULT ('MR-' || extract(year FROM now())::text
                                || '-' || lpad(nextval('public.marketing_request_seq')::text, 5, '0')),
  session_id           TEXT,                                  -- groups rows from one chatbot session
  -- DSM identity snapshot (DSM is a Google-OAuth manager; id may not sit in public.users)
  dsm_user_id          UUID,                                  -- auth.uid() when available
  dsm_name             TEXT NOT NULL,
  dsm_email            TEXT,
  dsm_region           TEXT,                                  -- drives RSM routing at submit
  -- Opening answers (spec 2.2)
  distributor_name     TEXT,
  distributor_contact  TEXT,
  distributor_location TEXT,                                  -- province
  delivery_method      TEXT CHECK (delivery_method IN ('pick_up','thru_customer')),
  -- The request itself
  request_type         TEXT NOT NULL CHECK (request_type IN
                         ('signages','store_dress_up','seminar','vet_mission',
                          'vet_products','feed_sampling','special_request')),
  request_details      JSONB NOT NULL DEFAULT '{}'::jsonb,    -- type-specific Q&A
  other_instructions   TEXT,
  photo_url            TEXT,                                  -- optional (spec: optional for all types)
  -- Workflow
  status               TEXT NOT NULL DEFAULT 'submitted'
                       CHECK (status IN ('submitted','rsm_review','marketing_review',
                                         'evp_review','approved','rejected')),
  rejection_reason     TEXT,
  rejected_by_level    TEXT CHECK (rejected_by_level IN ('rsm','marketing','evp')),
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mktreq_status     ON public.marketing_requests(status);
CREATE INDEX IF NOT EXISTS idx_mktreq_dsm        ON public.marketing_requests(dsm_user_id);
CREATE INDEX IF NOT EXISTS idx_mktreq_type       ON public.marketing_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_mktreq_submitted  ON public.marketing_requests(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_mktreq_session    ON public.marketing_requests(session_id);

-- 3. approval_log — one row per approve/reject action (immutable audit trail)
CREATE TABLE IF NOT EXISTS public.approval_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES public.marketing_requests(id) ON DELETE CASCADE,
  approver_id   UUID,                                       -- auth.uid() when available
  approver_name TEXT NOT NULL,
  approver_email TEXT,
  approver_level TEXT NOT NULL CHECK (approver_level IN ('rsm','marketing','evp')),
  action        TEXT NOT NULL CHECK (action IN ('approved','rejected')),
  comments      TEXT,
  actioned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approvallog_request ON public.approval_log(request_id);
CREATE INDEX IF NOT EXISTS idx_approvallog_at      ON public.approval_log(actioned_at DESC);

-- 4. email_log — audit trail of every system-generated email
CREATE TABLE IF NOT EXISTS public.email_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID REFERENCES public.marketing_requests(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,   -- submitted|rsm_approved|mktg_approved|evp_approved|rejected|escalation_reminder
  to_email      TEXT NOT NULL,
  cc_email      TEXT,
  subject       TEXT,
  status        TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','deferred')),
  error         TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emaillog_request ON public.email_log(request_id);
CREATE INDEX IF NOT EXISTS idx_emaillog_status  ON public.email_log(status);

-- 5. marketing_config — admin-editable routing (no code change to re-route)
--    Global keys:  marketing_email, evp_email, escalation_hours
--    Per-region:   config_key='rsm_email', region='<region name>', config_value='<rsm email>'
CREATE TABLE IF NOT EXISTS public.marketing_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   TEXT NOT NULL,
  region       TEXT,                 -- NULL for global keys
  config_value TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (config_key, region)
);

-- 6. Seed defaults (spec 4.2): Marketing inbox + EVP + 24h escalation
INSERT INTO public.marketing_config (config_key, region, config_value)
VALUES
  ('marketing_email', NULL, 'aileen.guerrero@vienovo.ph'),
  ('evp_email',       NULL, 'joel.durano@vienovo.ph'),
  ('escalation_hours', NULL, '24')
ON CONFLICT (config_key, region) DO NOTHING;
-- RSM-per-region rows are added by the Admin via the back-office config panel.

-- 7. Row Level Security (defense-in-depth; service-role handler is primary gate)
ALTER TABLE public.marketing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_config  ENABLE ROW LEVEL SECURITY;

-- DSM can read their own submitted requests directly (everything else goes
-- through the /api/marketing handler, which enforces approver scope server-side).
CREATE POLICY mktreq_dsm_read_own ON public.marketing_requests
  FOR SELECT TO authenticated USING (dsm_user_id = auth.uid());

-- Approver dashboard reads go through the handler (service role). Approver-level
-- visibility is enforced in JS (email -> level via marketing_config), so no
-- broad client SELECT policy is granted here.

-- approval_log: authenticated read (audit transparency). No client writes.
CREATE POLICY approvallog_authenticated_read ON public.approval_log
  FOR SELECT TO authenticated USING (true);

-- email_log: service-role only (contains email addresses). No client policy.
-- marketing_config: authenticated read (dashboard renders current routing);
--   writes via handler only.
CREATE POLICY mktconfig_authenticated_read ON public.marketing_config
  FOR SELECT TO authenticated USING (true);

-- 20260525120000_admin_audit_log.sql
--
-- Durable audit log for admin actions (pin resets, future: role changes,
-- store assignments, deactivations). Vercel logs roll over in ~24h, this
-- table is the source of truth for security review and incident response.
--
-- Writes are service-role only (no INSERT policy granted to authenticated
-- or anon). Reads are open to authenticated for the admin UI; downstream
-- views can scope further.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_user_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_log_authenticated_select ON public.admin_audit_log
  FOR SELECT TO authenticated USING (true);
-- Writes go through service-role only; no anon, no authenticated INSERT policy needed.

CREATE INDEX idx_admin_audit_log_actor ON public.admin_audit_log(actor_user_id);
CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);

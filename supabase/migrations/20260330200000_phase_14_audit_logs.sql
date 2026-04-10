-- Phase 5: Audit log table for tracking all important system actions
-- Tracks GRN changes, user management actions, and system events

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,           -- 'grn', 'user', 'product', 'invoice', 'system'
  entity_id   TEXT,                    -- ID of the affected record
  action      TEXT NOT NULL,           -- 'created', 'updated', 'status_changed', 'approved', etc.
  old_value   JSONB,                   -- previous state (optional)
  new_value   JSONB,                   -- new state (optional)
  performed_by UUID,                   -- user who performed the action (FK to auth.users)
  metadata    JSONB,                   -- extra context (e.g. GRN number, user email)
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for fast entity lookups (e.g. show all logs for a specific GRN)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id);

-- Index for user activity lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by
  ON public.audit_logs (performed_by);

-- Index for time-based queries (recent activity)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

-- RLS: allow authenticated users to insert, but only admin+ can read all
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert audit logs
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Any authenticated user can read audit logs
-- (fine-grained filtering is done at the application level)
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (true);

-- Auto-log GRN status changes via DB trigger (belt + suspenders with frontend logging)
CREATE OR REPLACE FUNCTION public.log_grn_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_logs (
      entity_type, entity_id, action,
      old_value, new_value,
      performed_by, metadata
    ) VALUES (
      'grn',
      NEW.id::TEXT,
      CASE
        WHEN NEW.status = 'approved' THEN 'approved'
        WHEN NEW.status = 'rejected' THEN 'rejected'
        ELSE 'status_changed'
      END,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      COALESCE(NEW.created_by, auth.uid()),
      jsonb_build_object('grn_no', COALESCE(NEW.grn_no, ''))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_grn_status ON public.receiving_headers;

CREATE TRIGGER trg_audit_grn_status
  AFTER UPDATE ON public.receiving_headers
  FOR EACH ROW
  EXECUTE FUNCTION public.log_grn_status_change();

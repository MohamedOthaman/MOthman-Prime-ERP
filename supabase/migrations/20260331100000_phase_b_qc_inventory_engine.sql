-- Phase B: QC module + inventory engine hardening

ALTER TABLE public.receiving_headers
  ADD COLUMN IF NOT EXISTS municipality_reference_no TEXT,
  ADD COLUMN IF NOT EXISTS municipality_notes TEXT,
  ADD COLUMN IF NOT EXISTS municipality_submitted_by UUID,
  ADD COLUMN IF NOT EXISTS municipality_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID;

ALTER TABLE public.receiving_lines
  ADD COLUMN IF NOT EXISTS qc_status TEXT,
  ADD COLUMN IF NOT EXISTS qc_reason TEXT,
  ADD COLUMN IF NOT EXISTS qc_notes TEXT,
  ADD COLUMN IF NOT EXISTS qc_checked_quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS qc_inspected_by UUID,
  ADD COLUMN IF NOT EXISTS qc_inspected_at TIMESTAMPTZ;

UPDATE public.receiving_lines AS line
SET
  qc_status = 'pass',
  qc_checked_quantity = COALESCE(line.received_quantity, line.quantity, line.qty, 0)
FROM public.receiving_headers AS header
WHERE header.id = line.header_id
  AND header.status = 'approved'
  AND COALESCE(NULLIF(BTRIM(line.qc_status), ''), '') = '';

UPDATE public.receiving_lines
SET qc_status = 'pending'
WHERE COALESCE(NULLIF(BTRIM(qc_status), ''), '') = '';

ALTER TABLE public.receiving_lines
  ALTER COLUMN qc_status SET DEFAULT 'pending',
  ALTER COLUMN qc_status SET NOT NULL;

ALTER TABLE public.receiving_lines
  DROP CONSTRAINT IF EXISTS receiving_lines_qc_status_check;

ALTER TABLE public.receiving_lines
  ADD CONSTRAINT receiving_lines_qc_status_check
  CHECK (qc_status IN ('pending', 'pass', 'reject', 'hold'));

CREATE INDEX IF NOT EXISTS idx_receiving_lines_header_qc_status
  ON public.receiving_lines (header_id, qc_status);

CREATE OR REPLACE FUNCTION public.enforce_receiving_qc_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_line_count INTEGER := 0;
  v_pending_count INTEGER := 0;
  v_hold_count INTEGER := 0;
  v_pass_count INTEGER := 0;
BEGIN
  IF TG_OP <> 'UPDATE' OR COALESCE(OLD.status, '') = COALESCE(NEW.status, '') THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE COALESCE(line.received_quantity, line.quantity, line.qty, 0) > 0),
    COUNT(*) FILTER (
      WHERE COALESCE(line.received_quantity, line.quantity, line.qty, 0) > 0
        AND COALESCE(NULLIF(BTRIM(line.qc_status), ''), 'pending') = 'pending'
    ),
    COUNT(*) FILTER (
      WHERE COALESCE(line.received_quantity, line.quantity, line.qty, 0) > 0
        AND COALESCE(NULLIF(BTRIM(line.qc_status), ''), 'pending') = 'hold'
    ),
    COUNT(*) FILTER (
      WHERE COALESCE(line.received_quantity, line.quantity, line.qty, 0) > 0
        AND COALESCE(NULLIF(BTRIM(line.qc_status), ''), 'pending') = 'pass'
    )
  INTO
    v_active_line_count,
    v_pending_count,
    v_hold_count,
    v_pass_count
  FROM public.receiving_lines AS line
  WHERE line.header_id = NEW.id;

  IF NEW.status = 'inspected' THEN
    IF v_active_line_count = 0 THEN
      RAISE EXCEPTION 'QC cannot be completed without active receiving lines.';
    END IF;

    IF v_pending_count > 0 THEN
      RAISE EXCEPTION 'QC is incomplete. All active receiving lines must be reviewed before marking the GRN as inspected.';
    END IF;

    NEW.inspected_at = COALESCE(NEW.inspected_at, now());
    NEW.inspected_by = COALESCE(NEW.inspected_by, auth.uid(), NEW.inspected_by);
  END IF;

  IF NEW.status IN ('municipality_pending', 'approved') THEN
    IF v_active_line_count = 0 THEN
      RAISE EXCEPTION 'GRN workflow cannot continue without active receiving lines.';
    END IF;

    IF v_pending_count > 0 THEN
      RAISE EXCEPTION 'Pending QC lines must be resolved before municipality submission or approval.';
    END IF;

    IF v_hold_count > 0 THEN
      RAISE EXCEPTION 'Held QC lines must be resolved before municipality submission or approval.';
    END IF;

    IF v_pass_count = 0 THEN
      RAISE EXCEPTION 'At least one QC-passed line is required before municipality submission or approval.';
    END IF;
  END IF;

  IF NEW.status = 'municipality_pending' THEN
    NEW.municipality_submitted_at = COALESCE(NEW.municipality_submitted_at, now());
    NEW.municipality_submitted_by = COALESCE(NEW.municipality_submitted_by, auth.uid(), NEW.municipality_submitted_by);
  END IF;

  IF NEW.status = 'approved' THEN
    IF COALESCE(NULLIF(BTRIM(NEW.municipality_reference_no), ''), '') = '' THEN
      RAISE EXCEPTION 'Municipality reference no is required before approval.';
    END IF;

    NEW.municipality_approved_at = COALESCE(NEW.municipality_approved_at, now());
    NEW.municipality_approved_by = COALESCE(NEW.municipality_approved_by, auth.uid(), NEW.municipality_approved_by);
    NEW.approved_at = COALESCE(NEW.approved_at, now());
    NEW.approved_by = COALESCE(NEW.approved_by, auth.uid(), NEW.approved_by);
  END IF;

  IF NEW.status = 'rejected' AND COALESCE(OLD.status, '') <> 'rejected' THEN
    NEW.rejected_at = COALESCE(NEW.rejected_at, now());
    NEW.rejected_by = COALESCE(NEW.rejected_by, auth.uid(), NEW.rejected_by);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_receiving_qc_workflow ON public.receiving_headers;

CREATE TRIGGER trg_enforce_receiving_qc_workflow
  BEFORE UPDATE ON public.receiving_headers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_receiving_qc_workflow();

CREATE OR REPLACE FUNCTION public.create_receiving_inventory_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
    INSERT INTO public.inventory_transactions (
      type,
      reference_type,
      reference_id,
      reference_line_id,
      product_id,
      quantity,
      batch_no,
      expiry_date,
      production_date,
      created_at
    )
    SELECT
      'IN',
      'GRN',
      NEW.id,
      line.id,
      line.product_id,
      COALESCE(line.received_quantity, line.quantity, line.qty, 0),
      NULLIF(BTRIM(line.batch_no), ''),
      line.expiry_date,
      line.production_date,
      COALESCE(NEW.approved_at, now())
    FROM public.receiving_lines AS line
    WHERE line.header_id = NEW.id
      AND line.product_id IS NOT NULL
      AND COALESCE(line.received_quantity, line.quantity, line.qty, 0) > 0
      AND COALESCE(NULLIF(BTRIM(line.qc_status), ''), 'pending') = 'pass'
    ON CONFLICT (reference_type, reference_id, reference_line_id, type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

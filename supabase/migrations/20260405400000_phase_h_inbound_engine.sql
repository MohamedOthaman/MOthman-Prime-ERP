-- ═══════════════════════════════════════════════════════════════════
-- Phase H: Inbound Receiving Engine
-- Real inventory_batches + inventory_movements creation from approved GRNs
-- Applied: 2026-04-05
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. Fix grn_lines.qc_status constraint
--    Live has 'passed'/'rejected' but service code uses 'pass'/'reject'
--    Normalise data then tighten constraint to 'pending/pass/reject/hold'
-- ───────────────────────────────────────────────────────────────────

UPDATE public.grn_lines SET qc_status = 'pass'   WHERE qc_status = 'passed';
UPDATE public.grn_lines SET qc_status = 'reject'  WHERE qc_status = 'rejected';

ALTER TABLE public.grn_lines
  DROP CONSTRAINT IF EXISTS grn_lines_qc_status_check;

ALTER TABLE public.grn_lines
  ADD CONSTRAINT grn_lines_qc_status_check
  CHECK (qc_status IN ('pending','pass','reject','hold'));

-- ───────────────────────────────────────────────────────────────────
-- 2. Extend grn_headers: completed + partial_hold statuses
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.grn_headers
  DROP CONSTRAINT IF EXISTS grn_headers_status_check;

ALTER TABLE public.grn_headers
  ADD CONSTRAINT grn_headers_status_check
  CHECK (status IN (
    'draft','received','inspected',
    'municipality_pending','approved',
    'partial_hold','completed','rejected'
  ));

ALTER TABLE public.grn_headers
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by   UUID REFERENCES auth.users(id);

-- ───────────────────────────────────────────────────────────────────
-- 3. grn_lines discrepancy + putaway fields
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.grn_lines
  ADD COLUMN IF NOT EXISTS qty_damaged             NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (qty_damaged  >= 0),
  ADD COLUMN IF NOT EXISTS qty_missing             NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (qty_missing  >= 0),
  ADD COLUMN IF NOT EXISTS qty_sample              NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (qty_sample   >= 0),
  ADD COLUMN IF NOT EXISTS qty_accepted            NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS putaway_warehouse_id    UUID,
  ADD COLUMN IF NOT EXISTS putaway_zone_id         UUID,
  ADD COLUMN IF NOT EXISTS putaway_location_ref    TEXT;

-- ───────────────────────────────────────────────────────────────────
-- 4. inventory_batches: add putaway + production_date fields
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS warehouse_id    UUID,
  ADD COLUMN IF NOT EXISTS zone_id         UUID,
  ADD COLUMN IF NOT EXISTS location_ref    TEXT,
  ADD COLUMN IF NOT EXISTS production_date DATE;

-- ───────────────────────────────────────────────────────────────────
-- 5. Rebuild receiving_lines VIEW with new columns
--    Drops and recreates the view + all INSTEAD OF triggers
-- ───────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.receiving_lines CASCADE;

CREATE VIEW public.receiving_lines AS
SELECT
  id,
  grn_id                  AS header_id,
  line_no,
  product_id,
  batch_no,
  expiry_date,
  production_date,
  qty_ordered             AS quantity,
  qty_received            AS received_quantity,
  unit_cost,
  qc_status,
  qc_reason,
  qc_notes,
  qc_checked_quantity,
  qc_inspected_by,
  qc_inspected_at,
  notes,
  qty_damaged,
  qty_missing,
  qty_sample,
  qty_accepted,
  putaway_warehouse_id,
  putaway_zone_id,
  putaway_location_ref,
  created_at
FROM public.grn_lines;

-- INSTEAD OF INSERT
CREATE OR REPLACE FUNCTION public.fn_receiving_lines_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.grn_lines (
    grn_id, line_no, product_id, batch_no, expiry_date,
    production_date, qty_ordered, qty_received, unit_cost,
    qc_status, qc_reason, qc_notes, qc_checked_quantity,
    qc_inspected_by, qc_inspected_at, notes,
    qty_damaged, qty_missing, qty_sample, qty_accepted,
    putaway_warehouse_id, putaway_zone_id, putaway_location_ref
  ) VALUES (
    NEW.header_id,
    NEW.line_no,
    NEW.product_id,
    NEW.batch_no,
    NEW.expiry_date,
    NEW.production_date,
    COALESCE(NEW.quantity,      0),
    COALESCE(NEW.received_quantity, 0),
    COALESCE(NEW.unit_cost,     0),
    COALESCE(NEW.qc_status,     'pending'),
    NEW.qc_reason,
    NEW.qc_notes,
    NEW.qc_checked_quantity,
    NEW.qc_inspected_by,
    NEW.qc_inspected_at,
    NEW.notes,
    COALESCE(NEW.qty_damaged,   0),
    COALESCE(NEW.qty_missing,   0),
    COALESCE(NEW.qty_sample,    0),
    NEW.qty_accepted,
    NEW.putaway_warehouse_id,
    NEW.putaway_zone_id,
    NEW.putaway_location_ref
  ) RETURNING id INTO v_id;
  NEW.id := v_id;
  RETURN NEW;
END;$$;

CREATE OR REPLACE TRIGGER trg_receiving_lines_insert
INSTEAD OF INSERT ON public.receiving_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_receiving_lines_insert();

-- INSTEAD OF UPDATE
CREATE OR REPLACE FUNCTION public.fn_receiving_lines_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.grn_lines SET
    grn_id                  = COALESCE(NEW.header_id,          OLD.header_id),
    line_no                 = COALESCE(NEW.line_no,            OLD.line_no),
    product_id              = COALESCE(NEW.product_id,         OLD.product_id),
    batch_no                = NEW.batch_no,
    expiry_date             = NEW.expiry_date,
    production_date         = NEW.production_date,
    qty_ordered             = COALESCE(NEW.quantity,           OLD.quantity),
    qty_received            = COALESCE(NEW.received_quantity,  OLD.received_quantity),
    unit_cost               = COALESCE(NEW.unit_cost,          OLD.unit_cost),
    qc_status               = COALESCE(NEW.qc_status,          OLD.qc_status),
    qc_reason               = NEW.qc_reason,
    qc_notes                = NEW.qc_notes,
    qc_checked_quantity     = NEW.qc_checked_quantity,
    qc_inspected_by         = NEW.qc_inspected_by,
    qc_inspected_at         = NEW.qc_inspected_at,
    notes                   = NEW.notes,
    qty_damaged             = COALESCE(NEW.qty_damaged,        OLD.qty_damaged),
    qty_missing             = COALESCE(NEW.qty_missing,        OLD.qty_missing),
    qty_sample              = COALESCE(NEW.qty_sample,         OLD.qty_sample),
    qty_accepted            = NEW.qty_accepted,
    putaway_warehouse_id    = NEW.putaway_warehouse_id,
    putaway_zone_id         = NEW.putaway_zone_id,
    putaway_location_ref    = NEW.putaway_location_ref
  WHERE id = OLD.id;
  RETURN NEW;
END;$$;

CREATE OR REPLACE TRIGGER trg_receiving_lines_update
INSTEAD OF UPDATE ON public.receiving_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_receiving_lines_update();

-- INSTEAD OF DELETE
CREATE OR REPLACE FUNCTION public.fn_receiving_lines_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.grn_lines WHERE id = OLD.id;
  RETURN OLD;
END;$$;

CREATE OR REPLACE TRIGGER trg_receiving_lines_delete
INSTEAD OF DELETE ON public.receiving_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_receiving_lines_delete();

-- ───────────────────────────────────────────────────────────────────
-- 6. post_receiving_to_inventory RPC
--    approved GRN → inventory_batches + inventory_movements (INBOUND)
--    One inventory_batch per QC-passed receiving line (clean traceability)
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_receiving_to_inventory(p_grn_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header          record;
  v_line            record;
  v_batch_id        uuid;
  v_qty_in          numeric;
  v_batches_created integer := 0;
  v_lines_skipped   integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_header FROM public.grn_headers WHERE id = p_grn_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'GRN not found', 'code', 'NOT_FOUND');
  END IF;

  IF v_header.status <> 'approved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'GRN must be APPROVED before posting to inventory (current: ' || v_header.status || ')',
      'code',    'RECEIVING_NOT_READY'
    );
  END IF;

  -- Idempotency guard
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE reference_type = 'GRN' AND reference_id = p_grn_id AND movement_type = 'INBOUND'
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'GRN has already been posted to inventory',
      'code',    'RECEIVING_ALREADY_POSTED'
    );
  END IF;

  -- Validate all pass lines have required data before touching any row
  FOR v_line IN
    SELECT * FROM public.grn_lines
    WHERE grn_id = p_grn_id AND qc_status = 'pass' AND qty_received > 0
  LOOP
    IF v_line.batch_no IS NULL OR BTRIM(v_line.batch_no) = '' THEN
      RETURN jsonb_build_object(
        'success',  false,
        'error',    'Line ' || v_line.line_no || ': batch_no is required for inventory posting',
        'code',     'BATCH_DATA_REQUIRED',
        'line_no',  v_line.line_no
      );
    END IF;
    IF v_line.expiry_date IS NULL THEN
      RETURN jsonb_build_object(
        'success',  false,
        'error',    'Line ' || v_line.line_no || ': expiry_date is required for inventory posting',
        'code',     'EXPIRY_REQUIRED',
        'line_no',  v_line.line_no
      );
    END IF;
  END LOOP;

  -- Process each QC-passed line
  FOR v_line IN
    SELECT * FROM public.grn_lines
    WHERE grn_id = p_grn_id AND qc_status = 'pass' AND qty_received > 0
    ORDER BY line_no ASC
  LOOP
    -- Accepted qty: prefer explicit qty_accepted, then qc_checked_quantity, then qty_received
    v_qty_in := COALESCE(
      NULLIF(v_line.qty_accepted,        0),
      NULLIF(v_line.qc_checked_quantity, 0),
      v_line.qty_received
    );
    IF v_qty_in IS NULL OR v_qty_in <= 0 THEN
      v_lines_skipped := v_lines_skipped + 1;
      CONTINUE;
    END IF;

    -- Create inventory batch (one per receiving line for exact traceability)
    INSERT INTO public.inventory_batches (
      product_id,
      batch_no,
      expiry_date,
      production_date,
      received_date,
      qty_received,
      qty_available,
      unit_cost,
      receiving_line_id,
      warehouse_id,
      zone_id,
      location_ref,
      created_by
    ) VALUES (
      v_line.product_id,
      v_line.batch_no,
      v_line.expiry_date,
      v_line.production_date,
      COALESCE(v_header.received_date, CURRENT_DATE),
      v_qty_in,
      v_qty_in,
      NULLIF(v_line.unit_cost, 0),
      v_line.id,
      v_line.putaway_warehouse_id,
      v_line.putaway_zone_id,
      v_line.putaway_location_ref,
      auth.uid()
    ) RETURNING id INTO v_batch_id;

    -- Create INBOUND inventory movement (audit trail)
    INSERT INTO public.inventory_movements (
      product_id,
      movement_type,
      reference_type,
      reference_id,
      reference_line_id,
      batch_id,
      batch_no,
      expiry_date,
      warehouse_id,
      zone_id,
      location_ref,
      qty_in,
      qty_out,
      balance_after,
      unit_cost,
      performed_by,
      notes
    ) VALUES (
      v_line.product_id,
      'INBOUND',
      'GRN',
      p_grn_id,
      v_line.id,
      v_batch_id,
      v_line.batch_no,
      v_line.expiry_date,
      v_line.putaway_warehouse_id,
      v_line.putaway_zone_id,
      v_line.putaway_location_ref,
      v_qty_in,
      0,
      v_qty_in,                   -- balance_after = v_qty_in for a new batch
      NULLIF(v_line.unit_cost, 0),
      auth.uid(),
      'Inbound from GRN ' || v_header.grn_no
    );

    v_batches_created := v_batches_created + 1;
  END LOOP;

  IF v_batches_created = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'No QC-passed lines with positive received quantity found',
      'code',    'QC_DATA_MISSING'
    );
  END IF;

  -- Mark GRN as completed
  UPDATE public.grn_headers
  SET
    status       = 'completed',
    completed_at = now(),
    completed_by = auth.uid()
  WHERE id = p_grn_id;

  RETURN jsonb_build_object(
    'success',          true,
    'status',           'completed',
    'batches_created',  v_batches_created,
    'lines_skipped',    v_lines_skipped
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 7. Grants
-- ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.inventory_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventory_movements TO authenticated;

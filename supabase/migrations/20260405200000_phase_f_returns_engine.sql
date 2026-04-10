-- ═══════════════════════════════════════════════════════════════════
-- Phase F: Returns Engine + Full Outbound Allocation Traceability
-- Applied: 2026-04-05
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. outbound_execution_allocations
--    One row per FEFO batch slice per execution line
--    Source of truth for traceability: GRN → batch → outbound → return
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outbound_execution_allocations (
  id                         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_execution_line_id uuid    NOT NULL REFERENCES public.outbound_execution_lines(id) ON DELETE CASCADE,
  batch_id                   uuid    REFERENCES public.inventory_batches(id),
  movement_id                uuid    REFERENCES public.inventory_movements(id),
  batch_no                   TEXT,
  expiry_date                DATE,
  qty_allocated              NUMERIC(14,3) NOT NULL CHECK (qty_allocated > 0),
  returned_qty               NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oea_exec_line_id ON public.outbound_execution_allocations(outbound_execution_line_id);
CREATE INDEX IF NOT EXISTS idx_oea_batch_id     ON public.outbound_execution_allocations(batch_id);

-- ───────────────────────────────────────────────────────────────────
-- 2. Extend inventory_movements — add condition column for returns
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS condition TEXT CHECK (condition IN ('OK','DMG','EXPIRY'));

-- ───────────────────────────────────────────────────────────────────
-- 3. Extend sales_returns — reviewed + posted lifecycle states
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.sales_returns
  DROP CONSTRAINT IF EXISTS sales_returns_status_check;

ALTER TABLE public.sales_returns
  ADD CONSTRAINT sales_returns_status_check
    CHECK (status IN ('draft','received','reviewed','posted','cancelled'));

ALTER TABLE public.sales_returns
  ADD COLUMN IF NOT EXISTS reviewed_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS posted_by    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_at    TIMESTAMPTZ;

-- ───────────────────────────────────────────────────────────────────
-- 4. Auto-generate return_no: RET-YYYY-NNNN
-- ───────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.return_no_seq START 1;

CREATE OR REPLACE FUNCTION public.set_return_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.return_no IS NULL THEN
    NEW.return_no := 'RET-' || to_char(now(), 'YYYY') || '-' ||
                     lpad(nextval('public.return_no_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_return_no ON public.sales_returns;
CREATE TRIGGER trg_return_no
  BEFORE INSERT ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_return_no();

-- ───────────────────────────────────────────────────────────────────
-- 5. Extend sales_return_lines — allocation link + condition check
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.sales_return_lines
  ADD COLUMN IF NOT EXISTS allocation_id      uuid REFERENCES public.outbound_execution_allocations(id),
  ADD COLUMN IF NOT EXISTS return_movement_id uuid REFERENCES public.inventory_movements(id);

ALTER TABLE public.sales_return_lines
  DROP CONSTRAINT IF EXISTS sales_return_lines_condition_check;

ALTER TABLE public.sales_return_lines
  ADD CONSTRAINT sales_return_lines_condition_check
    CHECK (condition IN ('OK','DMG','EXPIRY'));

-- ───────────────────────────────────────────────────────────────────
-- 6. Rewrite confirm_picking_done — now also inserts allocations
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_picking_done(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header              record;
  v_session             record;
  v_incomplete          record;
  v_exec_line           record;
  v_batch               record;
  v_qty_needed          numeric;
  v_qty_from_batch      numeric;
  v_movement_id         uuid;
  v_first_batch_id      uuid;
  v_first_movement_id   uuid;
  v_first_batch_no      text;
  v_first_expiry_date   date;
  v_total_avail         numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_header FROM public.sales_headers WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF v_header.status <> 'ready' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Invoice must be READY to confirm done (current: ' || v_header.status || ')');
  END IF;

  SELECT * INTO v_session FROM public.outbound_execution_sessions
  WHERE invoice_id = p_invoice_id AND status = 'in_progress';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active picking session');
  END IF;

  SELECT * INTO v_incomplete
  FROM public.outbound_execution_lines
  WHERE session_id = v_session.id AND qty_scanned < qty_required
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not all items scanned.', 'code', 'INCOMPLETE');
  END IF;

  -- Pre-flight stock check
  FOR v_exec_line IN
    SELECT * FROM public.outbound_execution_lines
    WHERE session_id = v_session.id AND qty_scanned > 0
  LOOP
    SELECT COALESCE(SUM(qty_available), 0) INTO v_total_avail
    FROM public.inventory_batches
    WHERE product_id = v_exec_line.product_id AND qty_available > 0;

    IF v_total_avail < v_exec_line.qty_scanned THEN
      RETURN jsonb_build_object(
        'success',    false,
        'error',      'Insufficient stock',
        'code',       'INSUFFICIENT_STOCK',
        'product_id', v_exec_line.product_id,
        'required',   v_exec_line.qty_scanned,
        'available',  v_total_avail
      );
    END IF;
  END LOOP;

  -- FEFO deduction per exec line + allocation records
  FOR v_exec_line IN
    SELECT * FROM public.outbound_execution_lines
    WHERE session_id = v_session.id
    ORDER BY created_at
  LOOP
    v_qty_needed        := v_exec_line.qty_scanned;
    v_first_batch_id    := NULL;
    v_first_movement_id := NULL;
    v_first_batch_no    := NULL;
    v_first_expiry_date := NULL;

    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE product_id = v_exec_line.product_id AND qty_available > 0
      ORDER BY expiry_date ASC NULLS LAST, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_qty_needed <= 0;

      v_qty_from_batch := LEAST(v_batch.qty_available, v_qty_needed);

      UPDATE public.inventory_batches
      SET qty_available = qty_available - v_qty_from_batch
      WHERE id = v_batch.id;

      INSERT INTO public.inventory_movements (
        product_id, movement_type, reference_type, reference_id, reference_line_id,
        batch_id, batch_no, expiry_date,
        qty_in, qty_out, balance_after, unit_cost, performed_by
      ) VALUES (
        v_exec_line.product_id, 'OUTBOUND', 'INVOICE', p_invoice_id, v_exec_line.invoice_line_id,
        v_batch.id, v_batch.batch_no, v_batch.expiry_date,
        0, v_qty_from_batch, v_batch.qty_available - v_qty_from_batch,
        v_batch.unit_cost, auth.uid()
      ) RETURNING id INTO v_movement_id;

      -- Allocation record per batch slice
      INSERT INTO public.outbound_execution_allocations (
        outbound_execution_line_id, batch_id, movement_id,
        batch_no, expiry_date, qty_allocated
      ) VALUES (
        v_exec_line.id, v_batch.id, v_movement_id,
        v_batch.batch_no, v_batch.expiry_date, v_qty_from_batch
      );

      IF v_first_batch_id IS NULL THEN
        v_first_batch_id    := v_batch.id;
        v_first_movement_id := v_movement_id;
        v_first_batch_no    := v_batch.batch_no;
        v_first_expiry_date := v_batch.expiry_date;
      END IF;

      v_qty_needed := v_qty_needed - v_qty_from_batch;
    END LOOP;

    IF v_qty_needed > 0 THEN
      RAISE EXCEPTION 'Concurrent stock change — insufficient stock for product %', v_exec_line.product_id;
    END IF;

    UPDATE public.outbound_execution_lines
    SET qty_confirmed         = qty_scanned,
        confirmed_by          = auth.uid(),
        loaded_at             = now(),
        inventory_batch_id    = v_first_batch_id,
        inventory_movement_id = v_first_movement_id,
        batch_no              = COALESCE(batch_no,    v_first_batch_no),
        expiry_date           = COALESCE(expiry_date, v_first_expiry_date)
    WHERE id = v_exec_line.id;
  END LOOP;

  UPDATE public.outbound_execution_sessions
  SET status = 'completed', confirmed_by = auth.uid(), confirmed_at = now()
  WHERE id = v_session.id;

  UPDATE public.sales_headers
  SET status = 'done', done_at = now(), done_by = auth.uid()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'status', 'done');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 7. receive_sales_return RPC
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.receive_sales_return(p_return_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_return record;
  v_line_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return not found');
  END IF;
  IF v_return.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Return must be in DRAFT to receive (current: ' || v_return.status || ')');
  END IF;

  SELECT COUNT(*) INTO v_line_count
  FROM public.sales_return_lines WHERE return_id = p_return_id;
  IF v_line_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot receive a return with no lines', 'code', 'NO_LINES');
  END IF;

  UPDATE public.sales_returns
  SET status      = 'received',
      received_by = auth.uid(),
      received_at = now(),
      updated_at  = now()
  WHERE id = p_return_id;

  RETURN jsonb_build_object('success', true, 'status', 'received');
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 8. post_sales_return RPC
--    OK  → restock inventory_batches + RETURN movement
--    DMG/EXPIRY → RETURN movement only (no restock)
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_sales_return(p_return_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_return   record;
  v_line     record;
  v_exec_line record;
  v_alloc_id  uuid;
  v_batch_id  uuid;
  v_movement_id uuid;
  v_is_ok     boolean;
  v_total     numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return not found');
  END IF;
  IF v_return.status NOT IN ('received','reviewed') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Return must be RECEIVED or REVIEWED to post (current: ' || v_return.status || ')');
  END IF;

  FOR v_line IN
    SELECT * FROM public.sales_return_lines WHERE return_id = p_return_id
  LOOP
    v_is_ok := (v_line.condition = 'OK');

    -- Validate against outbound qty if linked to exec line
    IF v_line.outbound_execution_line_id IS NOT NULL THEN
      SELECT * INTO v_exec_line
      FROM public.outbound_execution_lines
      WHERE id = v_line.outbound_execution_line_id;

      IF FOUND THEN
        IF v_exec_line.returned_qty + v_line.qty_returned > v_exec_line.qty_confirmed THEN
          RETURN jsonb_build_object(
            'success', false,
            'error',   'Return qty exceeds outbound confirmed qty',
            'code',    'RETURN_QTY_EXCEEDS_OUTBOUND',
            'line_id', v_line.id
          );
        END IF;
      END IF;

      -- Find primary allocation for this exec line
      SELECT id, batch_id INTO v_alloc_id, v_batch_id
      FROM public.outbound_execution_allocations
      WHERE outbound_execution_line_id = v_line.outbound_execution_line_id
      ORDER BY created_at ASC
      LIMIT 1;
    ELSE
      v_alloc_id := NULL;
      v_batch_id := NULL;
    END IF;

    -- Restock only if condition = OK and batch is known
    IF v_is_ok AND v_batch_id IS NOT NULL THEN
      UPDATE public.inventory_batches
      SET qty_available = qty_available + v_line.qty_returned
      WHERE id = v_batch_id;
    END IF;

    -- Create RETURN movement (always)
    INSERT INTO public.inventory_movements (
      product_id, movement_type, reference_type, reference_id,
      batch_id, batch_no, expiry_date,
      qty_in, qty_out, unit_cost, condition, performed_by
    )
    SELECT
      v_line.product_id, 'RETURN', 'RETURN', p_return_id,
      v_batch_id, v_line.batch_no, v_line.expiry_date,
      CASE WHEN v_is_ok THEN v_line.qty_returned ELSE 0 END,
      CASE WHEN v_is_ok THEN 0 ELSE v_line.qty_returned END,
      NULL, v_line.condition, auth.uid()
    RETURNING id INTO v_movement_id;

    -- Link movement back to return line
    UPDATE public.sales_return_lines
    SET return_movement_id = v_movement_id,
        allocation_id      = v_alloc_id
    WHERE id = v_line.id;

    -- Update outbound counters
    IF v_line.outbound_execution_line_id IS NOT NULL THEN
      UPDATE public.outbound_execution_lines
      SET returned_qty = returned_qty + v_line.qty_returned
      WHERE id = v_line.outbound_execution_line_id;

      IF v_alloc_id IS NOT NULL THEN
        UPDATE public.outbound_execution_allocations
        SET returned_qty = returned_qty + v_line.qty_returned
        WHERE id = v_alloc_id;
      END IF;
    END IF;

    v_total := v_total + (v_line.qty_returned * COALESCE(v_line.unit_price, 0));
  END LOOP;

  UPDATE public.sales_returns
  SET status      = 'posted',
      posted_by   = auth.uid(),
      posted_at   = now(),
      total_amount = v_total,
      updated_at  = now()
  WHERE id = p_return_id;

  RETURN jsonb_build_object('success', true, 'status', 'posted', 'total_amount', v_total);
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 9. Grants
-- ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.outbound_execution_allocations TO authenticated;
GRANT USAGE ON SEQUENCE public.return_no_seq TO authenticated;

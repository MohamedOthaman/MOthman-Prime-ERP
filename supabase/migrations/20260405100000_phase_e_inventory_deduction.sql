-- ═══════════════════════════════════════════════════════════════════
-- Phase E: Inventory Deduction + Movements + Returns Foundation
-- Applied: 2026-04-05
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. inventory_movements — core audit trail for all stock changes
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid    NOT NULL,
  movement_type     TEXT    NOT NULL CHECK (movement_type IN ('INBOUND','OUTBOUND','RETURN','ADJUSTMENT','TRANSFER')),
  reference_type    TEXT    CHECK (reference_type IN ('GRN','INVOICE','RETURN','TRANSFER','MANUAL')),
  reference_id      uuid,
  reference_line_id uuid,
  batch_id          uuid    REFERENCES public.inventory_batches(id),
  batch_no          TEXT,
  expiry_date       DATE,
  warehouse_id      uuid,
  zone_id           uuid,
  location_ref      TEXT,
  qty_in            NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_out           NUMERIC(14,3) NOT NULL DEFAULT 0,
  balance_after     NUMERIC(14,3),
  unit_cost         NUMERIC(14,4),
  performed_by      uuid    REFERENCES auth.users(id),
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_im_product_id    ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_im_batch_id      ON public.inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_im_reference_id  ON public.inventory_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_im_movement_type ON public.inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_im_performed_at  ON public.inventory_movements(performed_at);

-- ───────────────────────────────────────────────────────────────────
-- 2. sales_returns + sales_return_lines — returns foundation
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_returns (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no    TEXT,
  invoice_id   uuid    NOT NULL REFERENCES public.sales_headers(id),
  customer_id  uuid,
  status       TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','received','cancelled')),
  notes        TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by   uuid    REFERENCES auth.users(id),
  received_by  uuid    REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_return_lines (
  id                         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id                  uuid    NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  invoice_line_id            uuid    REFERENCES public.sales_lines(id),
  outbound_execution_line_id uuid    REFERENCES public.outbound_execution_lines(id),
  product_id                 uuid    NOT NULL,
  qty_returned               NUMERIC(14,3) NOT NULL CHECK (qty_returned > 0),
  unit_price                 NUMERIC(14,4),
  reason                     TEXT,
  batch_no                   TEXT,
  expiry_date                DATE,
  condition                  TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_invoice_id  ON public.sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_srl_return_id  ON public.sales_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_srl_oel_id     ON public.sales_return_lines(outbound_execution_line_id);

DROP TRIGGER IF EXISTS trg_sr_updated_at ON public.sales_returns;
CREATE TRIGGER trg_sr_updated_at
  BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- 3. Extend outbound_execution_lines
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE public.outbound_execution_lines
  ADD COLUMN IF NOT EXISTS inventory_batch_id    uuid REFERENCES public.inventory_batches(id),
  ADD COLUMN IF NOT EXISTS inventory_movement_id uuid REFERENCES public.inventory_movements(id),
  ADD COLUMN IF NOT EXISTS returned_qty          NUMERIC(14,3) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_oel_batch_id    ON public.outbound_execution_lines(inventory_batch_id);
CREATE INDEX IF NOT EXISTS idx_oel_movement_id ON public.outbound_execution_lines(inventory_movement_id);

-- ───────────────────────────────────────────────────────────────────
-- 4. Grants
-- ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.inventory_movements  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_returns        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_return_lines   TO authenticated;

-- ───────────────────────────────────────────────────────────────────
-- 5. confirm_picking_done — rewritten with real FEFO deduction
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

  -- FEFO deduction per exec line
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

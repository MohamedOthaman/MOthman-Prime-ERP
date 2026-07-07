-- ═══════════════════════════════════════════════════════════════════════════
-- Invoice lifecycle ↔ stock reconciliation (Phase E)
-- ═══════════════════════════════════════════════════════════════════════════
-- STATUS: REVIEWED-MIGRATION, NOT YET APPLIED TO PRODUCTION.
-- Review notes: see docs/INVENTORY_CORRECTNESS.md. Before applying, compare
-- the current live bodies (pg_get_functiondef) — this file is written against
-- the LIVE table shapes (generated types 2026-07-06), notably
-- outbound_execution_allocations(inventory_batch_id, inventory_movement_id,
-- invoice_id, invoice_line_id, product_id, …).
--
-- Problems fixed (all verified in the repo migration chain):
--  1. Deduction was defined at draft→ready (phase_c post_sales_invoice) AND
--     at ready→done (phase_f confirm_picking_done), while mark_invoice_done
--     (the non-picking ready→done path) deducted nothing. Depending on which
--     variant is deployed this double-deducts or never deducts.
--  2. cancel_invoice never restored deducted stock.
--
-- Target model after this migration — deduction EXACTLY ONCE at ready→done:
--   post_sales_invoice    draft→ready   validation only (stock availability)
--   confirm_picking_done  ready→done    FEFO deduction (scan-driven), guarded
--   mark_invoice_done     ready→done    FEFO deduction (line-driven), guarded
--   cancel_invoice        any→cancelled reverses exactly what was recorded,
--                                       from BOTH movement tables, idempotent
-- Every function keeps: SECURITY DEFINER, pinned search_path, auth.uid()
-- guard, header FOR UPDATE, single-status gates. The idempotency guards make
-- this safe to apply regardless of which drift variant is currently live and
-- safe for invoices already in flight.

-- ─── Shared guard: has this invoice already been deducted? ───────────────────
CREATE OR REPLACE FUNCTION public.invoice_stock_deducted(p_header_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE reference_type = 'INVOICE' AND reference_id = p_header_id AND qty_out > 0
  ) OR EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_table = 'sales_headers' AND reference_id = p_header_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.invoice_stock_deducted(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.invoice_stock_deducted(uuid) TO authenticated;

-- ─── Internal: FEFO-deduct all lines of an invoice (assumes header locked) ───
CREATE OR REPLACE FUNCTION public.deduct_invoice_stock(p_header_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_line       record;
  v_batch      record;
  v_qty_needed numeric;
  v_take       numeric;
BEGIN
  FOR v_line IN
    SELECT * FROM public.sales_lines WHERE header_id = p_header_id ORDER BY line_no
  LOOP
    v_qty_needed := v_line.quantity;
    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE product_id = v_line.product_id AND qty_available > 0
      ORDER BY expiry_date ASC NULLS LAST, received_date ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_qty_needed <= 0;
      v_take := LEAST(v_batch.qty_available, v_qty_needed);

      UPDATE public.inventory_batches
      SET qty_available = qty_available - v_take
      WHERE id = v_batch.id;

      INSERT INTO public.inventory_movements (
        product_id, movement_type, reference_type, reference_id, reference_line_id,
        batch_id, batch_no, expiry_date, qty_in, qty_out, balance_after,
        unit_cost, performed_by, notes
      ) VALUES (
        v_line.product_id, 'OUTBOUND', 'INVOICE', p_header_id, v_line.id,
        v_batch.id, v_batch.batch_no, v_batch.expiry_date, 0, v_take,
        v_batch.qty_available - v_take, v_batch.unit_cost, auth.uid(),
        'Invoice marked done'
      );

      v_qty_needed := v_qty_needed - v_take;
    END LOOP;

    IF v_qty_needed > 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product % (short by %)',
        v_line.product_id, v_qty_needed;
    END IF;
  END LOOP;
END;$$;
REVOKE EXECUTE ON FUNCTION public.deduct_invoice_stock(uuid) FROM anon, public;
-- internal helper: callable only via the RPCs below (definer context)
REVOKE EXECUTE ON FUNCTION public.deduct_invoice_stock(uuid) FROM authenticated;

-- ─── post_sales_invoice: validation only, draft → ready ──────────────────────
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_sales_header_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header    record;
  v_line      record;
  v_available numeric(14,3);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_header FROM public.sales_headers
  WHERE id = p_sales_header_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales header not found'; END IF;
  IF v_header.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft invoices can be posted (current: %)', v_header.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_lines WHERE header_id = p_sales_header_id) THEN
    RAISE EXCEPTION 'Cannot post invoice without lines';
  END IF;

  FOR v_line IN SELECT * FROM public.sales_lines WHERE header_id = p_sales_header_id LOOP
    SELECT COALESCE(SUM(qty_available), 0) INTO v_available
    FROM public.inventory_batches WHERE product_id = v_line.product_id;
    IF v_available < v_line.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % (need %, have %)',
        v_line.product_id, v_line.quantity, v_available;
    END IF;
  END LOOP;

  -- NO deduction here — stock leaves at ready→done (picking confirm or
  -- mark_invoice_done), exactly once.
  UPDATE public.sales_headers
  SET status = 'ready', ready_at = now(), ready_by = auth.uid()
  WHERE id = p_sales_header_id;

  RETURN jsonb_build_object('success', true, 'status', 'ready', 'id', p_sales_header_id);
END;$$;

-- ─── mark_invoice_done: ready → done + guarded FEFO deduction ────────────────
CREATE OR REPLACE FUNCTION public.mark_invoice_done(p_header_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header   record;
  v_deducted boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_header FROM public.sales_headers WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Not found'); END IF;
  IF v_header.status <> 'ready' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Must be READY (current: ' || v_header.status || ')');
  END IF;

  v_deducted := public.invoice_stock_deducted(p_header_id);
  IF NOT v_deducted THEN
    PERFORM public.deduct_invoice_stock(p_header_id);
  END IF;

  UPDATE public.sales_headers
  SET status = 'done', done_at = now(), done_by = auth.uid()
  WHERE id = p_header_id;

  RETURN jsonb_build_object('success', true, 'status', 'done',
    'stock_deducted_now', NOT v_deducted);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;$$;

-- ─── confirm_picking_done: full-scan gate + guarded FEFO deduction ───────────
-- Body follows the phase_f engine but with LIVE column names on
-- outbound_execution_allocations/lines and the shared deduction guard.
CREATE OR REPLACE FUNCTION public.confirm_picking_done(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header            record;
  v_session           record;
  v_incomplete        record;
  v_exec_line         record;
  v_batch             record;
  v_qty_needed        numeric;
  v_qty_from_batch    numeric;
  v_movement_id       uuid;
  v_first_batch_id    uuid;
  v_first_movement_id uuid;
  v_first_batch_no    text;
  v_first_expiry_date date;
  v_total_avail       numeric;
  v_already_deducted  boolean;
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

  -- Idempotency / drift guard: if this invoice's stock already left (e.g. a
  -- legacy post_sales_invoice variant deducted at posting, or a replay), do
  -- NOT deduct again — just complete the session and the status transition.
  v_already_deducted := public.invoice_stock_deducted(p_invoice_id);

  IF NOT v_already_deducted THEN
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
          'success', false, 'error', 'Insufficient stock', 'code', 'INSUFFICIENT_STOCK',
          'product_id', v_exec_line.product_id,
          'required', v_exec_line.qty_scanned, 'available', v_total_avail);
      END IF;
    END LOOP;

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

        INSERT INTO public.outbound_execution_allocations (
          outbound_execution_line_id, invoice_id, invoice_line_id, product_id,
          inventory_batch_id, inventory_movement_id,
          batch_no, expiry_date, qty_allocated, created_by
        ) VALUES (
          v_exec_line.id, p_invoice_id, v_exec_line.invoice_line_id, v_exec_line.product_id,
          v_batch.id, v_movement_id,
          v_batch.batch_no, v_batch.expiry_date, v_qty_from_batch, auth.uid()
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
        RAISE EXCEPTION 'Concurrent stock change — insufficient stock for product %',
          v_exec_line.product_id;
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
  END IF;

  UPDATE public.outbound_execution_sessions
  SET status = 'completed', confirmed_by = auth.uid(), confirmed_at = now()
  WHERE id = v_session.id;

  UPDATE public.sales_headers
  SET status = 'done', done_at = now(), done_by = auth.uid()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'status', 'done',
    'stock_deducted_now', NOT v_already_deducted);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;$$;

-- ─── cancel_invoice: original rules + movement-based stock restoration ───────
CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_header_id uuid,
  p_reason    text,
  p_approver  uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header      record;
  v_days        integer;
  v_mv          record;
  v_restored    numeric := 0;
  v_unrestored  numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_header FROM public.sales_headers WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Not found'); END IF;
  IF v_header.status IN ('cancelled', 'returns') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already terminal: ' || v_header.status);
  END IF;
  IF v_header.status = 'received' THEN
    v_days := EXTRACT(DAY FROM now() - v_header.received_at)::integer;
    IF v_days > 14 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Received ' || v_days || 'd ago — use RETURNS workflow.', 'code', '14_DAY_RULE');
    END IF;
  END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cancel reason required');
  END IF;

  -- Restore stock: reverse exactly what was recorded, once. Movement-driven,
  -- so it is correct regardless of WHERE the deduction happened (posting-time
  -- legacy variant via stock_movements, or done-time via inventory_movements).
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE reference_type = 'INVOICE_CANCEL' AND reference_id = p_header_id
  ) THEN
    FOR v_mv IN
      SELECT product_id, batch_id, batch_no, expiry_date, reference_line_id,
             qty_out AS qty
      FROM public.inventory_movements
      WHERE reference_type = 'INVOICE' AND reference_id = p_header_id AND qty_out > 0
      UNION ALL
      SELECT sm.product_id, sm.batch_id, ib.batch_no, ib.expiry_date, NULL::uuid,
             sm.quantity AS qty
      FROM public.stock_movements sm
      LEFT JOIN public.inventory_batches ib ON ib.id = sm.batch_id
      WHERE sm.reference_table = 'sales_headers' AND sm.reference_id = p_header_id
    LOOP
      IF v_mv.batch_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.inventory_batches WHERE id = v_mv.batch_id) THEN
        UPDATE public.inventory_batches
        SET qty_available = qty_available + v_mv.qty
        WHERE id = v_mv.batch_id;

        INSERT INTO public.inventory_movements (
          product_id, movement_type, reference_type, reference_id, reference_line_id,
          batch_id, batch_no, expiry_date, qty_in, qty_out, performed_by, notes
        ) VALUES (
          v_mv.product_id, 'INBOUND', 'INVOICE_CANCEL', p_header_id, v_mv.reference_line_id,
          v_mv.batch_id, v_mv.batch_no, v_mv.expiry_date, v_mv.qty, 0, auth.uid(),
          'Stock restored on invoice cancellation'
        );
        v_restored := v_restored + v_mv.qty;
      ELSE
        v_unrestored := v_unrestored + v_mv.qty;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.sales_headers SET
    status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = TRIM(p_reason), cancel_approved_by = p_approver
  WHERE id = p_header_id;

  INSERT INTO public.audit_logs(action, entity_table, entity_id, old_data, new_data, description, performed_by)
  VALUES ('invoice_cancelled', 'sales_headers', p_header_id,
    jsonb_build_object('status', v_header.status),
    jsonb_build_object('status', 'cancelled', 'reason', p_reason,
                       'stock_restored', v_restored, 'stock_unrestored', v_unrestored),
    'Invoice ' || COALESCE(v_header.invoice_no, '?') || ' cancelled', auth.uid());

  RETURN jsonb_build_object('success', true, 'status', 'cancelled',
    'stock_restored', v_restored, 'stock_unrestored', v_unrestored);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;$$;

-- Access: mutating lifecycle RPCs are for signed-in staff only.
REVOKE EXECUTE ON FUNCTION public.post_sales_invoice(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_invoice_done(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_picking_done(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_invoice(uuid, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_done(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_picking_done(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid, text, uuid) TO authenticated;

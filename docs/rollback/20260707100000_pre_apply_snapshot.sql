-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK SNAPSHOT for 20260707100000_invoice_lifecycle_stock_reconciliation
-- ═══════════════════════════════════════════════════════════════════════════
-- Captured VERBATIM from live (pg_get_functiondef, project koxtzeymsujzlqrpsims,
-- 2026-07-07) BEFORE applying the reconciliation migration. Re-running this
-- file restores the exact pre-migration behavior (including its bugs:
-- deduction at post + at picking-confirm = double deduction; no stock
-- restoration on cancel). Also DROP the two helper functions the migration
-- introduces:
--   DROP FUNCTION IF EXISTS public.invoice_stock_deducted(uuid);
--   DROP FUNCTION IF EXISTS public.deduct_invoice_stock(uuid);

CREATE OR REPLACE FUNCTION public.cancel_invoice(p_header_id uuid, p_reason text, p_approver uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_header  record;
  v_days    integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_header FROM public.sales_headers WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Invoice not found'); END IF;

  -- Already terminal
  IF v_header.status IN ('cancelled','returns') THEN
    RETURN jsonb_build_object('success',false,'error','Invoice already in terminal state: '||v_header.status);
  END IF;

  -- 14-day rule: received invoices older than 14 days → must use RETURNS workflow
  IF v_header.status = 'received' THEN
    v_days := EXTRACT(DAY FROM now() - v_header.received_at)::integer;
    IF v_days > 14 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invoice received '||v_days||' days ago — cancellation blocked. Use RETURNS workflow.',
        'code', '14_DAY_RULE'
      );
    END IF;
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN jsonb_build_object('success',false,'error','Cancel reason is required');
  END IF;

  UPDATE public.sales_headers
  SET
    status             = 'cancelled',
    cancelled_at       = now(),
    cancelled_by       = auth.uid(),
    cancel_reason      = TRIM(p_reason),
    cancel_approved_by = p_approver
  WHERE id = p_header_id;

  INSERT INTO public.audit_logs (action, entity_table, entity_id, old_data, new_data, description, performed_by)
  VALUES (
    'invoice_cancelled', 'sales_headers', p_header_id,
    jsonb_build_object('status', v_header.status),
    jsonb_build_object('status','cancelled','reason',p_reason),
    'Invoice '||COALESCE(v_header.invoice_no,'?')||' cancelled',
    auth.uid()
  );

  RETURN jsonb_build_object('success',true,'status','cancelled');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;$function$;

CREATE OR REPLACE FUNCTION public.confirm_picking_done(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'Invoice must be READY (current: ' || v_header.status || ')');
  END IF;

  SELECT * INTO v_session FROM public.outbound_execution_sessions
  WHERE invoice_id = p_invoice_id AND status = 'in_progress';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active picking session');
  END IF;

  SELECT * INTO v_incomplete FROM public.outbound_execution_lines
  WHERE session_id = v_session.id AND qty_scanned < qty_required LIMIT 1;
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
        'success', false, 'error', 'Insufficient stock', 'code', 'INSUFFICIENT_STOCK',
        'product_id', v_exec_line.product_id, 'required', v_exec_line.qty_scanned, 'available', v_total_avail
      );
    END IF;
  END LOOP;

  -- FEFO deduction per exec line
  FOR v_exec_line IN
    SELECT * FROM public.outbound_execution_lines
    WHERE session_id = v_session.id ORDER BY created_at
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
      SET qty_available = qty_available - v_qty_from_batch WHERE id = v_batch.id;

      INSERT INTO public.inventory_movements (
        product_id, movement_type, reference_type, reference_id, reference_line_id,
        batch_id, batch_no, expiry_date, qty_in, qty_out, balance_after, unit_cost, performed_by
      ) VALUES (
        v_exec_line.product_id, 'OUTBOUND', 'INVOICE', p_invoice_id, v_exec_line.invoice_line_id,
        v_batch.id, v_batch.batch_no, v_batch.expiry_date,
        0, v_qty_from_batch, v_batch.qty_available - v_qty_from_batch, v_batch.unit_cost, auth.uid()
      ) RETURNING id INTO v_movement_id;

      -- ── Allocation record (one per batch slice) ─────────────────
      INSERT INTO public.outbound_execution_allocations (
        outbound_execution_line_id, invoice_id, invoice_line_id, product_id,
        inventory_batch_id, inventory_movement_id, batch_no, expiry_date,
        qty_allocated, created_by
      ) VALUES (
        v_exec_line.id, p_invoice_id, v_exec_line.invoice_line_id, v_exec_line.product_id,
        v_batch.id, v_movement_id, v_batch.batch_no, v_batch.expiry_date,
        v_qty_from_batch, auth.uid()
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
      RAISE EXCEPTION 'Concurrent stock change for product %', v_exec_line.product_id;
    END IF;

    UPDATE public.outbound_execution_lines
    SET qty_confirmed         = qty_scanned,
        confirmed_by          = auth.uid(),
        loaded_at             = now(),
        inventory_batch_id    = v_first_batch_id,
        inventory_movement_id = v_first_movement_id,
        batch_no              = COALESCE(batch_no, v_first_batch_no),
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
END;$function$;

CREATE OR REPLACE FUNCTION public.mark_invoice_done(p_header_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT status INTO v_status FROM public.sales_headers WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Invoice not found'); END IF;
  IF v_status <> 'ready' THEN
    RETURN jsonb_build_object('success',false,'error','Invoice must be READY to mark as DONE (current: '||v_status||')');
  END IF;
  UPDATE public.sales_headers
  SET status='done', done_at=now(), done_by=auth.uid()
  WHERE id=p_header_id;
  RETURN jsonb_build_object('success',true,'status','done');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;$function$;

CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_sales_header_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_header record;
  v_line   record;
  v_batch  record;
  v_qty_needed  numeric(14,3);
  v_available   numeric(14,3);
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

  -- Validate stock
  FOR v_line IN SELECT * FROM public.sales_lines WHERE header_id = p_sales_header_id LOOP
    SELECT COALESCE(SUM(qty_available),0) INTO v_available
    FROM public.inventory_batches WHERE product_id = v_line.product_id;
    IF v_available < v_line.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % (need %, have %)',
        v_line.product_id, v_line.quantity, v_available;
    END IF;
  END LOOP;

  -- FEFO deduction
  FOR v_line IN SELECT * FROM public.sales_lines WHERE header_id = p_sales_header_id ORDER BY line_no LOOP
    v_qty_needed := v_line.quantity;
    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE product_id = v_line.product_id AND qty_available > 0
      ORDER BY expiry_date ASC NULLS LAST, received_date ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_qty_needed <= 0;
      DECLARE v_take numeric := LEAST(v_batch.qty_available, v_qty_needed);
      BEGIN
        INSERT INTO public.stock_movements
          (product_id, batch_id, movement_type, quantity, reference_table, reference_id, notes, moved_at, created_by)
        VALUES
          (v_line.product_id, v_batch.id, 'sale_out', v_take,
           'sales_headers', p_sales_header_id, 'Invoice posted', now(), auth.uid());
        UPDATE public.inventory_batches SET qty_available = qty_available - v_take WHERE id = v_batch.id;
        v_qty_needed := v_qty_needed - v_take;
      END;
    END LOOP;
    IF v_qty_needed > 0 THEN
      RAISE EXCEPTION 'FEFO allocation failed for product %', v_line.product_id;
    END IF;
  END LOOP;

  UPDATE public.sales_headers
  SET status = 'ready', ready_at = now(), ready_by = auth.uid()
  WHERE id = p_sales_header_id;

  RETURN jsonb_build_object('success', true, 'status', 'ready', 'id', p_sales_header_id);
END;$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- record_stock_adjustment — controlled manual stock corrections (Phase E)
-- ═══════════════════════════════════════════════════════════════════════════
-- STATUS: REVIEWED-MIGRATION, NOT YET APPLIED TO PRODUCTION.
-- Purpose: today there is no way to correct a batch quantity without faking a
-- GRN or a sale. This RPC keeps quantities movement-backed: one ADJUSTMENT
-- movement + the qty_available update happen atomically, with an audit row.
-- Never lets qty_available go negative. Additive only (new function).

CREATE OR REPLACE FUNCTION public.record_stock_adjustment(
  p_batch_id  uuid,
  p_qty_delta numeric,
  p_reason    text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_batch record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_qty_delta IS NULL OR p_qty_delta = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment quantity must be non-zero');
  END IF;
  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment reason is required');
  END IF;

  SELECT * INTO v_batch FROM public.inventory_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Batch not found');
  END IF;

  IF v_batch.qty_available + p_qty_delta < 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Adjustment would make batch quantity negative (available: '
               || v_batch.qty_available || ', delta: ' || p_qty_delta || ')',
      'code', 'NEGATIVE_STOCK');
  END IF;

  UPDATE public.inventory_batches
  SET qty_available = qty_available + p_qty_delta
  WHERE id = p_batch_id;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, reference_type, reference_id,
    batch_id, batch_no, expiry_date,
    qty_in, qty_out, balance_after, unit_cost, performed_by, notes
  ) VALUES (
    v_batch.product_id, 'ADJUSTMENT', 'ADJUSTMENT', p_batch_id,
    v_batch.id, v_batch.batch_no, v_batch.expiry_date,
    GREATEST(p_qty_delta, 0), GREATEST(-p_qty_delta, 0),
    v_batch.qty_available + p_qty_delta, v_batch.unit_cost, auth.uid(),
    TRIM(p_reason)
  );

  INSERT INTO public.audit_logs (action, entity_table, entity_id, old_data, new_data, description, performed_by)
  VALUES ('stock_adjustment', 'inventory_batches', p_batch_id,
    jsonb_build_object('qty_available', v_batch.qty_available),
    jsonb_build_object('qty_available', v_batch.qty_available + p_qty_delta,
                       'delta', p_qty_delta, 'reason', TRIM(p_reason)),
    'Manual stock adjustment on batch ' || COALESCE(v_batch.batch_no, p_batch_id::text),
    auth.uid());

  RETURN jsonb_build_object('success', true,
    'batch_id', p_batch_id,
    'qty_available', v_batch.qty_available + p_qty_delta);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;$$;

REVOKE EXECUTE ON FUNCTION public.record_stock_adjustment(uuid, numeric, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_stock_adjustment(uuid, numeric, text) TO authenticated;

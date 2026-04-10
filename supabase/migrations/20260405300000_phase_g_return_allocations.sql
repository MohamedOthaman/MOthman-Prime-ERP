-- ═══════════════════════════════════════════════════════════════════
-- Phase G: Return Allocation Traceability — Multi-batch return linkage
-- Applied: 2026-04-05
-- ═══════════════════════════════════════════════════════════════════
-- Adds sales_return_allocations as source-of-truth for exact per-batch
-- return quantity tracking, and rewrites post_sales_return to consume
-- outbound_execution_allocations in FIFO order.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. sales_return_allocations
--    One row per outbound allocation slice consumed by a return line.
--    If one return line spans 3 batches → 3 rows here.
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_return_allocations (
  id                               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  return_line_id                   uuid    NOT NULL REFERENCES public.sales_return_lines(id) ON DELETE CASCADE,
  outbound_execution_allocation_id uuid    REFERENCES public.outbound_execution_allocations(id),
  outbound_execution_line_id       uuid    REFERENCES public.outbound_execution_lines(id),
  invoice_id                       uuid    REFERENCES public.sales_headers(id),
  invoice_line_id                  uuid    REFERENCES public.sales_lines(id),
  product_id                       uuid    NOT NULL,
  batch_id                         uuid    REFERENCES public.inventory_batches(id),
  batch_no                         TEXT,
  expiry_date                      DATE,
  qty_returned                     NUMERIC(14,3) NOT NULL CHECK (qty_returned > 0),
  condition                        TEXT    CHECK (condition IN ('OK','DMG','EXPIRY')),
  return_movement_id               uuid    REFERENCES public.inventory_movements(id),
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                       uuid    REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_sra_return_line_id  ON public.sales_return_allocations(return_line_id);
CREATE INDEX IF NOT EXISTS idx_sra_oea_id          ON public.sales_return_allocations(outbound_execution_allocation_id);
CREATE INDEX IF NOT EXISTS idx_sra_oel_id          ON public.sales_return_allocations(outbound_execution_line_id);
CREATE INDEX IF NOT EXISTS idx_sra_batch_id        ON public.sales_return_allocations(batch_id);
CREATE INDEX IF NOT EXISTS idx_sra_product_id      ON public.sales_return_allocations(product_id);

GRANT SELECT, INSERT, UPDATE ON public.sales_return_allocations TO authenticated;

-- ───────────────────────────────────────────────────────────────────
-- 2. Rewrite post_sales_return
--    Multi-allocation FIFO consumption. Exact batch-level restock.
--    sales_return_allocations is source of truth for returned qty.
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_sales_return(p_return_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_return            record;
  v_line              record;
  v_alloc             record;
  v_batch_row         record;
  v_qty_needed        numeric;
  v_qty_from_alloc    numeric;
  v_movement_id       uuid;
  v_first_movement_id uuid;
  v_is_ok             boolean;
  v_total             numeric := 0;
  v_total_remaining   numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return not found', 'code', 'NOT_FOUND');
  END IF;
  IF v_return.status NOT IN ('received', 'reviewed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Return must be RECEIVED or REVIEWED to post (current: ' || v_return.status || ')',
      'code',    'INVALID_RETURN_STATUS'
    );
  END IF;

  -- ── Process each return line ──────────────────────────────────────
  FOR v_line IN
    SELECT * FROM public.sales_return_lines WHERE return_id = p_return_id
  LOOP
    v_is_ok             := (v_line.condition = 'OK');
    v_qty_needed        := v_line.qty_returned;
    v_first_movement_id := NULL;

    IF v_line.outbound_execution_line_id IS NOT NULL THEN

      -- Validate total remaining across all allocations for this exec line
      SELECT COALESCE(SUM(qty_allocated - returned_qty), 0) INTO v_total_remaining
      FROM public.outbound_execution_allocations
      WHERE outbound_execution_line_id = v_line.outbound_execution_line_id
        AND qty_allocated > returned_qty;

      IF v_total_remaining < v_qty_needed THEN
        RETURN jsonb_build_object(
          'success',   false,
          'error',     'Return qty exceeds outbound allocated qty',
          'code',      'RETURN_QTY_EXCEEDS_OUTBOUND',
          'line_id',   v_line.id,
          'available', v_total_remaining,
          'requested', v_qty_needed
        );
      END IF;

      -- Consume allocations in FIFO order (oldest allocation first)
      FOR v_alloc IN
        SELECT * FROM public.outbound_execution_allocations
        WHERE outbound_execution_line_id = v_line.outbound_execution_line_id
          AND qty_allocated > returned_qty
        ORDER BY created_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_qty_needed <= 0;

        v_qty_from_alloc := LEAST(v_alloc.qty_allocated - v_alloc.returned_qty, v_qty_needed);

        -- For OK returns: validate and restock into exact original batch
        IF v_is_ok THEN
          IF v_alloc.batch_id IS NULL THEN
            RETURN jsonb_build_object(
              'success', false,
              'error',   'Cannot restock OK return: outbound allocation has no batch reference',
              'code',    'INVALID_RETURN_BATCH_TARGET',
              'alloc_id', v_alloc.id
            );
          END IF;

          SELECT id INTO v_batch_row FROM public.inventory_batches WHERE id = v_alloc.batch_id;
          IF NOT FOUND THEN
            RETURN jsonb_build_object(
              'success',  false,
              'error',    'Original inventory batch no longer exists',
              'code',     'INVALID_RETURN_BATCH_TARGET',
              'batch_id', v_alloc.batch_id
            );
          END IF;

          UPDATE public.inventory_batches
          SET qty_available = qty_available + v_qty_from_alloc
          WHERE id = v_alloc.batch_id;
        END IF;

        -- Create inventory movement for this allocation slice
        INSERT INTO public.inventory_movements (
          product_id, movement_type, reference_type, reference_id,
          batch_id, batch_no, expiry_date,
          qty_in, qty_out, condition, performed_by
        ) VALUES (
          v_line.product_id,
          'RETURN', 'RETURN', p_return_id,
          v_alloc.batch_id, v_alloc.batch_no, v_alloc.expiry_date,
          CASE WHEN v_is_ok THEN v_qty_from_alloc ELSE 0 END,
          CASE WHEN v_is_ok THEN 0 ELSE v_qty_from_alloc END,
          v_line.condition, auth.uid()
        ) RETURNING id INTO v_movement_id;

        -- Insert return allocation row (source of truth)
        INSERT INTO public.sales_return_allocations (
          return_line_id,
          outbound_execution_allocation_id,
          outbound_execution_line_id,
          invoice_id,
          invoice_line_id,
          product_id,
          batch_id, batch_no, expiry_date,
          qty_returned,
          condition,
          return_movement_id,
          created_by
        ) VALUES (
          v_line.id,
          v_alloc.id,
          v_line.outbound_execution_line_id,
          v_return.invoice_id,
          v_line.invoice_line_id,
          v_line.product_id,
          v_alloc.batch_id, v_alloc.batch_no, v_alloc.expiry_date,
          v_qty_from_alloc,
          v_line.condition,
          v_movement_id,
          auth.uid()
        );

        -- Update outbound allocation returned_qty
        UPDATE public.outbound_execution_allocations
        SET returned_qty = returned_qty + v_qty_from_alloc
        WHERE id = v_alloc.id;

        IF v_first_movement_id IS NULL THEN
          v_first_movement_id := v_movement_id;
        END IF;

        v_qty_needed := v_qty_needed - v_qty_from_alloc;
      END LOOP;

      -- Keep exec line returned_qty consistent with sum of posted return allocations
      UPDATE public.outbound_execution_lines
      SET returned_qty = (
        SELECT COALESCE(SUM(sra.qty_returned), 0)
        FROM public.sales_return_allocations sra
        JOIN public.sales_return_lines srl ON srl.id = sra.return_line_id
        JOIN public.sales_returns sr ON sr.id = srl.return_id
        WHERE sra.outbound_execution_line_id = v_line.outbound_execution_line_id
          AND sr.status = 'posted'
          -- include the current return being posted (not yet 'posted' but counting now)
          OR (sra.outbound_execution_line_id = v_line.outbound_execution_line_id
              AND sr.id = p_return_id)
      )
      WHERE id = v_line.outbound_execution_line_id;

    ELSE
      -- ── No outbound execution link: movement only, no allocation linkage ──
      INSERT INTO public.inventory_movements (
        product_id, movement_type, reference_type, reference_id,
        batch_no, expiry_date,
        qty_in, qty_out, condition, performed_by
      ) VALUES (
        v_line.product_id,
        'RETURN', 'RETURN', p_return_id,
        v_line.batch_no, v_line.expiry_date,
        CASE WHEN v_is_ok THEN v_line.qty_returned ELSE 0 END,
        CASE WHEN v_is_ok THEN 0 ELSE v_line.qty_returned END,
        v_line.condition, auth.uid()
      ) RETURNING id INTO v_first_movement_id;
    END IF;

    -- Link primary movement back to return line (convenience)
    UPDATE public.sales_return_lines
    SET return_movement_id = v_first_movement_id
    WHERE id = v_line.id;

    v_total := v_total + (v_line.qty_returned * COALESCE(v_line.unit_price, 0));
  END LOOP;

  -- ── Finalize return document ──────────────────────────────────────
  UPDATE public.sales_returns
  SET status       = 'posted',
      posted_by    = auth.uid(),
      posted_at    = now(),
      total_amount = v_total,
      updated_at   = now()
  WHERE id = p_return_id;

  RETURN jsonb_build_object('success', true, 'status', 'posted', 'total_amount', v_total);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;$$;

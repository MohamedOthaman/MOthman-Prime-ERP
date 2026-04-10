-- ═══════════════════════════════════════════════════════════════════
-- Phase D: Outbound Execution Tracking Foundation
-- Tables: outbound_execution_sessions, outbound_execution_lines, outbound_scan_events
-- RPCs:   start_or_get_picking_session, record_outbound_scan, confirm_picking_done
-- Applied: 2026-04-05
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. Tables
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outbound_execution_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.sales_headers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','completed','cancelled')),
  started_by    uuid REFERENCES auth.users(id),
  confirmed_by  uuid REFERENCES auth.users(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outbound_execution_sessions_invoice_unique UNIQUE (invoice_id)
);

CREATE TABLE IF NOT EXISTS public.outbound_execution_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES public.outbound_execution_sessions(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL REFERENCES public.sales_headers(id),
  invoice_line_id  uuid NOT NULL REFERENCES public.sales_lines(id),
  product_id       uuid NOT NULL,
  qty_required     NUMERIC(14,3) NOT NULL,
  qty_scanned      NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_confirmed    NUMERIC(14,3),
  batch_no         TEXT,
  expiry_date      DATE,
  warehouse_id     uuid,
  zone_id          uuid,
  location_ref     TEXT,
  scanned_by       uuid REFERENCES auth.users(id),
  confirmed_by     uuid REFERENCES auth.users(id),
  picked_at        TIMESTAMPTZ,
  loaded_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outbound_execution_lines_session_line_unique UNIQUE (session_id, invoice_line_id)
);

CREATE TABLE IF NOT EXISTS public.outbound_scan_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.outbound_execution_sessions(id),
  invoice_id  uuid NOT NULL,
  product_id  uuid NOT NULL,
  barcode     TEXT,
  qty         NUMERIC(14,3) NOT NULL DEFAULT 1,
  scanned_by  uuid REFERENCES auth.users(id),
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_oes_invoice_id  ON public.outbound_execution_sessions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_oel_session_id  ON public.outbound_execution_lines(session_id);
CREATE INDEX IF NOT EXISTS idx_oel_invoice_id  ON public.outbound_execution_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_oel_product_id  ON public.outbound_execution_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_ose_session_id  ON public.outbound_scan_events(session_id);

-- ───────────────────────────────────────────────────────────────────
-- 3. updated_at triggers (reuse generic function if exists)
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_oes_updated_at ON public.outbound_execution_sessions;
CREATE TRIGGER trg_oes_updated_at
  BEFORE UPDATE ON public.outbound_execution_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_oel_updated_at ON public.outbound_execution_lines;
CREATE TRIGGER trg_oel_updated_at
  BEFORE UPDATE ON public.outbound_execution_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- 4. RPC: start_or_get_picking_session
-- Creates session + lines on first call; returns existing on repeat
-- Allowed for status: ready (start) or done (read-only view)
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_or_get_picking_session(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header  record;
  v_session record;
  v_line    record;
  v_lines   jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_header FROM public.sales_headers WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF v_header.status NOT IN ('ready', 'done') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Invoice must be READY to start picking (current: ' || v_header.status || ')');
  END IF;

  SELECT * INTO v_session FROM public.outbound_execution_sessions
  WHERE invoice_id = p_invoice_id;

  IF NOT FOUND THEN
    INSERT INTO public.outbound_execution_sessions (invoice_id, started_by)
    VALUES (p_invoice_id, auth.uid())
    RETURNING * INTO v_session;

    FOR v_line IN
      SELECT id, product_id, quantity FROM public.sales_lines WHERE header_id = p_invoice_id
    LOOP
      INSERT INTO public.outbound_execution_lines
        (session_id, invoice_id, invoice_line_id, product_id, qty_required)
      VALUES (v_session.id, p_invoice_id, v_line.id, v_line.product_id, v_line.quantity);
    END LOOP;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id',              oel.id,
    'invoice_line_id', oel.invoice_line_id,
    'product_id',      oel.product_id,
    'qty_required',    oel.qty_required,
    'qty_scanned',     oel.qty_scanned,
    'picked_at',       oel.picked_at
  ) ORDER BY oel.created_at)
  INTO v_lines
  FROM public.outbound_execution_lines oel
  WHERE oel.session_id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id',           v_session.id,
      'status',       v_session.status,
      'started_by',   v_session.started_by,
      'started_at',   v_session.started_at,
      'confirmed_at', v_session.confirmed_at
    ),
    'lines', COALESCE(v_lines, '[]'::jsonb)
  );
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 5. RPC: record_outbound_scan
-- Validates barcode → product → invoice line, increments qty_scanned
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_outbound_scan(
  p_invoice_id  uuid,
  p_barcode     text,
  p_qty         numeric DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_session   record;
  v_product   record;
  v_exec_line record;
  v_new_qty   numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_session FROM public.outbound_execution_sessions
  WHERE invoice_id = p_invoice_id AND status = 'in_progress';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active picking session', 'code', 'NO_SESSION');
  END IF;

  -- Lookup product by primary_barcode first
  SELECT id INTO v_product
  FROM public.products
  WHERE primary_barcode = p_barcode
  LIMIT 1;

  -- Fallback: product_barcodes table (if it exists)
  IF NOT FOUND THEN
    BEGIN
      SELECT p.id INTO v_product
      FROM public.product_barcodes pb
      JOIN public.products p ON p.id = pb.product_id
      WHERE pb.barcode = p_barcode
      LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      NULL; -- table doesn't exist, skip
    END;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Barcode not recognized: ' || p_barcode,
      'code', 'UNKNOWN_BARCODE'
    );
  END IF;

  SELECT * INTO v_exec_line
  FROM public.outbound_execution_lines
  WHERE session_id = v_session.id AND product_id = v_product.id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Product not in this invoice',
      'code', 'NOT_IN_INVOICE'
    );
  END IF;

  v_new_qty := v_exec_line.qty_scanned + p_qty;
  IF v_new_qty > v_exec_line.qty_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Over-scan: need ' || v_exec_line.qty_required || ', already scanned ' || v_exec_line.qty_scanned,
      'code', 'OVER_SCAN',
      'qty_required', v_exec_line.qty_required,
      'qty_scanned',  v_exec_line.qty_scanned
    );
  END IF;

  UPDATE public.outbound_execution_lines
  SET qty_scanned = v_new_qty,
      scanned_by  = auth.uid(),
      picked_at   = COALESCE(picked_at, now())
  WHERE id = v_exec_line.id;

  INSERT INTO public.outbound_scan_events (session_id, invoice_id, product_id, barcode, qty, scanned_by)
  VALUES (v_session.id, p_invoice_id, v_product.id, p_barcode, p_qty, auth.uid());

  RETURN jsonb_build_object(
    'success',       true,
    'product_id',    v_product.id,
    'qty_scanned',   v_new_qty,
    'qty_required',  v_exec_line.qty_required,
    'remaining',     v_exec_line.qty_required - v_new_qty,
    'line_complete', v_new_qty >= v_exec_line.qty_required
  );
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 6. RPC: confirm_picking_done
-- Validates all lines complete → marks invoice done
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_picking_done(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header    record;
  v_session   record;
  v_incomplete record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_header FROM public.sales_headers WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Invoice not found'); END IF;
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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not all items scanned. Complete picking first.',
      'code', 'INCOMPLETE'
    );
  END IF;

  UPDATE public.outbound_execution_sessions
  SET status = 'completed', confirmed_by = auth.uid(), confirmed_at = now()
  WHERE id = v_session.id;

  UPDATE public.outbound_execution_lines
  SET qty_confirmed = qty_scanned, confirmed_by = auth.uid(), loaded_at = now()
  WHERE session_id = v_session.id;

  UPDATE public.sales_headers
  SET status = 'done', done_at = now(), done_by = auth.uid()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'status', 'done');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 7. RLS / Grants
-- ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.outbound_execution_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.outbound_execution_lines    TO authenticated;
GRANT SELECT, INSERT         ON public.outbound_scan_events        TO authenticated;

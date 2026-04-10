-- ═══════════════════════════════════════════════════════════════════
-- Phase C: Schema alignment
-- Maps live DB (grn_headers/grn_lines/sales_headers) to codebase
-- expectations (receiving_headers/receiving_lines + invoice lifecycle)
-- Applied: 2026-04-02
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. grn_headers: add missing columns + receiving_headers view
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE public.grn_headers
  ADD COLUMN IF NOT EXISTS supplier_name              TEXT,
  ADD COLUMN IF NOT EXISTS transport_mode             TEXT,
  ADD COLUMN IF NOT EXISTS inspected_by               UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS inspected_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS municipality_reference_no  TEXT,
  ADD COLUMN IF NOT EXISTS municipality_notes         TEXT,
  ADD COLUMN IF NOT EXISTS municipality_submitted_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS municipality_submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS municipality_approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS municipality_approved_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_by                UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at                TIMESTAMPTZ;

UPDATE public.grn_headers g
SET supplier_name = s.name
FROM public.suppliers s
WHERE s.id = g.supplier_id AND g.supplier_name IS NULL;

DROP VIEW IF EXISTS public.receiving_headers CASCADE;
CREATE VIEW public.receiving_headers AS SELECT * FROM public.grn_headers;

-- ───────────────────────────────────────────────────────────────────
-- 2. grn_lines: add columns + receiving_lines mapped view
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE public.grn_lines
  ADD COLUMN IF NOT EXISTS production_date      DATE,
  ADD COLUMN IF NOT EXISTS qc_reason            TEXT,
  ADD COLUMN IF NOT EXISTS qc_checked_quantity  NUMERIC(12,3);

DO $$
BEGIN
  ALTER TABLE public.grn_lines
    ADD CONSTRAINT grn_lines_qc_status_check
    CHECK (qc_status IN ('pending','passed','rejected','hold'));
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;

DROP VIEW IF EXISTS public.receiving_lines CASCADE;
CREATE VIEW public.receiving_lines AS
SELECT
  id,
  grn_id            AS header_id,
  line_no,
  product_id,
  batch_no,
  expiry_date,
  production_date,
  qty_ordered       AS quantity,
  qty_received      AS received_quantity,
  unit_cost,
  qc_status,
  qc_reason,
  qc_notes,
  qc_checked_quantity,
  qc_inspected_by,
  qc_inspected_at,
  notes,
  created_at
FROM public.grn_lines;

CREATE OR REPLACE FUNCTION public.fn_receiving_lines_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.grn_lines (
    grn_id, line_no, product_id, batch_no, expiry_date,
    production_date, qty_ordered, qty_received, unit_cost,
    qc_status, qc_reason, qc_notes, qc_checked_quantity,
    qc_inspected_by, qc_inspected_at, notes
  ) VALUES (
    NEW.header_id, NEW.line_no, NEW.product_id, NEW.batch_no, NEW.expiry_date,
    NEW.production_date, COALESCE(NEW.quantity,0), COALESCE(NEW.received_quantity,0), COALESCE(NEW.unit_cost,0),
    COALESCE(NEW.qc_status,'pending'), NEW.qc_reason, NEW.qc_notes, NEW.qc_checked_quantity,
    NEW.qc_inspected_by, NEW.qc_inspected_at, NEW.notes
  ) RETURNING id INTO v_id;
  NEW.id := v_id;
  RETURN NEW;
END;$$;

CREATE OR REPLACE TRIGGER trg_receiving_lines_insert
INSTEAD OF INSERT ON public.receiving_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_receiving_lines_insert();

CREATE OR REPLACE FUNCTION public.fn_receiving_lines_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.grn_lines SET
    grn_id              = COALESCE(NEW.header_id,         OLD.header_id),
    line_no             = COALESCE(NEW.line_no,           OLD.line_no),
    product_id          = COALESCE(NEW.product_id,        OLD.product_id),
    batch_no            = NEW.batch_no,
    expiry_date         = NEW.expiry_date,
    production_date     = NEW.production_date,
    qty_ordered         = COALESCE(NEW.quantity,          OLD.quantity),
    qty_received        = COALESCE(NEW.received_quantity, OLD.received_quantity),
    unit_cost           = COALESCE(NEW.unit_cost,         OLD.unit_cost),
    qc_status           = COALESCE(NEW.qc_status,         OLD.qc_status),
    qc_reason           = NEW.qc_reason,
    qc_notes            = NEW.qc_notes,
    qc_checked_quantity = NEW.qc_checked_quantity,
    qc_inspected_by     = NEW.qc_inspected_by,
    qc_inspected_at     = NEW.qc_inspected_at,
    notes               = NEW.notes
  WHERE id = OLD.id;
  RETURN NEW;
END;$$;

CREATE OR REPLACE TRIGGER trg_receiving_lines_update
INSTEAD OF UPDATE ON public.receiving_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_receiving_lines_update();

CREATE OR REPLACE FUNCTION public.fn_receiving_lines_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM public.grn_lines WHERE id = OLD.id; RETURN OLD; END;$$;

CREATE OR REPLACE TRIGGER trg_receiving_lines_delete
INSTEAD OF DELETE ON public.receiving_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_receiving_lines_delete();

-- ───────────────────────────────────────────────────────────────────
-- 3. sales_lines: add discount
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE public.sales_lines
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12,3) NOT NULL DEFAULT 0;

-- ───────────────────────────────────────────────────────────────────
-- 4. sales_headers: invoice lifecycle statuses + audit columns
-- ───────────────────────────────────────────────────────────────────
UPDATE public.sales_headers SET status = 'ready' WHERE status = 'posted';

ALTER TABLE public.sales_headers DROP CONSTRAINT IF EXISTS sales_headers_status_check;
ALTER TABLE public.sales_headers
  ADD CONSTRAINT sales_headers_status_check
  CHECK (status IN ('draft','ready','done','received','cancelled','returns'));

ALTER TABLE public.sales_headers
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ready_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_by           UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS done_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS done_by            UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS received_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by        UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by       UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancel_reason      TEXT,
  ADD COLUMN IF NOT EXISTS cancel_approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS returns_at         TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_sales_headers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_sales_headers_updated_at ON public.sales_headers;
CREATE TRIGGER trg_sales_headers_updated_at
  BEFORE UPDATE ON public.sales_headers
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_headers_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- 5. post_sales_invoice: draft → ready
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_sales_header_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_header      record;
  v_line        record;
  v_batch       record;
  v_qty_needed  numeric(14,3);
  v_available   numeric(14,3);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_header FROM public.sales_headers WHERE id = p_sales_header_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales header not found'; END IF;
  IF v_header.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft invoices can be posted (current: %)', v_header.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_lines WHERE header_id = p_sales_header_id) THEN
    RAISE EXCEPTION 'Cannot post invoice without lines';
  END IF;
  FOR v_line IN SELECT * FROM public.sales_lines WHERE header_id = p_sales_header_id LOOP
    SELECT COALESCE(SUM(qty_available),0) INTO v_available
    FROM public.inventory_batches WHERE product_id = v_line.product_id;
    IF v_available < v_line.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % (need %, have %)',
        v_line.product_id, v_line.quantity, v_available;
    END IF;
  END LOOP;
  FOR v_line IN SELECT * FROM public.sales_lines WHERE header_id = p_sales_header_id ORDER BY line_no LOOP
    v_qty_needed := v_line.quantity;
    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE product_id = v_line.product_id AND qty_available > 0
      ORDER BY expiry_date ASC NULLS LAST, received_date ASC, created_at ASC FOR UPDATE
    LOOP
      EXIT WHEN v_qty_needed <= 0;
      DECLARE v_take numeric := LEAST(v_batch.qty_available, v_qty_needed);
      BEGIN
        INSERT INTO public.stock_movements
          (product_id,batch_id,movement_type,quantity,reference_table,reference_id,notes,moved_at,created_by)
        VALUES (v_line.product_id,v_batch.id,'sale_out',v_take,'sales_headers',p_sales_header_id,'Invoice posted',now(),auth.uid());
        UPDATE public.inventory_batches SET qty_available = qty_available - v_take WHERE id = v_batch.id;
        v_qty_needed := v_qty_needed - v_take;
      END;
    END LOOP;
    IF v_qty_needed > 0 THEN RAISE EXCEPTION 'FEFO allocation failed for product %', v_line.product_id; END IF;
  END LOOP;
  UPDATE public.sales_headers
  SET status='ready', ready_at=now(), ready_by=auth.uid()
  WHERE id=p_sales_header_id;
  RETURN jsonb_build_object('success',true,'status','ready','id',p_sales_header_id);
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 6. New lifecycle RPCs: done, received, cancel
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_invoice_done(p_header_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT status INTO v_status FROM public.sales_headers WHERE id=p_header_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Not found'); END IF;
  IF v_status <> 'ready' THEN RETURN jsonb_build_object('success',false,'error','Must be READY (current: '||v_status||')'); END IF;
  UPDATE public.sales_headers SET status='done',done_at=now(),done_by=auth.uid() WHERE id=p_header_id;
  RETURN jsonb_build_object('success',true,'status','done');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;$$;

CREATE OR REPLACE FUNCTION public.mark_invoice_received(p_header_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT status INTO v_status FROM public.sales_headers WHERE id=p_header_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Not found'); END IF;
  IF v_status <> 'done' THEN RETURN jsonb_build_object('success',false,'error','Must be DONE (current: '||v_status||')'); END IF;
  UPDATE public.sales_headers SET status='received',received_at=now(),received_by=auth.uid() WHERE id=p_header_id;
  RETURN jsonb_build_object('success',true,'status','received');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;$$;

CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_header_id uuid,
  p_reason    text,
  p_approver  uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_header record; v_days integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_header FROM public.sales_headers WHERE id=p_header_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Not found'); END IF;
  IF v_header.status IN ('cancelled','returns') THEN
    RETURN jsonb_build_object('success',false,'error','Already terminal: '||v_header.status);
  END IF;
  IF v_header.status = 'received' THEN
    v_days := EXTRACT(DAY FROM now() - v_header.received_at)::integer;
    IF v_days > 14 THEN
      RETURN jsonb_build_object('success',false,'error',
        'Received '||v_days||'d ago — use RETURNS workflow.','code','14_DAY_RULE');
    END IF;
  END IF;
  IF TRIM(COALESCE(p_reason,'')) = '' THEN
    RETURN jsonb_build_object('success',false,'error','Cancel reason required');
  END IF;
  UPDATE public.sales_headers SET
    status='cancelled', cancelled_at=now(), cancelled_by=auth.uid(),
    cancel_reason=TRIM(p_reason), cancel_approved_by=p_approver
  WHERE id=p_header_id;
  INSERT INTO public.audit_logs(action,entity_table,entity_id,old_data,new_data,description,performed_by)
  VALUES('invoice_cancelled','sales_headers',p_header_id,
    jsonb_build_object('status',v_header.status),
    jsonb_build_object('status','cancelled','reason',p_reason),
    'Invoice '||COALESCE(v_header.invoice_no,'?')||' cancelled', auth.uid());
  RETURN jsonb_build_object('success',true,'status','cancelled');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;$$;

-- ───────────────────────────────────────────────────────────────────
-- 7. Compatibility views
-- ───────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.inventory_product_stock_summary;
CREATE VIEW public.inventory_product_stock_summary AS
SELECT ib.product_id, p.storage_type,
  SUM(ib.qty_available) AS available_quantity,
  MIN(ib.expiry_date) FILTER (WHERE ib.expiry_date IS NOT NULL) AS nearest_expiry
FROM public.inventory_batches ib
JOIN public.products p ON p.id = ib.product_id
WHERE ib.qty_available > 0
GROUP BY ib.product_id, p.storage_type;

DROP VIEW IF EXISTS public.product_master;
CREATE VIEW public.product_master AS SELECT * FROM public.products;

DROP VIEW IF EXISTS public.sales_invoices;
CREATE VIEW public.sales_invoices AS
SELECT h.id, h.invoice_no AS invoice_number, h.invoice_date,
  h.customer_id, c.name AS customer_name,
  h.salesman_id, sm.name AS salesman_name,
  h.status, h.total_amount, h.notes, h.created_at, h.created_by, h.updated_at,
  h.ready_at, h.ready_by, h.done_at, h.done_by,
  h.received_at, h.received_by, h.cancelled_at, h.cancelled_by,
  h.cancel_reason, h.returns_at
FROM public.sales_headers h
LEFT JOIN public.customers c  ON c.id  = h.customer_id
LEFT JOIN public.salesmen  sm ON sm.id = h.salesman_id;

-- ───────────────────────────────────────────────────────────────────
-- 8. Grants
-- ───────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receiving_headers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receiving_lines   TO authenticated;
GRANT SELECT ON public.inventory_product_stock_summary           TO authenticated;
GRANT SELECT ON public.product_master                            TO authenticated;
GRANT SELECT ON public.sales_invoices                            TO authenticated;

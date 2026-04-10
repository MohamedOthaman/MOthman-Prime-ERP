ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS batch_no TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_batch_lookup
  ON public.invoice_lines (product_id, batch_no, expiry_date);

DROP POLICY IF EXISTS "Authenticated users can read inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "Authenticated users can read inventory_transactions"
ON public.inventory_transactions
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id UUID)
RETURNS public.invoice_headers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_header public.invoice_headers%ROWTYPE;
  v_line RECORD;
  v_available NUMERIC(12, 3);
BEGIN
  SELECT *
  INTO v_header
  FROM public.invoice_headers
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;

  IF v_header.status = 'approved' THEN
    RAISE EXCEPTION 'Invoice is already approved.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_transactions
    WHERE reference_type = 'INVOICE'
      AND reference_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Invoice stock posting already exists.';
  END IF;

  FOR v_line IN
    SELECT
      line.id,
      line.product_id,
      line.quantity,
      line.batch_no,
      line.expiry_date,
      product.code AS product_code,
      product.name AS product_name
    FROM public.invoice_lines AS line
    JOIN public.products AS product
      ON product.id = line.product_id
    WHERE line.header_id = p_invoice_id
    ORDER BY line.line_no
  LOOP
    IF NULLIF(BTRIM(COALESCE(v_line.batch_no, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Batch source is required for product %.', v_line.product_code;
    END IF;

    SELECT available_quantity
    INTO v_available
    FROM public.inventory_stock_by_batch
    WHERE product_id = v_line.product_id
      AND batch_no IS NOT DISTINCT FROM NULLIF(BTRIM(v_line.batch_no), '')
      AND expiry_date IS NOT DISTINCT FROM v_line.expiry_date;

    v_available := COALESCE(v_available, 0);

    IF v_available < v_line.quantity THEN
      RAISE EXCEPTION
        'Insufficient stock for % (%). Requested %, available % from batch %.',
        v_line.product_name,
        v_line.product_code,
        v_line.quantity,
        v_available,
        v_line.batch_no;
    END IF;
  END LOOP;

  INSERT INTO public.inventory_transactions (
    type,
    reference_type,
    reference_id,
    reference_line_id,
    product_id,
    quantity,
    batch_no,
    expiry_date
  )
  SELECT
    'OUT',
    'INVOICE',
    line.header_id,
    line.id,
    line.product_id,
    line.quantity,
    NULLIF(BTRIM(line.batch_no), ''),
    line.expiry_date
  FROM public.invoice_lines AS line
  WHERE line.header_id = p_invoice_id;

  UPDATE public.invoice_headers
  SET status = 'approved'
  WHERE id = p_invoice_id
  RETURNING *
  INTO v_header;

  RETURN v_header;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_invoice(UUID) TO authenticated;

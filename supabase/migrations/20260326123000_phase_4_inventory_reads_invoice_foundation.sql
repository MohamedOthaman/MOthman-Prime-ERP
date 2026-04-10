CREATE OR REPLACE VIEW public.inventory_stock_by_batch AS
SELECT
  product_id,
  NULLIF(BTRIM(COALESCE(batch_no, '')), '') AS batch_no,
  expiry_date,
  SUM(
    CASE
      WHEN type = 'IN' THEN quantity
      WHEN type = 'OUT' THEN -quantity
      ELSE quantity
    END
  ) AS available_quantity
FROM public.inventory_transactions
GROUP BY product_id, NULLIF(BTRIM(COALESCE(batch_no, '')), ''), expiry_date;

CREATE OR REPLACE VIEW public.inventory_stock_by_expiry AS
SELECT
  product_id,
  NULL::TEXT AS batch_no,
  expiry_date,
  SUM(
    CASE
      WHEN type = 'IN' THEN quantity
      WHEN type = 'OUT' THEN -quantity
      ELSE quantity
    END
  ) AS available_quantity
FROM public.inventory_transactions
GROUP BY product_id, expiry_date;

CREATE OR REPLACE VIEW public.inventory_stock_by_product AS
SELECT
  product_id,
  NULL::TEXT AS batch_no,
  NULL::DATE AS expiry_date,
  SUM(
    CASE
      WHEN type = 'IN' THEN quantity
      WHEN type = 'OUT' THEN -quantity
      ELSE quantity
    END
  ) AS available_quantity
FROM public.inventory_transactions
GROUP BY product_id;

CREATE TABLE IF NOT EXISTS public.invoice_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
  salesman_id UUID REFERENCES public.salesmen(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  header_id UUID NOT NULL REFERENCES public.invoice_headers(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL DEFAULT 1,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (quantity > 0),
  unit_price NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_lines_header_line_key UNIQUE (header_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_invoice_headers_customer_id
  ON public.invoice_headers (customer_id);

CREATE INDEX IF NOT EXISTS idx_invoice_headers_salesman_id
  ON public.invoice_headers (salesman_id);

CREATE INDEX IF NOT EXISTS idx_invoice_headers_status
  ON public.invoice_headers (status);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_header_id
  ON public.invoice_lines (header_id);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_product_id
  ON public.invoice_lines (product_id);

CREATE OR REPLACE FUNCTION public.set_invoice_headers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_invoice_headers_updated_at ON public.invoice_headers;
CREATE TRIGGER set_invoice_headers_updated_at
BEFORE UPDATE ON public.invoice_headers
FOR EACH ROW
EXECUTE FUNCTION public.set_invoice_headers_updated_at();

CREATE OR REPLACE FUNCTION public.guard_invoice_line_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_header_id UUID;
  target_status TEXT;
BEGIN
  target_header_id = COALESCE(NEW.header_id, OLD.header_id);

  SELECT status
  INTO target_status
  FROM public.invoice_headers
  WHERE id = target_header_id;

  IF target_status = 'approved' THEN
    RAISE EXCEPTION 'Approved invoice lines are read-only.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_invoice_line_mutation ON public.invoice_lines;
CREATE TRIGGER guard_invoice_line_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines
FOR EACH ROW
EXECUTE FUNCTION public.guard_invoice_line_mutation();

CREATE OR REPLACE FUNCTION public.guard_invoice_header_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Approved invoices are read-only.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_invoice_header_mutation ON public.invoice_headers;
CREATE TRIGGER guard_invoice_header_mutation
BEFORE UPDATE OR DELETE ON public.invoice_headers
FOR EACH ROW
EXECUTE FUNCTION public.guard_invoice_header_mutation();

ALTER TABLE public.invoice_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read invoice_headers" ON public.invoice_headers;
CREATE POLICY "Authenticated users can read invoice_headers"
ON public.invoice_headers
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authorized users can insert invoice_headers" ON public.invoice_headers;
CREATE POLICY "Authorized users can insert invoice_headers"
ON public.invoice_headers
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'sales_manager', 'accountant', 'invoice_team')
);

DROP POLICY IF EXISTS "Authorized users can update invoice_headers" ON public.invoice_headers;
CREATE POLICY "Authorized users can update invoice_headers"
ON public.invoice_headers
FOR UPDATE
TO authenticated
USING (
  public.get_user_role() IN ('admin', 'ops_manager', 'sales_manager', 'accountant', 'invoice_team')
)
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'sales_manager', 'accountant', 'invoice_team')
);

DROP POLICY IF EXISTS "Admins can delete invoice_headers" ON public.invoice_headers;
CREATE POLICY "Admins can delete invoice_headers"
ON public.invoice_headers
FOR DELETE
TO authenticated
USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Authenticated users can read invoice_lines" ON public.invoice_lines;
CREATE POLICY "Authenticated users can read invoice_lines"
ON public.invoice_lines
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authorized users can insert invoice_lines" ON public.invoice_lines;
CREATE POLICY "Authorized users can insert invoice_lines"
ON public.invoice_lines
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'sales_manager', 'accountant', 'invoice_team')
);

DROP POLICY IF EXISTS "Authorized users can update invoice_lines" ON public.invoice_lines;
CREATE POLICY "Authorized users can update invoice_lines"
ON public.invoice_lines
FOR UPDATE
TO authenticated
USING (
  public.get_user_role() IN ('admin', 'ops_manager', 'sales_manager', 'accountant', 'invoice_team')
)
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'sales_manager', 'accountant', 'invoice_team')
);

DROP POLICY IF EXISTS "Admins can delete invoice_lines" ON public.invoice_lines;
CREATE POLICY "Admins can delete invoice_lines"
ON public.invoice_lines
FOR DELETE
TO authenticated
USING (public.get_user_role() = 'admin');

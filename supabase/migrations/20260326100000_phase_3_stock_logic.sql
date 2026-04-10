CREATE TABLE IF NOT EXISTS public.stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id UUID,
  batch_no TEXT,
  expiry_date DATE,
  qty_received NUMERIC(12, 3) NOT NULL CHECK (qty_received >= 0),
  qty_available NUMERIC(12, 3) NOT NULL CHECK (qty_available >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_product_id
  ON public.stock_batches (product_id);

CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry_date
  ON public.stock_batches (expiry_date ASC);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUST')),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity >= 0),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('GRN', 'INVOICE', 'ADJUSTMENT')),
  reference_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
  ON public.stock_movements (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id
  ON public.stock_movements (product_id);

ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read stock_batches" ON public.stock_batches;
CREATE POLICY "Authenticated users can read stock_batches"
ON public.stock_batches
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authorized users can insert stock_batches" ON public.stock_batches;
CREATE POLICY "Authorized users can insert stock_batches"
ON public.stock_batches
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
);

DROP POLICY IF EXISTS "Authorized users can update stock_batches" ON public.stock_batches;
CREATE POLICY "Authorized users can update stock_batches"
ON public.stock_batches
FOR UPDATE
TO authenticated
USING (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
)
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
);

DROP POLICY IF EXISTS "Admins can delete stock_batches" ON public.stock_batches;
CREATE POLICY "Admins can delete stock_batches"
ON public.stock_batches
FOR DELETE
TO authenticated
USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Authenticated users can read stock_movements" ON public.stock_movements;
CREATE POLICY "Authenticated users can read stock_movements"
ON public.stock_movements
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authorized users can insert stock_movements" ON public.stock_movements;
CREATE POLICY "Authorized users can insert stock_movements"
ON public.stock_movements
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
);

DROP POLICY IF EXISTS "Authorized users can update stock_movements" ON public.stock_movements;
CREATE POLICY "Authorized users can update stock_movements"
ON public.stock_movements
FOR UPDATE
TO authenticated
USING (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
)
WITH CHECK (
  public.get_user_role() IN ('admin', 'ops_manager', 'purchase_manager', 'warehouse_manager')
);

DROP POLICY IF EXISTS "Admins can delete stock_movements" ON public.stock_movements;
CREATE POLICY "Admins can delete stock_movements"
ON public.stock_movements
FOR DELETE
TO authenticated
USING (public.get_user_role() = 'admin');

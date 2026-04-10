ALTER TABLE public.receiving_headers
  ADD COLUMN IF NOT EXISTS invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS arrival_date DATE,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

UPDATE public.receiving_headers
SET invoice_no = COALESCE(invoice_no, reference_no)
WHERE invoice_no IS NULL
  AND reference_no IS NOT NULL;

UPDATE public.receiving_headers
SET arrival_date = COALESCE(arrival_date, received_date, CURRENT_DATE)
WHERE arrival_date IS NULL;

UPDATE public.receiving_headers
SET status = CASE
  WHEN status = 'completed' THEN 'approved'
  WHEN status = 'cancelled' THEN 'rejected'
  ELSE status
END
WHERE status IN ('completed', 'cancelled');

UPDATE public.receiving_headers
SET approved_at = COALESCE(approved_at, created_at)
WHERE status = 'approved'
  AND approved_at IS NULL;

ALTER TABLE public.receiving_headers
  ALTER COLUMN arrival_date SET DEFAULT CURRENT_DATE;

ALTER TABLE public.receiving_headers
  ALTER COLUMN arrival_date SET NOT NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.receiving_headers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.receiving_headers DROP CONSTRAINT %I', constraint_name);
  END IF;
END
$$;

ALTER TABLE public.receiving_headers
  ADD CONSTRAINT receiving_headers_status_check
  CHECK (status IN ('draft', 'inspecting', 'approved', 'rejected'));

ALTER TABLE public.receiving_lines
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS batch_no TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

UPDATE public.receiving_lines
SET quantity = qty
WHERE quantity IS NULL;

UPDATE public.receiving_lines
SET notes = COALESCE(notes, remarks)
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'receiving_lines'
    AND column_name = 'remarks'
);

ALTER TABLE public.receiving_lines
  ALTER COLUMN quantity SET NOT NULL;

ALTER TABLE public.receiving_lines
  ALTER COLUMN quantity SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'receiving_lines_quantity_nonnegative'
  ) THEN
    ALTER TABLE public.receiving_lines
      ADD CONSTRAINT receiving_lines_quantity_nonnegative
      CHECK (quantity >= 0);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_receiving_line_compat_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quantity IS NULL AND NEW.qty IS NOT NULL THEN
    NEW.quantity = NEW.qty;
  END IF;

  IF NEW.qty IS NULL AND NEW.quantity IS NOT NULL THEN
    NEW.qty = NEW.quantity;
  END IF;

  IF NEW.notes IS NULL AND NEW.remarks IS NOT NULL THEN
    NEW.notes = NEW.remarks;
  END IF;

  IF NEW.remarks IS NULL AND NEW.notes IS NOT NULL THEN
    NEW.remarks = NEW.notes;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_receiving_line_compat_columns ON public.receiving_lines;
CREATE TRIGGER sync_receiving_line_compat_columns
BEFORE INSERT OR UPDATE ON public.receiving_lines
FOR EACH ROW
EXECUTE FUNCTION public.sync_receiving_line_compat_columns();

CREATE OR REPLACE FUNCTION public.guard_receiving_header_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Approved or rejected receiving records are read-only.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_receiving_header_mutation ON public.receiving_headers;
CREATE TRIGGER guard_receiving_header_mutation
BEFORE UPDATE OR DELETE ON public.receiving_headers
FOR EACH ROW
EXECUTE FUNCTION public.guard_receiving_header_mutation();

CREATE OR REPLACE FUNCTION public.guard_receiving_line_mutation()
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
  FROM public.receiving_headers
  WHERE id = target_header_id;

  IF target_status IS NOT NULL AND target_status NOT IN ('draft', 'inspecting') THEN
    RAISE EXCEPTION 'Receiving lines can only be changed while the header is draft or inspecting.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_receiving_line_mutation ON public.receiving_lines;
CREATE TRIGGER guard_receiving_line_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.receiving_lines
FOR EACH ROW
EXECUTE FUNCTION public.guard_receiving_line_mutation();

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  reference_line_id UUID REFERENCES public.receiving_lines(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  batch_no TEXT,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference
  ON public.inventory_transactions (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_id
  ON public.inventory_transactions (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_expiry
  ON public.inventory_transactions (expiry_date ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_transactions_reference_line
  ON public.inventory_transactions (reference_type, reference_id, reference_line_id, type)
  WHERE reference_line_id IS NOT NULL;

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read inventory_transactions" ON public.inventory_transactions;
CREATE POLICY "Authenticated users can read inventory_transactions"
ON public.inventory_transactions
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.create_receiving_inventory_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
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
      'IN',
      'GRN',
      NEW.id,
      line.id,
      line.product_id,
      line.quantity,
      NULLIF(BTRIM(line.batch_no), ''),
      line.expiry_date
    FROM public.receiving_lines AS line
    WHERE line.header_id = NEW.id
      AND line.product_id IS NOT NULL
      AND line.quantity > 0
    ON CONFLICT (reference_type, reference_id, reference_line_id, type) DO NOTHING;

    NEW.approved_at = COALESCE(NEW.approved_at, now());
  ELSIF NEW.status <> 'approved' THEN
    NEW.approved_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_receiving_inventory_transactions ON public.receiving_headers;
CREATE TRIGGER create_receiving_inventory_transactions
BEFORE UPDATE ON public.receiving_headers
FOR EACH ROW
EXECUTE FUNCTION public.create_receiving_inventory_transactions();

INSERT INTO public.inventory_transactions (
  type,
  reference_type,
  reference_id,
  reference_line_id,
  product_id,
  quantity,
  batch_no,
  expiry_date,
  created_at
)
SELECT
  'IN',
  'GRN',
  header.id,
  line.id,
  line.product_id,
  line.quantity,
  NULLIF(BTRIM(line.batch_no), ''),
  line.expiry_date,
  COALESCE(header.approved_at, header.created_at)
FROM public.receiving_headers AS header
JOIN public.receiving_lines AS line
  ON line.header_id = header.id
WHERE header.status = 'approved'
  AND line.product_id IS NOT NULL
  AND line.quantity > 0
ON CONFLICT (reference_type, reference_id, reference_line_id, type) DO NOTHING;

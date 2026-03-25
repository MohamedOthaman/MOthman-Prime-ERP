CREATE TABLE IF NOT EXISTS public.receiving_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_no TEXT NOT NULL UNIQUE,
  supplier_id UUID,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'cancelled')),
  reference_no TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'suppliers'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'receiving_headers_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.receiving_headers
      ADD CONSTRAINT receiving_headers_supplier_id_fkey
      FOREIGN KEY (supplier_id)
      REFERENCES public.suppliers(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.receiving_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  header_id UUID NOT NULL REFERENCES public.receiving_headers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  line_no INTEGER NOT NULL DEFAULT 1,
  product_code TEXT,
  product_name TEXT NOT NULL DEFAULT '',
  qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'PCS',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receiving_headers_status
  ON public.receiving_headers (status);

CREATE INDEX IF NOT EXISTS idx_receiving_headers_supplier_id
  ON public.receiving_headers (supplier_id);

CREATE INDEX IF NOT EXISTS idx_receiving_lines_header_id
  ON public.receiving_lines (header_id);

CREATE OR REPLACE FUNCTION public.set_receiving_headers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_receiving_headers_updated_at ON public.receiving_headers;
CREATE TRIGGER set_receiving_headers_updated_at
BEFORE UPDATE ON public.receiving_headers
FOR EACH ROW
EXECUTE FUNCTION public.set_receiving_headers_updated_at();

ALTER TABLE public.receiving_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read receiving_headers" ON public.receiving_headers;
CREATE POLICY "Authenticated users can read receiving_headers"
ON public.receiving_headers
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert receiving_headers" ON public.receiving_headers;
CREATE POLICY "Authenticated users can insert receiving_headers"
ON public.receiving_headers
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update receiving_headers" ON public.receiving_headers;
CREATE POLICY "Authenticated users can update receiving_headers"
ON public.receiving_headers
FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete receiving_headers" ON public.receiving_headers;
CREATE POLICY "Authenticated users can delete receiving_headers"
ON public.receiving_headers
FOR DELETE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can read receiving_lines" ON public.receiving_lines;
CREATE POLICY "Authenticated users can read receiving_lines"
ON public.receiving_lines
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert receiving_lines" ON public.receiving_lines;
CREATE POLICY "Authenticated users can insert receiving_lines"
ON public.receiving_lines
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update receiving_lines" ON public.receiving_lines;
CREATE POLICY "Authenticated users can update receiving_lines"
ON public.receiving_lines
FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete receiving_lines" ON public.receiving_lines;
CREATE POLICY "Authenticated users can delete receiving_lines"
ON public.receiving_lines
FOR DELETE
TO authenticated
USING (true);

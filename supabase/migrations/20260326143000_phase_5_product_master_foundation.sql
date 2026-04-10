ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_code TEXT,
  ADD COLUMN IF NOT EXISTS internal_code TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS uom TEXT,
  ADD COLUMN IF NOT EXISTS pack_size TEXT;

UPDATE public.products
SET
  item_code = COALESCE(NULLIF(BTRIM(item_code), ''), code),
  name_en = COALESCE(NULLIF(BTRIM(name_en), ''), name)
WHERE item_code IS NULL
   OR BTRIM(item_code) = ''
   OR name_en IS NULL
   OR BTRIM(name_en) = '';

ALTER TABLE public.products
  ALTER COLUMN item_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_item_code_unique
  ON public.products (item_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_internal_code_unique
  ON public.products (internal_code)
  WHERE internal_code IS NOT NULL AND BTRIM(internal_code) <> '';

CREATE INDEX IF NOT EXISTS idx_products_category
  ON public.products (category);

CREATE INDEX IF NOT EXISTS idx_products_country
  ON public.products (country);

CREATE INDEX IF NOT EXISTS idx_products_uom
  ON public.products (uom);

CREATE INDEX IF NOT EXISTS idx_products_pack_size
  ON public.products (pack_size);

CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_barcodes_product_barcode_key UNIQUE (product_id, barcode)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcodes_barcode_unique
  ON public.product_barcodes (barcode);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id
  ON public.product_barcodes (product_id);

CREATE TABLE IF NOT EXISTS public.product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  cost_price NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  discount NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  price_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_prices_product_id_key UNIQUE (product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_prices_product_id
  ON public.product_prices (product_id);

CREATE OR REPLACE FUNCTION public.set_product_prices_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_product_prices_updated_at ON public.product_prices;
CREATE TRIGGER set_product_prices_updated_at
BEFORE UPDATE ON public.product_prices
FOR EACH ROW
EXECUTE FUNCTION public.set_product_prices_updated_at();

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read product_barcodes" ON public.product_barcodes;
CREATE POLICY "Authenticated users can read product_barcodes"
ON public.product_barcodes
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert product_barcodes" ON public.product_barcodes;
CREATE POLICY "Authenticated users can insert product_barcodes"
ON public.product_barcodes
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update product_barcodes" ON public.product_barcodes;
CREATE POLICY "Authenticated users can update product_barcodes"
ON public.product_barcodes
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete product_barcodes" ON public.product_barcodes;
CREATE POLICY "Authenticated users can delete product_barcodes"
ON public.product_barcodes
FOR DELETE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can read product_prices" ON public.product_prices;
CREATE POLICY "Authenticated users can read product_prices"
ON public.product_prices
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert product_prices" ON public.product_prices;
CREATE POLICY "Authenticated users can insert product_prices"
ON public.product_prices
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update product_prices" ON public.product_prices;
CREATE POLICY "Authenticated users can update product_prices"
ON public.product_prices
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete product_prices" ON public.product_prices;
CREATE POLICY "Authenticated users can delete product_prices"
ON public.product_prices
FOR DELETE
TO authenticated
USING (true);

INSERT INTO public.product_barcodes (product_id, barcode, is_primary, source)
SELECT
  product.id,
  barcode.value,
  barcode.ordinality = 1,
  'products_array_backfill'
FROM public.products AS product
CROSS JOIN LATERAL unnest(COALESCE(product.barcodes, ARRAY[]::TEXT[])) WITH ORDINALITY AS barcode(value, ordinality)
WHERE NULLIF(BTRIM(barcode.value), '') IS NOT NULL
ON CONFLICT (product_id, barcode) DO NOTHING;

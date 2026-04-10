ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_code TEXT,
  ADD COLUMN IF NOT EXISTS internal_code TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_ar TEXT,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS country_of_origin TEXT,
  ADD COLUMN IF NOT EXISTS uom TEXT,
  ADD COLUMN IF NOT EXISTS pack_size TEXT,
  ADD COLUMN IF NOT EXISTS packaging TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS storage_type TEXT NOT NULL DEFAULT 'Dry',
  ADD COLUMN IF NOT EXISTS carton_holds INTEGER,
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.products
SET
  item_code = COALESCE(NULLIF(BTRIM(item_code), ''), code),
  name_en = COALESCE(NULLIF(BTRIM(name_en), ''), name),
  name = COALESCE(NULLIF(BTRIM(name), ''), NULLIF(BTRIM(name_en), ''), NULLIF(BTRIM(name_ar), ''), code)
WHERE item_code IS NULL
   OR BTRIM(item_code) = ''
   OR name_en IS NULL
   OR BTRIM(name_en) = ''
   OR name IS NULL
   OR BTRIM(name) = '';

ALTER TABLE public.products
  ALTER COLUMN item_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_item_code_unique
  ON public.products (item_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_internal_code_unique
  ON public.products (internal_code)
  WHERE internal_code IS NOT NULL AND BTRIM(internal_code) <> '';

CREATE INDEX IF NOT EXISTS idx_products_section
  ON public.products (section);

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
  'phase_11_backfill'
FROM public.products AS product
CROSS JOIN LATERAL unnest(COALESCE(product.barcodes, ARRAY[]::TEXT[])) WITH ORDINALITY AS barcode(value, ordinality)
WHERE NULLIF(BTRIM(barcode.value), '') IS NOT NULL
ON CONFLICT (product_id, barcode) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_no TEXT NOT NULL,
  qty NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  unit TEXT NOT NULL DEFAULT 'CTN',
  production_date DATE,
  expiry_date DATE NOT NULL,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.batches
  ALTER COLUMN qty TYPE NUMERIC(12, 3) USING qty::NUMERIC(12, 3),
  ALTER COLUMN unit SET DEFAULT 'CTN';

CREATE INDEX IF NOT EXISTS idx_batches_product_expiry
  ON public.batches (product_id, expiry_date ASC);

CREATE INDEX IF NOT EXISTS idx_batches_product_batch_expiry
  ON public.batches (product_id, batch_no, expiry_date);

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read batches" ON public.batches;
CREATE POLICY "Authenticated users can read batches"
ON public.batches
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert batches" ON public.batches;
CREATE POLICY "Authenticated users can insert batches"
ON public.batches
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update batches" ON public.batches;
CREATE POLICY "Authenticated users can update batches"
ON public.batches
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete batches" ON public.batches;
CREATE POLICY "Authenticated users can delete batches"
ON public.batches
FOR DELETE
TO authenticated
USING (true);

DROP VIEW IF EXISTS public.products_overview;

CREATE OR REPLACE VIEW public.products_overview AS
SELECT
  p.id,
  p.item_code,
  p.code,
  p.internal_code,
  p.name,
  p.name_ar,
  p.name_en,
  p.category,
  p.brand,
  p.section,
  p.brand_id,
  p.country,
  p.country_of_origin,
  p.uom,
  p.pack_size,
  p.packaging,
  p.storage_type,
  p.carton_holds,
  p.image_path,
  p.is_active,
  p.created_at,
  p.updated_at,
  (
    SELECT barcode
    FROM public.product_barcodes
    WHERE product_id = p.id AND is_primary = true
    LIMIT 1
  ) AS primary_barcode,
  COALESCE(
    (
      SELECT array_agg(barcode ORDER BY is_primary DESC, barcode)
      FROM public.product_barcodes
      WHERE product_id = p.id
    ),
    ARRAY[]::TEXT[]
  ) AS all_barcodes,
  pp.cost_price,
  pp.selling_price,
  pp.discount,
  pp.price_source
FROM public.products p
LEFT JOIN public.product_prices pp
  ON pp.product_id = p.id;

CREATE OR REPLACE FUNCTION public.create_product_full(
  p_item_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT,
  p_category TEXT,
  p_uom TEXT,
  p_storage_type TEXT,
  p_barcodes TEXT[],
  p_cost_price NUMERIC,
  p_selling_price NUMERIC,
  p_discount NUMERIC,
  p_barcode_source TEXT DEFAULT 'manual',
  p_price_source TEXT DEFAULT 'manual'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_barcode TEXT;
  v_is_primary BOOLEAN;
BEGIN
  INSERT INTO public.products (
    item_code,
    code,
    name_ar,
    name_en,
    name,
    category,
    uom,
    storage_type,
    is_active
  ) VALUES (
    p_item_code,
    p_item_code,
    p_name_ar,
    p_name_en,
    COALESCE(NULLIF(BTRIM(p_name_en), ''), NULLIF(BTRIM(p_name_ar), ''), p_item_code),
    p_category,
    p_uom,
    p_storage_type,
    true
  ) RETURNING id INTO v_product_id;

  INSERT INTO public.product_prices (
    product_id,
    cost_price,
    selling_price,
    discount,
    price_source
  ) VALUES (
    v_product_id,
    COALESCE(p_cost_price, 0),
    COALESCE(p_selling_price, 0),
    COALESCE(p_discount, 0),
    p_price_source
  )
  ON CONFLICT (product_id) DO UPDATE
  SET
    cost_price = EXCLUDED.cost_price,
    selling_price = EXCLUDED.selling_price,
    discount = EXCLUDED.discount,
    price_source = EXCLUDED.price_source,
    updated_at = now();

  v_is_primary := true;
  IF array_length(p_barcodes, 1) > 0 THEN
    FOREACH v_barcode IN ARRAY p_barcodes
    LOOP
      IF NULLIF(BTRIM(v_barcode), '') IS NOT NULL THEN
        INSERT INTO public.product_barcodes (
          product_id,
          barcode,
          is_primary,
          source
        ) VALUES (
          v_product_id,
          v_barcode,
          v_is_primary,
          p_barcode_source
        )
        ON CONFLICT (product_id, barcode) DO UPDATE
        SET
          is_primary = EXCLUDED.is_primary,
          source = EXCLUDED.source;

        v_is_primary := false;
      END IF;
    END LOOP;
  END IF;

  RETURN v_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_full(
  p_product_id UUID,
  p_item_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT,
  p_category TEXT,
  p_uom TEXT,
  p_storage_type TEXT,
  p_barcodes TEXT[],
  p_cost_price NUMERIC,
  p_selling_price NUMERIC,
  p_discount NUMERIC,
  p_is_active BOOLEAN DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barcode TEXT;
  v_is_primary BOOLEAN;
BEGIN
  UPDATE public.products
  SET
    item_code = p_item_code,
    code = COALESCE(NULLIF(BTRIM(code), ''), p_item_code),
    name_ar = p_name_ar,
    name_en = p_name_en,
    name = COALESCE(NULLIF(BTRIM(p_name_en), ''), NULLIF(BTRIM(p_name_ar), ''), p_item_code),
    category = p_category,
    uom = p_uom,
    storage_type = p_storage_type,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO public.product_prices (product_id, cost_price, selling_price, discount, price_source)
  VALUES (p_product_id, COALESCE(p_cost_price, 0), COALESCE(p_selling_price, 0), COALESCE(p_discount, 0), 'manual_update')
  ON CONFLICT (product_id) DO UPDATE
  SET
    cost_price = EXCLUDED.cost_price,
    selling_price = EXCLUDED.selling_price,
    discount = EXCLUDED.discount,
    price_source = EXCLUDED.price_source,
    updated_at = now();

  DELETE FROM public.product_barcodes
  WHERE product_id = p_product_id;

  v_is_primary := true;
  IF array_length(p_barcodes, 1) > 0 THEN
    FOREACH v_barcode IN ARRAY p_barcodes
    LOOP
      IF NULLIF(BTRIM(v_barcode), '') IS NOT NULL THEN
        INSERT INTO public.product_barcodes (
          product_id,
          barcode,
          is_primary,
          source
        ) VALUES (
          p_product_id,
          v_barcode,
          v_is_primary,
          'manual_update'
        )
        ON CONFLICT (product_id, barcode) DO UPDATE
        SET
          is_primary = EXCLUDED.is_primary,
          source = EXCLUDED.source;

        v_is_primary := false;
      END IF;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_product_full(
  p_item_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT,
  p_barcode TEXT,
  p_barcode_source TEXT DEFAULT 'manual',
  p_cost_price NUMERIC DEFAULT 0,
  p_selling_price NUMERIC DEFAULT 0,
  p_discount NUMERIC DEFAULT 0,
  p_price_source TEXT DEFAULT 'manual'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_product_full(
    p_item_code,
    p_name_ar,
    p_name_en,
    NULL,
    NULL,
    NULL,
    CASE
      WHEN NULLIF(BTRIM(p_barcode), '') IS NULL THEN ARRAY[]::TEXT[]
      ELSE ARRAY[p_barcode]::TEXT[]
    END,
    p_cost_price,
    p_selling_price,
    p_discount,
    p_barcode_source,
    p_price_source
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_full(
  p_product_id UUID,
  p_item_code TEXT,
  p_name_ar TEXT,
  p_name_en TEXT,
  p_barcode TEXT,
  p_cost_price NUMERIC DEFAULT 0,
  p_selling_price NUMERIC DEFAULT 0,
  p_discount NUMERIC DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.update_product_full(
    p_product_id,
    p_item_code,
    p_name_ar,
    p_name_en,
    NULL,
    NULL,
    NULL,
    CASE
      WHEN NULLIF(BTRIM(p_barcode), '') IS NULL THEN ARRAY[]::TEXT[]
      ELSE ARRAY[p_barcode]::TEXT[]
    END,
    p_cost_price,
    p_selling_price,
    p_discount,
    NULL
  );
END;
$$;

GRANT SELECT ON public.products_overview TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_prices TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_full(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_full(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], NUMERIC, NUMERIC, NUMERIC, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_full(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_full(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END
$$;

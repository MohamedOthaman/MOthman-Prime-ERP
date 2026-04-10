-- Phase 7: Product Master Integration & RPCs

-- Ensure storage_type exists in products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS storage_type TEXT;

-- Replace products_overview view to include all required display columns
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
  p.country,
  p.uom,
  p.storage_type,
  p.pack_size,
  p.is_active,
  p.created_at,
  (
    SELECT barcode 
    FROM public.product_barcodes 
    WHERE product_id = p.id AND is_primary = true 
    LIMIT 1
  ) AS primary_barcode,
  COALESCE(
    (
      SELECT array_agg(b.barcode)
      FROM public.product_barcodes b
      WHERE b.product_id = p.id
    ),
    ARRAY[]::TEXT[]
  ) AS all_barcodes,
  pp.cost_price,
  pp.selling_price,
  pp.discount
FROM public.products p
LEFT JOIN public.product_prices pp ON pp.product_id = p.id;

-- Create RPC for inserting full product
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
AS $$
DECLARE
  v_product_id UUID;
  v_barcode TEXT;
  v_is_primary BOOLEAN;
BEGIN
  INSERT INTO public.products (
    item_code,
    name_ar,
    name_en,
    name,
    category,
    uom,
    storage_type,
    is_active
  ) VALUES (
    p_item_code,
    p_name_ar,
    p_name_en,
    COALESCE(NULLIF(BTRIM(p_name_en), ''), p_name_ar),
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
  );

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
        ) ON CONFLICT DO NOTHING;
        v_is_primary := false;
      END IF;
    END LOOP;
  END IF;

  RETURN v_product_id;
END;
$$;

-- Create RPC for updating full product
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
AS $$
DECLARE
  v_barcode TEXT;
  v_is_primary BOOLEAN;
BEGIN
  UPDATE public.products
  SET
    item_code = p_item_code,
    name_ar = p_name_ar,
    name_en = p_name_en,
    name = COALESCE(NULLIF(BTRIM(p_name_en), ''), p_name_ar),
    category = p_category,
    uom = p_uom,
    storage_type = p_storage_type,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_product_id;

  UPDATE public.product_prices
  SET
    cost_price = COALESCE(p_cost_price, 0),
    selling_price = COALESCE(p_selling_price, 0),
    discount = COALESCE(p_discount, 0),
    updated_at = now()
  WHERE product_id = p_product_id;

  IF NOT FOUND THEN
    INSERT INTO public.product_prices (product_id, cost_price, selling_price, discount, price_source)
    VALUES (p_product_id, COALESCE(p_cost_price, 0), COALESCE(p_selling_price, 0), COALESCE(p_discount, 0), 'manual_update');
  END IF;

  DELETE FROM public.product_barcodes WHERE product_id = p_product_id;

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
        ) ON CONFLICT DO NOTHING;
        v_is_primary := false;
      END IF;
    END LOOP;
  END IF;

END;
$$;

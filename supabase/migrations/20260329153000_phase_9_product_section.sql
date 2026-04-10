ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS section TEXT;

CREATE INDEX IF NOT EXISTS idx_products_section
  ON public.products (section);

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

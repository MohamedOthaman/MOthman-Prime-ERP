ALTER TABLE public.salesmen
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND public.get_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can change user roles.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_role_change ON public.profiles;
CREATE TRIGGER guard_profile_role_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_role_change();

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

-- ═══════════════════════════════════════════════════════════════════════════
-- upsert_product_master — ONE atomic canonical product-master write
-- ═══════════════════════════════════════════════════════════════════════════
-- STATUS: REVIEWED-MIGRATION, NOT YET APPLIED TO PRODUCTION.
-- Problem (see docs/DIAGNOSIS_product_image_sync.md): product create/edit ran
-- as 4+ separate RLS-gated round-trips. create_product_full (definer) created
-- a BARE row (item_code/name only); the follow-up direct writes to products/
-- product_prices/product_barcodes silently no-opped under USING-only UPDATE
-- RLS or threw after the row already existed — producing half-configured
-- products (uom/category null) and an operation stuck "failed to sync".
--
-- This replaces that chain with ONE transaction. It:
--   • checks permission explicitly and RAISES a clear error on denial (no
--     silent 0-row "fake success");
--   • upserts the product by item_code (idempotent — safe for outbox replay,
--     cannot create duplicates);
--   • replaces the product's barcodes and its 'default' price;
--   • sets every metadata field the form collects, including image_path;
--   • is SECURITY DEFINER so it performs the writes regardless of the
--     per-table RLS role matrix, AFTER the single central role check.
--
-- Safety: additive (new function). Reversible: DROP FUNCTION
-- public.upsert_product_master(...). No existing object is dropped or altered.
-- Does NOT touch stock/quantities. anon EXECUTE is revoked.

CREATE OR REPLACE FUNCTION public.upsert_product_master(
  p_product_id   uuid,          -- null for create
  p_item_code    text,
  p_name_en      text,
  p_name_ar      text,
  p_brand        text,
  p_category     text,
  p_uom          text,
  p_packaging    text,
  p_storage_type text,
  p_pack_size    text,
  p_carton_holds integer,
  p_cost_price   numeric,
  p_selling_price numeric,
  p_discount     numeric,
  p_barcodes     text[],
  p_image_path   text,
  p_image_path_set boolean DEFAULT false, -- false preserves current image
  p_is_active    boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_role       text;
  v_id         uuid;
  v_name       text;
  v_barcode    text;
  v_idx        integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING errcode = '28000';
  END IF;

  IF COALESCE(TRIM(p_item_code),'') = '' THEN
    RAISE EXCEPTION 'Item code is required' USING errcode = '22004';
  END IF;

  v_name := COALESCE(NULLIF(TRIM(p_name_en),''), NULLIF(TRIM(p_name_ar),''), p_item_code);

  -- Resolve existing product: explicit id, else by item_code (idempotent).
  v_id := p_product_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.products WHERE item_code = p_item_code LIMIT 1;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid() AND is_active IS TRUE
  LIMIT 1;
  v_role := COALESCE(v_role, 'read_only');

  IF v_id IS NULL AND v_role NOT IN ('admin','owner','ops_manager','purchase','purchase_manager') THEN
    RAISE EXCEPTION 'Role % is not permitted to create products', v_role
      USING errcode = '42501';
  ELSIF v_id IS NOT NULL AND v_role NOT IN ('admin','owner','ops_manager','purchase','purchase_manager','manager') THEN
    RAISE EXCEPTION 'Role % is not permitted to update products', v_role
      USING errcode = '42501';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.products (
      item_code, code, name, name_en, name_ar, brand, category, uom,
      packaging, storage_type, pack_size, carton_holds, image_path, is_active
    ) VALUES (
      p_item_code, p_item_code, v_name, p_name_en, p_name_ar, p_brand, p_category, p_uom,
      COALESCE(NULLIF(TRIM(p_packaging),''), p_uom, ''), COALESCE(NULLIF(TRIM(p_storage_type),''),'Dry'),
      p_pack_size, p_carton_holds,
      CASE WHEN p_image_path_set THEN p_image_path ELSE NULL END,
      COALESCE(p_is_active, true)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.products SET
      item_code    = p_item_code,
      code         = p_item_code,
      name         = v_name,
      name_en      = p_name_en,
      name_ar      = p_name_ar,
      brand        = p_brand,
      category     = p_category,
      uom          = p_uom,
      packaging    = COALESCE(NULLIF(TRIM(p_packaging),''), p_uom, packaging),
      storage_type = COALESCE(NULLIF(TRIM(p_storage_type),''), storage_type),
      pack_size    = p_pack_size,
      carton_holds = p_carton_holds,
      image_path   = CASE WHEN p_image_path_set THEN p_image_path ELSE image_path END,
      is_active    = COALESCE(p_is_active, is_active),
      updated_at   = now()
    WHERE id = v_id;
  END IF;

  -- Reject conflicts before changing any barcode. The transaction rolls back
  -- and the client can show the conflicting barcode for human review.
  IF EXISTS (
    SELECT 1
    FROM public.product_barcodes
    WHERE barcode = ANY(COALESCE(p_barcodes, ARRAY[]::text[]))
      AND product_id <> v_id
  ) THEN
    RAISE EXCEPTION 'One or more barcodes already belong to another product'
      USING errcode = '23505';
  END IF;

  DELETE FROM public.product_barcodes WHERE product_id = v_id;
  IF p_barcodes IS NOT NULL THEN
    FOREACH v_barcode IN ARRAY p_barcodes LOOP
      v_barcode := NULLIF(TRIM(v_barcode), '');
      IF v_barcode IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.product_barcodes (product_id, barcode, is_primary, source)
      VALUES (v_id, v_barcode, v_idx = 0, 'manual');
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- Upsert the single price row (product_prices columns: cost_price /
  -- selling_price / discount / price_source — there is no price_type).
  IF EXISTS (SELECT 1 FROM public.product_prices WHERE product_id = v_id) THEN
    UPDATE public.product_prices
    SET cost_price    = COALESCE(p_cost_price, 0),
        selling_price = COALESCE(p_selling_price, 0),
        discount      = COALESCE(p_discount, 0),
        price_source  = 'manual',
        updated_at    = now()
    WHERE product_id = v_id;
  ELSE
    INSERT INTO public.product_prices (product_id, cost_price, selling_price, discount, price_source)
    VALUES (v_id, COALESCE(p_cost_price, 0), COALESCE(p_selling_price, 0), COALESCE(p_discount, 0), 'manual');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_id,
    'skipped_barcodes', '[]'::jsonb
  );
END;$$;

REVOKE EXECUTE ON FUNCTION public.upsert_product_master(uuid,text,text,text,text,text,text,text,text,text,integer,numeric,numeric,numeric,text[],text,boolean,boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.upsert_product_master(uuid,text,text,text,text,text,text,text,text,text,integer,numeric,numeric,numeric,text[],text,boolean,boolean) TO authenticated;

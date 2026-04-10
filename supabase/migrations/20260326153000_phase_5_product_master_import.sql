ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_path TEXT;

CREATE OR REPLACE FUNCTION public.import_food_choice_product_master(
  products_payload JSONB,
  barcodes_payload JSONB,
  prices_payload JSONB,
  review_item_codes JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE (
  processed_products INTEGER,
  inserted_products INTEGER,
  updated_products INTEGER,
  inserted_barcodes INTEGER,
  inserted_prices INTEGER,
  updated_prices INTEGER,
  skipped_review_items INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_count_before INTEGER := 0;
  barcode_count_before INTEGER := 0;
  price_count_before INTEGER := 0;
BEGIN
  IF COALESCE(jsonb_typeof(products_payload), 'null') <> 'array' THEN
    RAISE EXCEPTION 'products_payload must be a JSON array';
  END IF;

  IF COALESCE(jsonb_typeof(barcodes_payload), 'null') <> 'array' THEN
    RAISE EXCEPTION 'barcodes_payload must be a JSON array';
  END IF;

  IF COALESCE(jsonb_typeof(prices_payload), 'null') <> 'array' THEN
    RAISE EXCEPTION 'prices_payload must be a JSON array';
  END IF;

  IF COALESCE(jsonb_typeof(review_item_codes), 'null') <> 'array' THEN
    RAISE EXCEPTION 'review_item_codes must be a JSON array';
  END IF;

  CREATE TEMP TABLE tmp_review_items (
    item_code TEXT PRIMARY KEY
  ) ON COMMIT DROP;

  INSERT INTO tmp_review_items (item_code)
  SELECT DISTINCT UPPER(BTRIM(value))
  FROM jsonb_array_elements_text(review_item_codes)
  WHERE NULLIF(BTRIM(value), '') IS NOT NULL;

  CREATE TEMP TABLE tmp_products_import (
    item_code TEXT PRIMARY KEY,
    internal_code TEXT,
    name_en TEXT,
    name_ar TEXT,
    brand TEXT,
    category TEXT,
    country TEXT,
    uom TEXT,
    pack_size TEXT,
    image_path TEXT
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_products_import_raw (
    row_no BIGSERIAL PRIMARY KEY,
    item_code TEXT,
    internal_code TEXT,
    name_en TEXT,
    name_ar TEXT,
    brand TEXT,
    category TEXT,
    country TEXT,
    uom TEXT,
    pack_size TEXT,
    image_path TEXT
  ) ON COMMIT DROP;

  INSERT INTO tmp_products_import_raw (
    item_code,
    internal_code,
    name_en,
    name_ar,
    brand,
    category,
    country,
    uom,
    pack_size,
    image_path
  )
  SELECT
    UPPER(BTRIM(item_code)),
    NULLIF(BTRIM(internal_code), ''),
    NULLIF(BTRIM(name_en), ''),
    NULLIF(BTRIM(name_ar), ''),
    NULLIF(BTRIM(brand), ''),
    NULLIF(BTRIM(category), ''),
    NULLIF(BTRIM(country), ''),
    NULLIF(BTRIM(uom), ''),
    NULLIF(BTRIM(pack_size), ''),
    NULLIF(BTRIM(image_path), '')
  FROM jsonb_to_recordset(products_payload) AS x(
    item_code TEXT,
    internal_code TEXT,
    name_en TEXT,
    name_ar TEXT,
    brand TEXT,
    category TEXT,
    country TEXT,
    uom TEXT,
    pack_size TEXT,
    image_path TEXT
  );

  INSERT INTO tmp_products_import (
    item_code,
    internal_code,
    name_en,
    name_ar,
    brand,
    category,
    country,
    uom,
    pack_size,
    image_path
  )
  SELECT
    item_code,
    internal_code,
    name_en,
    name_ar,
    brand,
    category,
    country,
    uom,
    pack_size,
    image_path
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY item_code ORDER BY row_no) AS row_rank
    FROM tmp_products_import_raw
  ) AS product_rows
  WHERE row_rank = 1;

  IF EXISTS (
    SELECT 1
    FROM tmp_products_import
    WHERE item_code IS NULL
       OR BTRIM(item_code) = ''
       OR name_en IS NULL
       OR BTRIM(name_en) = ''
  ) THEN
    RAISE EXCEPTION 'products payload contains blank item_code or name_en';
  END IF;

  CREATE TEMP TABLE tmp_barcodes_import (
    item_code TEXT NOT NULL,
    barcode TEXT NOT NULL,
    barcode_source TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_barcodes_import_raw (
    row_no BIGSERIAL PRIMARY KEY,
    item_code TEXT,
    barcode TEXT,
    barcode_source TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false
  ) ON COMMIT DROP;

  INSERT INTO tmp_barcodes_import_raw (item_code, barcode, barcode_source, is_primary)
  SELECT
    UPPER(BTRIM(item_code)),
    BTRIM(barcode),
    NULLIF(BTRIM(barcode_source), ''),
    COALESCE(is_primary, false)
  FROM jsonb_to_recordset(barcodes_payload) AS x(
    item_code TEXT,
    barcode TEXT,
    barcode_source TEXT,
    is_primary BOOLEAN
  )
  WHERE NULLIF(BTRIM(item_code), '') IS NOT NULL
    AND NULLIF(BTRIM(barcode), '') IS NOT NULL;

  INSERT INTO tmp_barcodes_import (item_code, barcode, barcode_source, is_primary)
  SELECT
    item_code,
    barcode,
    barcode_source,
    is_primary
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY barcode ORDER BY row_no) AS row_rank
    FROM tmp_barcodes_import_raw
  ) AS barcode_rows
  WHERE row_rank = 1;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT barcode
      FROM tmp_barcodes_import
      GROUP BY barcode
      HAVING COUNT(DISTINCT item_code) > 1
    ) AS conflicts
  ) THEN
    RAISE EXCEPTION 'barcodes payload contains cross-product barcode conflicts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_barcodes_import barcode
    LEFT JOIN tmp_products_import product
      ON product.item_code = barcode.item_code
    LEFT JOIN tmp_review_items review
      ON review.item_code = barcode.item_code
    WHERE product.item_code IS NULL
      AND review.item_code IS NULL
  ) THEN
    RAISE EXCEPTION 'barcodes payload references unknown item_code';
  END IF;

  CREATE TEMP TABLE tmp_prices_import (
    item_code TEXT PRIMARY KEY,
    cost_price NUMERIC(12, 3) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12, 3) NOT NULL DEFAULT 0,
    discount NUMERIC(12, 3) NOT NULL DEFAULT 0,
    price_source TEXT
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_prices_import_raw (
    row_no BIGSERIAL PRIMARY KEY,
    item_code TEXT,
    cost_price NUMERIC(12, 3) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12, 3) NOT NULL DEFAULT 0,
    discount NUMERIC(12, 3) NOT NULL DEFAULT 0,
    price_source TEXT
  ) ON COMMIT DROP;

  INSERT INTO tmp_prices_import_raw (item_code, cost_price, selling_price, discount, price_source)
  SELECT
    UPPER(BTRIM(item_code)),
    COALESCE(cost_price, 0),
    COALESCE(selling_price, 0),
    COALESCE(discount, 0),
    NULLIF(BTRIM(price_source), '')
  FROM jsonb_to_recordset(prices_payload) AS x(
    item_code TEXT,
    cost_price NUMERIC,
    selling_price NUMERIC,
    discount NUMERIC,
    price_source TEXT
  )
  WHERE NULLIF(BTRIM(item_code), '') IS NOT NULL;

  INSERT INTO tmp_prices_import (item_code, cost_price, selling_price, discount, price_source)
  SELECT
    item_code,
    cost_price,
    selling_price,
    discount,
    price_source
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY item_code ORDER BY row_no) AS row_rank
    FROM tmp_prices_import_raw
  ) AS price_rows
  WHERE row_rank = 1;

  IF EXISTS (
    SELECT 1
    FROM tmp_prices_import
    WHERE cost_price < 0
       OR selling_price < 0
       OR discount < 0
  ) THEN
    RAISE EXCEPTION 'prices payload contains negative values';
  END IF;

  SELECT COUNT(*) INTO product_count_before
  FROM public.products product
  JOIN tmp_products_import staging
    ON staging.item_code = product.item_code;

  INSERT INTO public.products (
    item_code,
    internal_code,
    name_en,
    name,
    name_ar,
    brand,
    category,
    country,
    uom,
    pack_size,
    image_path
  )
  SELECT
    product.item_code,
    product.internal_code,
    product.name_en,
    product.name_en,
    product.name_ar,
    product.brand,
    product.category,
    product.country,
    product.uom,
    product.pack_size,
    product.image_path
  FROM tmp_products_import product
  LEFT JOIN tmp_review_items review
    ON review.item_code = product.item_code
  WHERE review.item_code IS NULL
  ON CONFLICT (item_code) DO UPDATE
  SET
    internal_code = COALESCE(EXCLUDED.internal_code, public.products.internal_code),
    name_en = EXCLUDED.name_en,
    name = EXCLUDED.name_en,
    name_ar = COALESCE(EXCLUDED.name_ar, public.products.name_ar),
    brand = COALESCE(EXCLUDED.brand, public.products.brand),
    category = COALESCE(EXCLUDED.category, public.products.category),
    country = COALESCE(EXCLUDED.country, public.products.country),
    uom = COALESCE(EXCLUDED.uom, public.products.uom),
    pack_size = COALESCE(EXCLUDED.pack_size, public.products.pack_size),
    image_path = COALESCE(EXCLUDED.image_path, public.products.image_path);

  IF EXISTS (
    SELECT 1
    FROM tmp_barcodes_import barcode
    JOIN public.product_barcodes existing_barcode
      ON existing_barcode.barcode = barcode.barcode
    JOIN public.products existing_product
      ON existing_product.id = existing_barcode.product_id
    WHERE existing_product.item_code <> barcode.item_code
  ) THEN
    RAISE EXCEPTION 'existing product_barcodes data conflicts with import payload';
  END IF;

  SELECT COUNT(*) INTO barcode_count_before
  FROM public.product_barcodes existing_barcode
  JOIN public.products existing_product
    ON existing_product.id = existing_barcode.product_id
  JOIN tmp_barcodes_import barcode
    ON barcode.barcode = existing_barcode.barcode
   AND barcode.item_code = existing_product.item_code;

  INSERT INTO public.product_barcodes (
    product_id,
    barcode,
    is_primary,
    source
  )
  SELECT
    product.id,
    barcode.barcode,
    barcode.is_primary,
    COALESCE(barcode.barcode_source, 'food_choice_import')
  FROM tmp_barcodes_import barcode
  JOIN public.products product
    ON product.item_code = barcode.item_code
  LEFT JOIN tmp_review_items review
    ON review.item_code = barcode.item_code
  WHERE review.item_code IS NULL
  ON CONFLICT (barcode) DO UPDATE
  SET
    is_primary = EXCLUDED.is_primary,
    source = EXCLUDED.source
  WHERE public.product_barcodes.product_id = EXCLUDED.product_id;

  SELECT COUNT(*) INTO price_count_before
  FROM public.product_prices existing_price
  JOIN public.products product
    ON product.id = existing_price.product_id
  JOIN tmp_prices_import staging
    ON staging.item_code = product.item_code;

  INSERT INTO public.product_prices (
    product_id,
    cost_price,
    selling_price,
    discount,
    price_source
  )
  SELECT
    product.id,
    price.cost_price,
    price.selling_price,
    price.discount,
    COALESCE(price.price_source, 'food_choice_import')
  FROM tmp_prices_import price
  JOIN public.products product
    ON product.item_code = price.item_code
  LEFT JOIN tmp_review_items review
    ON review.item_code = price.item_code
  WHERE review.item_code IS NULL
  ON CONFLICT (product_id) DO UPDATE
  SET
    cost_price = EXCLUDED.cost_price,
    selling_price = EXCLUDED.selling_price,
    discount = EXCLUDED.discount,
    price_source = EXCLUDED.price_source,
    updated_at = now();

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM tmp_products_import product LEFT JOIN tmp_review_items review ON review.item_code = product.item_code WHERE review.item_code IS NULL),
    GREATEST(
      (SELECT COUNT(*)::INTEGER FROM tmp_products_import product LEFT JOIN tmp_review_items review ON review.item_code = product.item_code WHERE review.item_code IS NULL) - product_count_before,
      0
    ),
    LEAST(
      product_count_before,
      (SELECT COUNT(*)::INTEGER FROM tmp_products_import product LEFT JOIN tmp_review_items review ON review.item_code = product.item_code WHERE review.item_code IS NULL)
    ),
    GREATEST(
      (SELECT COUNT(*)::INTEGER FROM tmp_barcodes_import barcode LEFT JOIN tmp_review_items review ON review.item_code = barcode.item_code WHERE review.item_code IS NULL) - barcode_count_before,
      0
    ),
    GREATEST(
      (SELECT COUNT(*)::INTEGER FROM tmp_prices_import price LEFT JOIN tmp_review_items review ON review.item_code = price.item_code WHERE review.item_code IS NULL) - price_count_before,
      0
    ),
    LEAST(
      price_count_before,
      (SELECT COUNT(*)::INTEGER FROM tmp_prices_import price LEFT JOIN tmp_review_items review ON review.item_code = price.item_code WHERE review.item_code IS NULL)
    ),
    (SELECT COUNT(*)::INTEGER FROM tmp_review_items);
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_food_choice_product_master(JSONB, JSONB, JSONB, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.import_food_choice_product_master(JSONB, JSONB, JSONB, JSONB) TO authenticated;

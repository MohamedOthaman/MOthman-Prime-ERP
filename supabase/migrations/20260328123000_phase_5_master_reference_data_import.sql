CREATE TABLE IF NOT EXISTS public.salesmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.salesmen
  ADD COLUMN IF NOT EXISTS name_ar TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT,
  type TEXT,
  group_name TEXT,
  category TEXT,
  area TEXT,
  phone TEXT,
  credit_days INTEGER NOT NULL DEFAULT 30,
  credit_limit NUMERIC(12, 3) NOT NULL DEFAULT 0,
  salesman_id UUID REFERENCES public.salesmen(id) ON DELETE SET NULL,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS name_ar TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS credit_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salesman_id UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_salesman_id_fkey'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_salesman_id_fkey
      FOREIGN KEY (salesman_id)
      REFERENCES public.salesmen(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_salesmen_code ON public.salesmen (code);
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers (code);
CREATE INDEX IF NOT EXISTS idx_customers_salesman_id ON public.customers (salesman_id);

ALTER TABLE public.salesmen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read salesmen" ON public.salesmen;
CREATE POLICY "Authenticated users can read salesmen"
ON public.salesmen
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert salesmen" ON public.salesmen;
CREATE POLICY "Authenticated users can insert salesmen"
ON public.salesmen
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update salesmen" ON public.salesmen;
CREATE POLICY "Authenticated users can update salesmen"
ON public.salesmen
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete salesmen" ON public.salesmen;
CREATE POLICY "Authenticated users can delete salesmen"
ON public.salesmen
FOR DELETE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;
CREATE POLICY "Authenticated users can read customers"
ON public.customers
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
CREATE POLICY "Authenticated users can insert customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
CREATE POLICY "Authenticated users can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;
CREATE POLICY "Authenticated users can delete customers"
ON public.customers
FOR DELETE
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.import_food_choice_salesmen(
  salesmen_payload JSONB
)
RETURNS TABLE (
  processed_rows INTEGER,
  inserted_rows INTEGER,
  updated_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  salesman_count_before INTEGER := 0;
BEGIN
  IF COALESCE(jsonb_typeof(salesmen_payload), 'null') <> 'array' THEN
    RAISE EXCEPTION 'salesmen_payload must be a JSON array';
  END IF;

  CREATE TEMP TABLE tmp_salesmen_import_raw (
    row_no BIGSERIAL PRIMARY KEY,
    code TEXT,
    name TEXT,
    name_ar TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_salesmen_import (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
  ) ON COMMIT DROP;

  INSERT INTO tmp_salesmen_import_raw (
    code,
    name,
    name_ar,
    phone,
    email,
    is_active
  )
  SELECT
    UPPER(BTRIM(salesman_code)),
    NULLIF(BTRIM(salesman_name), ''),
    NULLIF(BTRIM(salesman_name_ar), ''),
    NULLIF(BTRIM(phone), ''),
    NULLIF(BTRIM(email), ''),
    COALESCE(is_active, true)
  FROM jsonb_to_recordset(salesmen_payload) AS x(
    salesman_code TEXT,
    salesman_name TEXT,
    salesman_name_ar TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN
  );

  INSERT INTO tmp_salesmen_import (code, name, name_ar, phone, email, is_active)
  SELECT code, name, name_ar, phone, email, is_active
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY code ORDER BY row_no) AS row_rank
    FROM tmp_salesmen_import_raw
    WHERE NULLIF(BTRIM(code), '') IS NOT NULL
  ) AS deduped
  WHERE row_rank = 1;

  IF EXISTS (
    SELECT 1
    FROM tmp_salesmen_import
    WHERE NULLIF(BTRIM(code), '') IS NULL
       OR NULLIF(BTRIM(name), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'salesmen payload contains blank code or name';
  END IF;

  SELECT COUNT(*) INTO salesman_count_before
  FROM public.salesmen existing
  JOIN tmp_salesmen_import staging
    ON staging.code = existing.code;

  INSERT INTO public.salesmen (
    code,
    name,
    name_ar,
    phone,
    email,
    is_active
  )
  SELECT
    code,
    name,
    name_ar,
    phone,
    email,
    is_active
  FROM tmp_salesmen_import
  ON CONFLICT (code) DO UPDATE
  SET
    name = EXCLUDED.name,
    name_ar = COALESCE(EXCLUDED.name_ar, public.salesmen.name_ar),
    phone = COALESCE(EXCLUDED.phone, public.salesmen.phone),
    email = COALESCE(EXCLUDED.email, public.salesmen.email),
    is_active = EXCLUDED.is_active;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM tmp_salesmen_import),
    GREATEST((SELECT COUNT(*)::INTEGER FROM tmp_salesmen_import) - salesman_count_before, 0),
    LEAST(salesman_count_before, (SELECT COUNT(*)::INTEGER FROM tmp_salesmen_import));
END;
$$;

CREATE OR REPLACE FUNCTION public.import_food_choice_customers(
  customers_payload JSONB
)
RETURNS TABLE (
  processed_rows INTEGER,
  inserted_rows INTEGER,
  updated_rows INTEGER,
  unresolved_salesman_codes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  customer_count_before INTEGER := 0;
BEGIN
  IF COALESCE(jsonb_typeof(customers_payload), 'null') <> 'array' THEN
    RAISE EXCEPTION 'customers_payload must be a JSON array';
  END IF;

  CREATE TEMP TABLE tmp_customers_import_raw (
    row_no BIGSERIAL PRIMARY KEY,
    code TEXT,
    name TEXT,
    name_ar TEXT,
    salesman_code TEXT,
    type TEXT,
    group_name TEXT,
    category TEXT,
    area TEXT,
    phone TEXT,
    credit_days INTEGER,
    credit_limit NUMERIC(12, 3),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_customers_import (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT,
    salesman_code TEXT,
    type TEXT,
    group_name TEXT,
    category TEXT,
    area TEXT,
    phone TEXT,
    credit_days INTEGER NOT NULL DEFAULT 30,
    credit_limit NUMERIC(12, 3) NOT NULL DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
  ) ON COMMIT DROP;

  INSERT INTO tmp_customers_import_raw (
    code,
    name,
    name_ar,
    salesman_code,
    type,
    group_name,
    category,
    area,
    phone,
    credit_days,
    credit_limit,
    notes,
    is_active
  )
  SELECT
    UPPER(BTRIM(customer_code)),
    NULLIF(BTRIM(customer_name), ''),
    NULLIF(BTRIM(customer_name_ar), ''),
    NULLIF(UPPER(BTRIM(salesman_code)), ''),
    NULLIF(BTRIM(type), ''),
    NULLIF(BTRIM(group_name), ''),
    NULLIF(BTRIM(category), ''),
    NULLIF(BTRIM(area), ''),
    NULLIF(BTRIM(phone), ''),
    COALESCE(credit_days, 30),
    COALESCE(credit_limit, 0),
    NULLIF(BTRIM(notes), ''),
    COALESCE(is_active, true)
  FROM jsonb_to_recordset(customers_payload) AS x(
    customer_code TEXT,
    customer_name TEXT,
    customer_name_ar TEXT,
    salesman_code TEXT,
    type TEXT,
    group_name TEXT,
    category TEXT,
    area TEXT,
    phone TEXT,
    credit_days INTEGER,
    credit_limit NUMERIC,
    notes TEXT,
    is_active BOOLEAN
  );

  INSERT INTO tmp_customers_import (
    code,
    name,
    name_ar,
    salesman_code,
    type,
    group_name,
    category,
    area,
    phone,
    credit_days,
    credit_limit,
    notes,
    is_active
  )
  SELECT
    code,
    name,
    name_ar,
    salesman_code,
    type,
    group_name,
    category,
    area,
    phone,
    credit_days,
    credit_limit,
    notes,
    is_active
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY code ORDER BY row_no) AS row_rank
    FROM tmp_customers_import_raw
    WHERE NULLIF(BTRIM(code), '') IS NOT NULL
  ) AS deduped
  WHERE row_rank = 1;

  IF EXISTS (
    SELECT 1
    FROM tmp_customers_import
    WHERE NULLIF(BTRIM(code), '') IS NULL
       OR NULLIF(BTRIM(name), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'customers payload contains blank code or name';
  END IF;

  SELECT COUNT(*) INTO customer_count_before
  FROM public.customers existing
  JOIN tmp_customers_import staging
    ON staging.code = existing.code;

  INSERT INTO public.customers (
    code,
    name,
    name_ar,
    type,
    group_name,
    category,
    area,
    phone,
    credit_days,
    credit_limit,
    salesman_id,
    notes,
    is_active
  )
  SELECT
    customer.code,
    customer.name,
    customer.name_ar,
    customer.type,
    customer.group_name,
    customer.category,
    customer.area,
    customer.phone,
    customer.credit_days,
    customer.credit_limit,
    salesman.id,
    customer.notes,
    customer.is_active
  FROM tmp_customers_import customer
  LEFT JOIN public.salesmen salesman
    ON salesman.code = customer.salesman_code
  ON CONFLICT (code) DO UPDATE
  SET
    name = EXCLUDED.name,
    name_ar = COALESCE(EXCLUDED.name_ar, public.customers.name_ar),
    type = COALESCE(EXCLUDED.type, public.customers.type),
    group_name = COALESCE(EXCLUDED.group_name, public.customers.group_name),
    category = COALESCE(EXCLUDED.category, public.customers.category),
    area = COALESCE(EXCLUDED.area, public.customers.area),
    phone = COALESCE(EXCLUDED.phone, public.customers.phone),
    credit_days = EXCLUDED.credit_days,
    credit_limit = EXCLUDED.credit_limit,
    salesman_id = EXCLUDED.salesman_id,
    notes = COALESCE(EXCLUDED.notes, public.customers.notes),
    is_active = EXCLUDED.is_active;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM tmp_customers_import),
    GREATEST((SELECT COUNT(*)::INTEGER FROM tmp_customers_import) - customer_count_before, 0),
    LEAST(customer_count_before, (SELECT COUNT(*)::INTEGER FROM tmp_customers_import)),
    (
      SELECT COUNT(*)::INTEGER
      FROM tmp_customers_import customer
      LEFT JOIN public.salesmen salesman
        ON salesman.code = customer.salesman_code
      WHERE customer.salesman_code IS NOT NULL
        AND salesman.id IS NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.import_food_choice_opening_stock(
  opening_stock_payload JSONB
)
RETURNS TABLE (
  processed_batches INTEGER,
  replaced_opening_rows INTEGER,
  inserted_opening_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  IF COALESCE(jsonb_typeof(opening_stock_payload), 'null') <> 'array' THEN
    RAISE EXCEPTION 'opening_stock_payload must be a JSON array';
  END IF;

  CREATE TEMP TABLE tmp_opening_stock_raw (
    row_no BIGSERIAL PRIMARY KEY,
    item_code TEXT,
    batch_no TEXT,
    expiry_date DATE,
    quantity NUMERIC(12, 3),
    uom TEXT,
    warehouse TEXT
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_opening_stock_import (
    item_code TEXT NOT NULL,
    batch_no TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL,
    uom TEXT,
    warehouse TEXT
  ) ON COMMIT DROP;

  INSERT INTO tmp_opening_stock_raw (
    item_code,
    batch_no,
    expiry_date,
    quantity,
    uom,
    warehouse
  )
  SELECT
    UPPER(BTRIM(item_code)),
    NULLIF(BTRIM(batch_no), ''),
    expiry_date,
    quantity,
    NULLIF(BTRIM(uom), ''),
    NULLIF(BTRIM(warehouse), '')
  FROM jsonb_to_recordset(opening_stock_payload) AS x(
    item_code TEXT,
    batch_no TEXT,
    expiry_date DATE,
    quantity NUMERIC,
    uom TEXT,
    warehouse TEXT
  );

  INSERT INTO tmp_opening_stock_import (
    item_code,
    batch_no,
    expiry_date,
    quantity,
    uom,
    warehouse
  )
  SELECT
    item_code,
    batch_no,
    expiry_date,
    SUM(quantity)::NUMERIC(12, 3),
    MAX(uom),
    MAX(warehouse)
  FROM tmp_opening_stock_raw
  WHERE NULLIF(BTRIM(item_code), '') IS NOT NULL
    AND NULLIF(BTRIM(batch_no), '') IS NOT NULL
    AND expiry_date IS NOT NULL
  GROUP BY item_code, batch_no, expiry_date;

  IF EXISTS (
    SELECT 1
    FROM tmp_opening_stock_import
    WHERE quantity <= 0
  ) THEN
    RAISE EXCEPTION 'opening stock payload contains non-positive quantity';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_opening_stock_import stock
    LEFT JOIN public.products product
      ON product.item_code = stock.item_code
    WHERE product.id IS NULL
  ) THEN
    RAISE EXCEPTION 'opening stock payload references unknown item_code';
  END IF;

  DELETE FROM public.inventory_transactions inventory_txn
  USING (
    SELECT DISTINCT product.id AS product_id
    FROM tmp_opening_stock_import stock
    JOIN public.products product
      ON product.item_code = stock.item_code
  ) AS affected
  WHERE inventory_txn.reference_type = 'OPENING_BALANCE'
    AND inventory_txn.product_id = affected.product_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

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
    'OPENING_BALANCE',
    product.id,
    NULL,
    product.id,
    stock.quantity,
    stock.batch_no,
    stock.expiry_date,
    now()
  FROM tmp_opening_stock_import stock
  JOIN public.products product
    ON product.item_code = stock.item_code;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM tmp_opening_stock_import),
    deleted_count,
    (SELECT COUNT(*)::INTEGER FROM tmp_opening_stock_import);
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_food_choice_salesmen(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.import_food_choice_salesmen(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_food_choice_customers(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.import_food_choice_customers(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_food_choice_opening_stock(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.import_food_choice_opening_stock(JSONB) TO authenticated;

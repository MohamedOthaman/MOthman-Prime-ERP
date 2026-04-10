CREATE OR REPLACE VIEW public.inventory_batch_stock_details AS
WITH normalized_transactions AS (
  SELECT
    txn.product_id,
    NULLIF(BTRIM(COALESCE(txn.batch_no, '')), '') AS batch_no,
    txn.expiry_date,
    CASE WHEN txn.type = 'IN' THEN txn.quantity ELSE 0::NUMERIC END AS received_quantity,
    CASE WHEN txn.type = 'OUT' THEN txn.quantity ELSE 0::NUMERIC END AS issued_quantity,
    COALESCE(header.arrival_date, header.received_date, header.approved_at::DATE, txn.created_at::DATE) AS receiving_date,
    NULLIF(BTRIM(header.invoice_no), '') AS receiving_invoice_no,
    NULLIF(BTRIM(header.grn_no), '') AS grn_no
  FROM public.inventory_transactions AS txn
  LEFT JOIN public.receiving_headers AS header
    ON txn.reference_type = 'GRN'
   AND txn.reference_id = header.id
),
grouped_batches AS (
  SELECT
    product_id,
    batch_no,
    expiry_date,
    SUM(received_quantity)::NUMERIC(12, 3) AS received_quantity,
    SUM(issued_quantity)::NUMERIC(12, 3) AS issued_quantity,
    (SUM(received_quantity) - SUM(issued_quantity))::NUMERIC(12, 3) AS remaining_quantity,
    MIN(receiving_date) FILTER (WHERE received_quantity > 0) AS first_received_date,
    MAX(receiving_date) FILTER (WHERE received_quantity > 0) AS last_received_date,
    MIN(receiving_invoice_no) FILTER (
      WHERE received_quantity > 0
        AND receiving_invoice_no IS NOT NULL
    ) AS receiving_invoice_no,
    MIN(grn_no) FILTER (
      WHERE received_quantity > 0
        AND grn_no IS NOT NULL
    ) AS grn_no
  FROM normalized_transactions
  GROUP BY product_id, batch_no, expiry_date
)
SELECT
  product_id,
  batch_no,
  expiry_date,
  received_quantity,
  issued_quantity,
  remaining_quantity,
  first_received_date,
  last_received_date,
  receiving_invoice_no,
  grn_no,
  COALESCE(receiving_invoice_no, grn_no, batch_no) AS receiving_reference
FROM grouped_batches;

CREATE OR REPLACE VIEW public.inventory_product_stock_summary AS
SELECT
  product.id AS product_id,
  product.code,
  product.item_code,
  product.name,
  product.name_ar,
  product.name_en,
  product.brand,
  product.category,
  product.section,
  product.uom,
  product.packaging,
  product.storage_type,
  product.carton_holds,
  product.primary_barcode,
  product.all_barcodes,
  COALESCE(
    SUM(batch.remaining_quantity) FILTER (WHERE batch.remaining_quantity > 0),
    0::NUMERIC
  )::NUMERIC(12, 3) AS available_quantity,
  COUNT(*) FILTER (WHERE batch.remaining_quantity > 0) AS batch_count,
  MIN(batch.expiry_date) FILTER (
    WHERE batch.remaining_quantity > 0
      AND batch.expiry_date IS NOT NULL
  ) AS nearest_expiry
FROM public.products_overview AS product
LEFT JOIN public.inventory_batch_stock_details AS batch
  ON batch.product_id = product.id
WHERE product.is_active = true
   OR product.is_active IS NULL
GROUP BY
  product.id,
  product.code,
  product.item_code,
  product.name,
  product.name_ar,
  product.name_en,
  product.brand,
  product.category,
  product.section,
  product.uom,
  product.packaging,
  product.storage_type,
  product.carton_holds,
  product.primary_barcode,
  product.all_barcodes;

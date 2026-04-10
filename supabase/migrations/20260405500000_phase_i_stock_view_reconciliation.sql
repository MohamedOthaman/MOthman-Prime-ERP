-- ═══════════════════════════════════════════════════════════════════
-- Phase I: Stock View Reconciliation
--
-- Problem: inventory_batch_stock_details was reading from inventory_transactions
--          (old system). Phase H's post_receiving_to_inventory writes to
--          inventory_batches + inventory_movements (new system).
--          New inbound batches were invisible on the stock page.
--
-- Fix: Create inventory_batch_stock_details reading from inventory_batches
--      (qty_available is authoritative — maintained by FEFO deduction in
--       confirm_picking_done and inbound posting in post_receiving_to_inventory).
--      Rebuild inventory_product_stock_summary with full product columns.
--      Add inventory_movements_log view for the audit trail ledger page.
--
-- Applied: 2026-04-05
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. inventory_batch_stock_details ────────────────────────────────

CREATE OR REPLACE VIEW public.inventory_batch_stock_details AS
SELECT
  b.product_id,
  NULLIF(BTRIM(COALESCE(b.batch_no, '')), '')   AS batch_no,
  b.production_date,
  b.expiry_date,
  b.qty_received::NUMERIC(12,3)                 AS received_quantity,
  GREATEST(b.qty_received - b.qty_available, 0)
    ::NUMERIC(12,3)                             AS issued_quantity,
  b.qty_available::NUMERIC(12,3)                AS remaining_quantity,
  b.received_date                               AS first_received_date,
  b.received_date                               AS last_received_date,
  NULL::TEXT                                    AS receiving_invoice_no,
  h.grn_no,
  COALESCE(h.grn_no, b.batch_no)               AS receiving_reference
FROM public.inventory_batches b
LEFT JOIN public.grn_lines   gl ON gl.id = b.receiving_line_id
LEFT JOIN public.grn_headers h  ON h.id  = gl.grn_id;

-- ── 2. inventory_product_stock_summary ──────────────────────────────
-- Drop the existing 4-column live version, recreate with full product info.

DROP VIEW IF EXISTS public.inventory_product_stock_summary CASCADE;

CREATE VIEW public.inventory_product_stock_summary AS
SELECT
  product.id           AS product_id,
  product.code,
  product.item_code,
  product.name,
  product.name_ar,
  product.name_en,
  product.brand,
  product.category,
  NULL::TEXT           AS section,
  product.uom,
  product.packaging,
  product.storage_type,
  product.carton_holds,
  product.primary_barcode,
  ARRAY_REMOVE(ARRAY[product.primary_barcode], NULL) AS all_barcodes,
  COALESCE(
    SUM(batch.remaining_quantity) FILTER (WHERE batch.remaining_quantity > 0),
    0::NUMERIC
  )::NUMERIC(12,3)     AS available_quantity,
  COUNT(*) FILTER (WHERE batch.remaining_quantity > 0) AS batch_count,
  MIN(batch.expiry_date) FILTER (
    WHERE batch.remaining_quantity > 0
      AND batch.expiry_date IS NOT NULL
  )                    AS nearest_expiry
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
  product.uom,
  product.packaging,
  product.storage_type,
  product.carton_holds,
  product.primary_barcode;

-- ── 3. inventory_movements_log ───────────────────────────────────────

CREATE OR REPLACE VIEW public.inventory_movements_log AS
SELECT
  m.id,
  m.movement_type,
  m.reference_type,
  m.reference_id,
  m.batch_id,
  m.batch_no,
  m.expiry_date,
  m.qty_in,
  m.qty_out,
  m.balance_after,
  m.unit_cost,
  m.location_ref,
  m.notes,
  m.performed_at,
  m.performed_by,
  m.product_id,
  p.code         AS product_code,
  p.name         AS product_name,
  p.name_ar      AS product_name_ar,
  p.uom,
  p.brand,
  gh.grn_no,
  sh.invoice_no  AS invoice_no
FROM public.inventory_movements m
LEFT JOIN public.products_overview  p  ON p.id  = m.product_id
LEFT JOIN public.grn_headers        gh ON gh.id = m.reference_id
                                      AND m.reference_type = 'GRN'
LEFT JOIN public.sales_headers      sh ON sh.id = m.reference_id
                                      AND m.reference_type = 'INVOICE';

GRANT SELECT ON public.inventory_batch_stock_details   TO authenticated;
GRANT SELECT ON public.inventory_product_stock_summary TO authenticated;
GRANT SELECT ON public.inventory_movements_log          TO authenticated;

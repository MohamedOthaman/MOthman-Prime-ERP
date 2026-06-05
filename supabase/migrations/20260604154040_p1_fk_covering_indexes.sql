-- ============================================================================
-- Ledger reconciliation: p1_fk_covering_indexes
-- ============================================================================
-- Production already records remote migration version 20260604154040 as applied.
-- This file restores the matching local migration file so Supabase Preview can
-- reconcile the repository with the remote migration ledger.
--
-- Do not treat this as a new production schema change. The SQL is additive and
-- idempotent: each index is guarded with IF NOT EXISTS and each table block
-- no-ops when the target table is absent in a preview/fresh database.
-- ============================================================================

DO $$ BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products (brand_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_customers_created_by ON public.customers (created_by);
    CREATE INDEX IF NOT EXISTS idx_customers_salesman_id ON public.customers (salesman_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.auto_match_feedback') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_auto_match_feedback_matched_product_id
      ON public.auto_match_feedback (matched_product_id);
  END IF;
  IF to_regclass('public.customer_sku_mappings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_customer_sku_mappings_product_id
      ON public.customer_sku_mappings (product_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.grn_headers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_grn_headers_approved_by ON public.grn_headers (approved_by);
    CREATE INDEX IF NOT EXISTS idx_grn_headers_completed_by ON public.grn_headers (completed_by);
    CREATE INDEX IF NOT EXISTS idx_grn_headers_inspected_by ON public.grn_headers (inspected_by);
    CREATE INDEX IF NOT EXISTS idx_grn_headers_municipality_approved_by ON public.grn_headers (municipality_approved_by);
    CREATE INDEX IF NOT EXISTS idx_grn_headers_municipality_submitted_by ON public.grn_headers (municipality_submitted_by);
    CREATE INDEX IF NOT EXISTS idx_grn_headers_rejected_by ON public.grn_headers (rejected_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.grn_lines') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_grn_lines_qc_inspected_by ON public.grn_lines (qc_inspected_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.inventory_batches') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_batches_created_by ON public.inventory_batches (created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.inventory_movements') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_performed_by ON public.inventory_movements (performed_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.qc_inspections') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_qc_inspections_grn_line_id ON public.qc_inspections (grn_line_id);
    CREATE INDEX IF NOT EXISTS idx_qc_inspections_inspected_by ON public.qc_inspections (inspected_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sales_headers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sales_headers_cancel_approved_by ON public.sales_headers (cancel_approved_by);
    CREATE INDEX IF NOT EXISTS idx_sales_headers_cancelled_by ON public.sales_headers (cancelled_by);
    CREATE INDEX IF NOT EXISTS idx_sales_headers_created_by ON public.sales_headers (created_by);
    CREATE INDEX IF NOT EXISTS idx_sales_headers_done_by ON public.sales_headers (done_by);
    CREATE INDEX IF NOT EXISTS idx_sales_headers_ready_by ON public.sales_headers (ready_by);
    CREATE INDEX IF NOT EXISTS idx_sales_headers_received_by ON public.sales_headers (received_by);
    CREATE INDEX IF NOT EXISTS idx_sales_headers_salesman_id ON public.sales_headers (salesman_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sales_returns') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sales_returns_created_by ON public.sales_returns (created_by);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_posted_by ON public.sales_returns (posted_by);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_received_by ON public.sales_returns (received_by);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_reviewed_by ON public.sales_returns (reviewed_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sales_return_lines') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sales_return_lines_invoice_line_id ON public.sales_return_lines (invoice_line_id);
    CREATE INDEX IF NOT EXISTS idx_sales_return_lines_return_movement_id ON public.sales_return_lines (return_movement_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.stock_movements') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by ON public.stock_movements (created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.outbound_execution_allocations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_oea_created_by ON public.outbound_execution_allocations (created_by);
    CREATE INDEX IF NOT EXISTS idx_oea_inventory_movement_id ON public.outbound_execution_allocations (inventory_movement_id);
    CREATE INDEX IF NOT EXISTS idx_oea_invoice_line_id ON public.outbound_execution_allocations (invoice_line_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.outbound_execution_lines') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_oel_confirmed_by ON public.outbound_execution_lines (confirmed_by);
    CREATE INDEX IF NOT EXISTS idx_oel_invoice_line_id ON public.outbound_execution_lines (invoice_line_id);
    CREATE INDEX IF NOT EXISTS idx_oel_scanned_by ON public.outbound_execution_lines (scanned_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.outbound_execution_sessions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_oes_confirmed_by ON public.outbound_execution_sessions (confirmed_by);
    CREATE INDEX IF NOT EXISTS idx_oes_started_by ON public.outbound_execution_sessions (started_by);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.outbound_scan_events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ose_scanned_by ON public.outbound_scan_events (scanned_by);
  END IF;
END $$;

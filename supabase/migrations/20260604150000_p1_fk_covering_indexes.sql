-- ============================================================================
-- P1 — Foreign-Key Covering Indexes (Supabase Hardening, low-risk performance)
-- ============================================================================
-- Addresses the 39 `unindexed_foreign_keys` INFO findings from the Supabase
-- performance advisor (project koxtzeymsujzlqrpsims, captured 2026-06-04).
--
-- SAFETY / SCOPE:
--   * ADDITIVE ONLY. Creates indexes; drops nothing, alters no table, touches
--     no data, changes no business logic. Reversible (DROP INDEX ...).
--   * Every table + column was verified against the LIVE schema via
--     pg_constraint/pg_attribute, and cross-checked against pg_indexes so none
--     duplicates an existing covering index.
--   * `IF NOT EXISTS` makes each index idempotent.
--
-- WHY THE to_regclass() GUARDS:
--   The repo migration history is NOT reproducible against a fresh database
--   (see docs/SUPABASE_AUDIT.md §"Schema/History Drift"): base tables such as
--   sales_headers/grn_headers/suppliers are never CREATE TABLE'd in migrations,
--   so a from-scratch build (e.g. the Supabase Preview branch) lacks them.
--   Each table's indexes are therefore wrapped in `IF to_regclass(...) IS NOT
--   NULL` so this migration creates every index on the LIVE database (all
--   tables present) and safely no-ops on any environment where a table is
--   absent — instead of aborting with "relation does not exist".
--
-- HOW TO APPLY:
--   Apply to the LIVE database (or a dump-seeded clone) in a low-traffic
--   maintenance window. Plain CREATE INDEX takes a brief SHARE lock per table
--   while building (sub-second on these small tables); for very large tables
--   prefer running CREATE INDEX CONCURRENTLY manually (cannot run inside a
--   migration transaction). After applying, re-run the performance advisor to
--   confirm unindexed_foreign_keys 39 -> 0.
-- ============================================================================

-- ── products ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products (brand_id);
  END IF;
END $$;

-- ── customers ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_customers_created_by ON public.customers (created_by);
    CREATE INDEX IF NOT EXISTS idx_customers_salesman_id ON public.customers (salesman_id);
  END IF;
END $$;

-- ── auto_match_feedback / customer_sku_mappings (AI extraction) ──────────────
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

-- ── grn_headers ─────────────────────────────────────────────────────────────
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

-- ── grn_lines ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.grn_lines') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_grn_lines_qc_inspected_by ON public.grn_lines (qc_inspected_by);
  END IF;
END $$;

-- ── inventory_batches ───────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.inventory_batches') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_batches_created_by ON public.inventory_batches (created_by);
  END IF;
END $$;

-- ── inventory_movements ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.inventory_movements') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_performed_by ON public.inventory_movements (performed_by);
  END IF;
END $$;

-- ── qc_inspections ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.qc_inspections') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_qc_inspections_grn_line_id ON public.qc_inspections (grn_line_id);
    CREATE INDEX IF NOT EXISTS idx_qc_inspections_inspected_by ON public.qc_inspections (inspected_by);
  END IF;
END $$;

-- ── sales_headers ───────────────────────────────────────────────────────────
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

-- ── sales_returns ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.sales_returns') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sales_returns_created_by ON public.sales_returns (created_by);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_posted_by ON public.sales_returns (posted_by);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_received_by ON public.sales_returns (received_by);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_reviewed_by ON public.sales_returns (reviewed_by);
  END IF;
END $$;

-- ── sales_return_lines ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.sales_return_lines') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sales_return_lines_invoice_line_id ON public.sales_return_lines (invoice_line_id);
    CREATE INDEX IF NOT EXISTS idx_sales_return_lines_return_movement_id ON public.sales_return_lines (return_movement_id);
  END IF;
END $$;

-- ── stock_movements ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.stock_movements') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'stock_movements'
         AND column_name = 'created_by'
     )
  THEN
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by ON public.stock_movements (created_by);
  END IF;
END $$;

-- ── outbound_execution_allocations ──────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.outbound_execution_allocations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_oea_created_by ON public.outbound_execution_allocations (created_by);
    CREATE INDEX IF NOT EXISTS idx_oea_inventory_movement_id ON public.outbound_execution_allocations (inventory_movement_id);
    CREATE INDEX IF NOT EXISTS idx_oea_invoice_line_id ON public.outbound_execution_allocations (invoice_line_id);
  END IF;
END $$;

-- ── outbound_execution_lines ────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.outbound_execution_lines') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_oel_confirmed_by ON public.outbound_execution_lines (confirmed_by);
    CREATE INDEX IF NOT EXISTS idx_oel_invoice_line_id ON public.outbound_execution_lines (invoice_line_id);
    CREATE INDEX IF NOT EXISTS idx_oel_scanned_by ON public.outbound_execution_lines (scanned_by);
  END IF;
END $$;

-- ── outbound_execution_sessions ─────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.outbound_execution_sessions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_oes_confirmed_by ON public.outbound_execution_sessions (confirmed_by);
    CREATE INDEX IF NOT EXISTS idx_oes_started_by ON public.outbound_execution_sessions (started_by);
  END IF;
END $$;

-- ── outbound_scan_events ────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.outbound_scan_events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ose_scanned_by ON public.outbound_scan_events (scanned_by);
  END IF;
END $$;

-- ============================================================================
-- 39 covering indexes total (created where the table exists). Expected advisor
-- effect on LIVE: performance.unindexed_foreign_keys 39 -> 0.
-- Re-run get_advisors(type=performance) AFTER applying to confirm.
-- ============================================================================

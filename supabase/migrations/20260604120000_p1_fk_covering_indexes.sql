-- ============================================================================
-- P1 — Foreign-Key Covering Indexes (Supabase Hardening, low-risk performance)
-- ============================================================================
-- Addresses the 39 `unindexed_foreign_keys` INFO findings from the Supabase
-- performance advisor (project koxtzeymsujzlqrpsims, captured 2026-06-04).
--
-- SAFETY / SCOPE:
--   * ADDITIVE ONLY. Creates indexes; drops nothing, alters no table, touches
--     no data, changes no business logic. Reversible (see docs/ROLLBACK notes).
--   * Every table + column below was verified against the LIVE schema via
--     pg_constraint/pg_attribute, and cross-checked against pg_indexes so none
--     duplicates an existing covering index.
--   * `IF NOT EXISTS` makes this idempotent and safe to re-run.
--
-- IMPORTANT — how to apply:
--   The repo migration history is NOT reproducible against the live database
--   (see docs/SUPABASE_AUDIT.md §"Schema/History Drift"). Apply this file to
--   the LIVE database (or a dump-seeded clone) in a low-traffic maintenance
--   window — do NOT rely on `supabase db reset`.
--   Plain CREATE INDEX takes a brief SHARE lock (blocks writes, allows reads)
--   per table while building. Tables here are small, so this is sub-second; for
--   very large tables prefer running the equivalent CREATE INDEX CONCURRENTLY
--   statements manually (those cannot run inside a migration transaction).
-- ============================================================================

-- ── products ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_brand_id
    ON public.products (brand_id);

-- ── customers ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_created_by
    ON public.customers (created_by);
CREATE INDEX IF NOT EXISTS idx_customers_salesman_id
    ON public.customers (salesman_id);

-- ── auto_match_feedback / customer_sku_mappings (AI extraction) ──────────────
CREATE INDEX IF NOT EXISTS idx_auto_match_feedback_matched_product_id
    ON public.auto_match_feedback (matched_product_id);
CREATE INDEX IF NOT EXISTS idx_customer_sku_mappings_product_id
    ON public.customer_sku_mappings (product_id);

-- ── grn_headers ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_grn_headers_approved_by
    ON public.grn_headers (approved_by);
CREATE INDEX IF NOT EXISTS idx_grn_headers_completed_by
    ON public.grn_headers (completed_by);
CREATE INDEX IF NOT EXISTS idx_grn_headers_inspected_by
    ON public.grn_headers (inspected_by);
CREATE INDEX IF NOT EXISTS idx_grn_headers_municipality_approved_by
    ON public.grn_headers (municipality_approved_by);
CREATE INDEX IF NOT EXISTS idx_grn_headers_municipality_submitted_by
    ON public.grn_headers (municipality_submitted_by);
CREATE INDEX IF NOT EXISTS idx_grn_headers_rejected_by
    ON public.grn_headers (rejected_by);

-- ── grn_lines ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_grn_lines_qc_inspected_by
    ON public.grn_lines (qc_inspected_by);

-- ── inventory_batches ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventory_batches_created_by
    ON public.inventory_batches (created_by);

-- ── inventory_movements ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventory_movements_performed_by
    ON public.inventory_movements (performed_by);

-- ── qc_inspections ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_qc_inspections_grn_line_id
    ON public.qc_inspections (grn_line_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_inspected_by
    ON public.qc_inspections (inspected_by);

-- ── sales_headers ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_headers_cancel_approved_by
    ON public.sales_headers (cancel_approved_by);
CREATE INDEX IF NOT EXISTS idx_sales_headers_cancelled_by
    ON public.sales_headers (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_sales_headers_created_by
    ON public.sales_headers (created_by);
CREATE INDEX IF NOT EXISTS idx_sales_headers_done_by
    ON public.sales_headers (done_by);
CREATE INDEX IF NOT EXISTS idx_sales_headers_ready_by
    ON public.sales_headers (ready_by);
CREATE INDEX IF NOT EXISTS idx_sales_headers_received_by
    ON public.sales_headers (received_by);
CREATE INDEX IF NOT EXISTS idx_sales_headers_salesman_id
    ON public.sales_headers (salesman_id);

-- ── sales_returns ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_returns_created_by
    ON public.sales_returns (created_by);
CREATE INDEX IF NOT EXISTS idx_sales_returns_posted_by
    ON public.sales_returns (posted_by);
CREATE INDEX IF NOT EXISTS idx_sales_returns_received_by
    ON public.sales_returns (received_by);
CREATE INDEX IF NOT EXISTS idx_sales_returns_reviewed_by
    ON public.sales_returns (reviewed_by);

-- ── sales_return_lines ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_return_lines_invoice_line_id
    ON public.sales_return_lines (invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_lines_return_movement_id
    ON public.sales_return_lines (return_movement_id);

-- ── stock_movements ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by
    ON public.stock_movements (created_by);

-- ── outbound_execution_allocations ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oea_created_by
    ON public.outbound_execution_allocations (created_by);
CREATE INDEX IF NOT EXISTS idx_oea_inventory_movement_id
    ON public.outbound_execution_allocations (inventory_movement_id);
CREATE INDEX IF NOT EXISTS idx_oea_invoice_line_id
    ON public.outbound_execution_allocations (invoice_line_id);

-- ── outbound_execution_lines ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oel_confirmed_by
    ON public.outbound_execution_lines (confirmed_by);
CREATE INDEX IF NOT EXISTS idx_oel_invoice_line_id
    ON public.outbound_execution_lines (invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_oel_scanned_by
    ON public.outbound_execution_lines (scanned_by);

-- ── outbound_execution_sessions ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oes_confirmed_by
    ON public.outbound_execution_sessions (confirmed_by);
CREATE INDEX IF NOT EXISTS idx_oes_started_by
    ON public.outbound_execution_sessions (started_by);

-- ── outbound_scan_events ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ose_scanned_by
    ON public.outbound_scan_events (scanned_by);

-- ============================================================================
-- 39 covering indexes total. Expected advisor effect:
--   performance.unindexed_foreign_keys: 39 -> 0
-- Re-run `get_advisors(type=performance)` AFTER applying to confirm.
-- ============================================================================

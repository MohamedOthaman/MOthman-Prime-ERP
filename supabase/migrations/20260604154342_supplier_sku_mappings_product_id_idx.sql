-- ============================================================================
-- Ledger reconciliation: supplier_sku_mappings_product_id_idx
-- ============================================================================
-- Production already records remote migration version 20260604154342 as applied.
-- This file restores the matching local migration file so Supabase Preview can
-- reconcile the repository with the remote migration ledger.
--
-- Do not treat this as a new production schema change. The index is additive
-- and idempotent, and the block no-ops when the table is absent.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.supplier_sku_mappings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_supplier_sku_mappings_product_id
      ON public.supplier_sku_mappings (product_id);
  END IF;
END $$;

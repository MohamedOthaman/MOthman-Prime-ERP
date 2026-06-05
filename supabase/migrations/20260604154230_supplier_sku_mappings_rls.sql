-- ============================================================================
-- Ledger reconciliation: supplier_sku_mappings_rls
-- ============================================================================
-- Production already records remote migration version 20260604154230 as applied.
-- This file restores the matching local migration file so Supabase Preview can
-- reconcile the repository with the remote migration ledger.
--
-- Do not treat this as a new production RLS change. This restores the
-- already-applied RLS ledger entry for supplier_sku_mappings only.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.supplier_sku_mappings') IS NOT NULL THEN
    ALTER TABLE public.supplier_sku_mappings ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'supplier_sku_mappings'
        AND policyname = 'Authenticated users can read supplier sku mappings'
    ) THEN
      CREATE POLICY "Authenticated users can read supplier sku mappings"
        ON public.supplier_sku_mappings
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'supplier_sku_mappings'
        AND policyname = 'Authenticated users can insert supplier sku mappings'
    ) THEN
      CREATE POLICY "Authenticated users can insert supplier sku mappings"
        ON public.supplier_sku_mappings
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'supplier_sku_mappings'
        AND policyname = 'Authenticated users can update supplier sku mappings'
    ) THEN
      CREATE POLICY "Authenticated users can update supplier sku mappings"
        ON public.supplier_sku_mappings
        FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'supplier_sku_mappings'
        AND policyname = 'Authenticated users can delete supplier sku mappings'
    ) THEN
      CREATE POLICY "Authenticated users can delete supplier sku mappings"
        ON public.supplier_sku_mappings
        FOR DELETE
        TO authenticated
        USING (true);
    END IF;
  END IF;
END $$;

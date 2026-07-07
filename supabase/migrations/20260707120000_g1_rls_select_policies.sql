-- ═══════════════════════════════════════════════════════════════════════════
-- G1 — SELECT policies for RLS-enabled-no-policy tables
-- ═══════════════════════════════════════════════════════════════════════════
-- STATUS: REVIEWED-MIGRATION, NOT YET APPLIED TO PRODUCTION.
-- Advisor basis: rls_enabled_no_policy ×7 (live advisors 2026-07-07).
--
-- These tables have RLS ENABLED with ZERO policies — every direct read
-- returns no rows for every non-service role. This is not just hygiene: the
-- app reads inventory_movements (batch trace history, GRN posting summary,
-- return allocations) and sales_returns/sales_return_lines (returns pages)
-- directly, so those screens silently show empty data on live TODAY.
--
-- Model: authenticated staff can READ; there are deliberately NO
-- insert/update/delete policies — all writes flow through the SECURITY
-- DEFINER posting/return/picking RPCs, which bypass RLS. Additive and
-- reversible (DROP POLICY per statement).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_movements',
    'outbound_execution_allocations',
    'outbound_execution_lines',
    'outbound_execution_sessions',
    'outbound_scan_events',
    'sales_returns',
    'sales_return_lines'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = t || ': read authenticated'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
        t || ': read authenticated', t
      );
    END IF;
  END LOOP;
END $$;

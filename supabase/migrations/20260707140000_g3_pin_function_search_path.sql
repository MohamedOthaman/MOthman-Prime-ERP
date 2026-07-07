-- ═══════════════════════════════════════════════════════════════════════════
-- G3 — Pin search_path on mutable-search_path functions
-- ═══════════════════════════════════════════════════════════════════════════
-- STATUS: REVIEWED-MIGRATION, NOT YET APPLIED TO PRODUCTION.
-- Advisor basis: function_search_path_mutable ×19 (live advisors 2026-07-07).
--
-- Logic-preserving `ALTER FUNCTION … SET search_path = public` on every
-- overload. All listed bodies reference only public objects (auth.uid() is
-- schema-qualified), so pinning cannot change behavior — it only blocks
-- search_path hijacking of SECURITY DEFINER functions.
--
-- EXCLUDED on purpose: handle_new_user — it is a trigger on auth.users and
-- may reference auth-schema objects unqualified; it must be reviewed and
-- pinned individually (SET search_path = public, auth) after reading its
-- live body. Reversible via ALTER FUNCTION … RESET search_path.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'advance_grn_status','approve_grn','create_product_full',
        'fn_audit_grn_status_change','fn_check_expiry_on_batch_insert',
        'fn_receiving_lines_delete','fn_receiving_lines_insert','fn_receiving_lines_update',
        'generate_return_no','get_fefo_batches','get_product_available_qty',
        'log_audit','reject_grn','set_product_prices_updated_at',
        'set_sales_headers_updated_at','set_updated_at','submit_qc_result',
        'sync_sales_header_total'
      ])
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
      ))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.sig);
  END LOOP;
END $$;

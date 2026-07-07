-- ═══════════════════════════════════════════════════════════════════════════
-- G2 — Revoke anon EXECUTE on SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════════════════
-- STATUS: REVIEWED-MIGRATION, NOT YET APPLIED TO PRODUCTION.
-- Advisor basis: anon_security_definer_function_executable ×33
-- (live advisors 2026-07-07).
--
-- Every mutating business RPC (post_sales_invoice, cancel_invoice,
-- approve_grn, …) is currently EXECUTE-able by the anon role — anyone with
-- the publishable key can call definer functions that move stock. The app
-- always calls them as an authenticated user.
--
-- This revokes anon (and the PUBLIC pseudo-role) on ALL overloads of the
-- listed functions; authenticated grants are left untouched. Reversible via
-- GRANT EXECUTE ... TO anon per function.

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
        'advance_grn_status','approve_grn','cancel_invoice','check_duplicate_invoice',
        'confirm_picking_done','create_product_full','fn_audit_grn_status_change',
        'fn_check_expiry_on_batch_insert','fn_grn_approve_to_stock',
        'fn_receiving_lines_delete','fn_receiving_lines_insert','fn_receiving_lines_update',
        'get_fefo_batches','get_my_role','get_user_role','handle_new_user',
        'import_food_choice_product_master','log_audit','mark_invoice_done',
        'mark_invoice_received','post_receiving_to_inventory','post_sales_invoice',
        'post_sales_return','receive_sales_return','record_outbound_scan','reject_grn',
        'start_or_get_picking_session','submit_qc_result','update_product_full',
        'upsert_supplier_sku_mapping'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', fn.sig);
  END LOOP;
END $$;

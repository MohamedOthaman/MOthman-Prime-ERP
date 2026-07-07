-- ═══════════════════════════════════════════════════════════════════════════
-- G4 — Duplicate index cleanup
-- ═══════════════════════════════════════════════════════════════════════════
-- STATUS: REVIEWED-MIGRATION, NOT YET APPLIED TO PRODUCTION.
-- Advisor basis: duplicate_index ×5 (live advisors 2026-07-07). Each group
-- below is a set of IDENTICAL indexes; one survivor is kept, the redundant
-- copies are dropped (write-amplification only, zero read impact —
-- the surviving identical index serves every plan the dropped one could).
--
-- unused_index ×104 is intentionally NOT acted on: the DB is pre-launch and
-- usage stats are meaningless until real traffic exists (see
-- docs/SUPABASE_AUDIT.md).
--
-- Survivors: the constraint-backed or newer canonical name of each group.
-- Reversible: recreate any dropped index from the survivor's definition.

-- audit_logs — keep idx_audit_logs_entity_lookup
DROP INDEX IF EXISTS public.idx_audit_logs_entity;

-- product_barcodes — keep idx_product_barcodes_product_id
DROP INDEX IF EXISTS public.idx_product_barcodes_product;

-- product_barcodes — keep idx_product_barcodes_barcode_unique
DROP INDEX IF EXISTS public.idx_unique_barcode;

-- product_barcodes — keep idx_product_barcodes_one_primary_per_product
DROP INDEX IF EXISTS public.idx_one_primary_barcode_per_product;

-- salesmen — keep salesmen_code_key (backs the UNIQUE constraint; cannot and
-- should not be dropped), remove the two hand-made copies
DROP INDEX IF EXISTS public.idx_salesman_code;
DROP INDEX IF EXISTS public.idx_salesmen_code_unique;

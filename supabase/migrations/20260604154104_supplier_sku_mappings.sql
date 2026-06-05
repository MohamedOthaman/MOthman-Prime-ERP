-- ============================================================================
-- Ledger reconciliation: supplier_sku_mappings
-- ============================================================================
-- Production already records remote migration version 20260604154104 as applied.
-- This file restores the matching local migration file so Supabase Preview can
-- reconcile the repository with the remote migration ledger.
--
-- Do not treat this as a new production schema change. The SQL mirrors the
-- already-applied supplier SKU mapping foundation and is idempotent where
-- PostgreSQL supports it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_sku_mappings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id     UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    external_code   TEXT,
    external_name   TEXT NOT NULL,
    product_id      UUID REFERENCES public.products(id) ON DELETE CASCADE,
    usage_count     INTEGER NOT NULL DEFAULT 1,
    last_used       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_sku_mapping
    ON public.supplier_sku_mappings (supplier_id, lower(external_name));

CREATE INDEX IF NOT EXISTS idx_supplier_sku_external_code
    ON public.supplier_sku_mappings (supplier_id, lower(external_code))
    WHERE external_code IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_sku_mappings TO authenticated;

CREATE OR REPLACE FUNCTION public.check_duplicate_invoice(
    p_invoice_no    TEXT,
    p_customer_id   UUID DEFAULT NULL,
    p_invoice_date  DATE DEFAULT NULL,
    p_total_amount  NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_existing_id   UUID;
    v_existing_no   TEXT;
BEGIN
    SELECT id, invoice_no
    INTO   v_existing_id, v_existing_no
    FROM   public.sales_headers
    WHERE  lower(trim(invoice_no)) = lower(trim(p_invoice_no))
      AND  status NOT IN ('cancelled')
    LIMIT  1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'is_duplicate', true,
            'existing_id',  v_existing_id,
            'existing_no',  v_existing_no,
            'reason',       'Invoice number already exists: ' || v_existing_no
        );
    END IF;

    IF p_customer_id IS NOT NULL AND p_invoice_date IS NOT NULL AND p_total_amount IS NOT NULL AND p_total_amount > 0 THEN
        SELECT id, invoice_no
        INTO   v_existing_id, v_existing_no
        FROM   public.sales_headers
        WHERE  customer_id    = p_customer_id
          AND  invoice_date   = p_invoice_date
          AND  abs(total_amount - p_total_amount) < 0.01
          AND  status NOT IN ('cancelled')
        LIMIT  1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'is_duplicate', true,
                'existing_id',  v_existing_id,
                'existing_no',  v_existing_no,
                'reason',       'Same customer, date, and amount - possible duplicate of ' || v_existing_no
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('is_duplicate', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_duplicate_invoice TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_supplier_sku_mapping(
    p_supplier_id   UUID,
    p_external_code TEXT,
    p_external_name TEXT,
    p_product_id    UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.supplier_sku_mappings
        (supplier_id, external_code, external_name, product_id, usage_count, last_used)
    VALUES
        (p_supplier_id, p_external_code, p_external_name, p_product_id, 1, now())
    ON CONFLICT (supplier_id, lower(external_name))
    DO UPDATE SET
        usage_count   = supplier_sku_mappings.usage_count + 1,
        last_used     = now(),
        product_id    = EXCLUDED.product_id,
        external_code = COALESCE(EXCLUDED.external_code, supplier_sku_mappings.external_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_supplier_sku_mapping TO authenticated;

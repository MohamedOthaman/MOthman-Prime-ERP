-- ════════════════════════════════════════════════════════════════
-- Baseline: out-of-band production tables
-- ────────────────────────────────────────────────────────────────
-- These tables exist in the live database but were created outside the
-- migration files (via the dashboard / earlier tooling), so a from-scratch
-- migration apply (Supabase preview branches / CI) never creates them and
-- fails as soon as a later migration references them (FK targets, indexes,
-- INSERTs, ALTERs).
--
-- This migration reconciles that gap idempotently:
--   • CREATE TABLE IF NOT EXISTS  → on production every table already
--     exists, so this is a pure no-op; on a fresh DB it provides the
--     tables the rest of the chain depends on.
--   • All columns are nullable (except id) and only safe defaults are
--     kept, so any later INSERT/ALTER in the chain succeeds regardless of
--     which columns it supplies. Foreign keys, RLS and triggers are
--     intentionally omitted here — later migrations add those (guarded
--     with IF [NOT] EXISTS), matching how production was actually built.
--   • The only indexes here are unique(code) on customers / salesmen:
--     phase_5 seeds them with INSERT ... ON CONFLICT (code), which needs a
--     matching unique arbiter. Because this baseline pre-creates the
--     tables, phase_5's inline CREATE TABLE (... code UNIQUE) is skipped,
--     so the arbiter is added here instead.
-- ════════════════════════════════════════════════════════════════

-- ── salesmen ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salesmen (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                       text,
    name                       text,
    name_ar                    text,
    phone                      text,
    email                      text,
    is_active                  boolean DEFAULT true,
    created_at                 timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salesmen TO authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS salesmen_code_baseline_uq ON public.salesmen (code);

-- ── suppliers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                       text,
    name                       text,
    country                    text,
    credit_days                integer DEFAULT 30,
    is_active                  boolean DEFAULT true,
    created_at                 timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;

-- ── customers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                       text,
    name                       text,
    name_ar                    text,
    type                       text,
    group_name                 text,
    category                   text,
    credit_days                integer DEFAULT 30,
    credit_limit               numeric DEFAULT 0,
    currency_code              text DEFAULT 'KWD'::text,
    salesman_code              text,
    area                       text,
    phone                      text,
    notes                      text,
    is_active                  boolean DEFAULT true,
    created_at                 timestamp with time zone DEFAULT now(),
    created_by                 uuid,
    salesman_id                uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS customers_code_baseline_uq ON public.customers (code);

-- ── sales_headers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_headers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_no                 text,
    invoice_date               date DEFAULT CURRENT_DATE,
    customer_id                uuid,
    salesman_id                uuid,
    status                     text DEFAULT 'draft'::text,
    notes                      text,
    total_amount               numeric DEFAULT 0,
    created_at                 timestamp with time zone DEFAULT now(),
    created_by                 uuid,
    updated_at                 timestamp with time zone DEFAULT now(),
    ready_at                   timestamp with time zone,
    ready_by                   uuid,
    done_at                    timestamp with time zone,
    done_by                    uuid,
    received_at                timestamp with time zone,
    received_by                uuid,
    cancelled_at               timestamp with time zone,
    cancelled_by               uuid,
    cancel_reason              text,
    cancel_approved_by         uuid,
    returns_at                 timestamp with time zone
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_headers TO authenticated;

-- ── sales_lines ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_lines (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    header_id                  uuid,
    line_no                    integer,
    product_id                 uuid,
    quantity                   numeric,
    unit_price                 numeric DEFAULT 0,
    line_total                 numeric,
    created_at                 timestamp with time zone DEFAULT now(),
    discount                   numeric DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_lines TO authenticated;

-- ── grn_headers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grn_headers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_no                     text,
    supplier_id                uuid,
    status                     text DEFAULT 'draft'::text,
    received_date              date DEFAULT CURRENT_DATE,
    supplier_invoice_no        text,
    supplier_invoice_date      date,
    notes                      text,
    rejection_reason           text,
    approved_by                uuid,
    approved_at                timestamp with time zone,
    created_by                 uuid,
    created_at                 timestamp with time zone DEFAULT now(),
    updated_at                 timestamp with time zone DEFAULT now(),
    supplier_name              text,
    transport_mode             text,
    inspected_by               uuid,
    inspected_at               timestamp with time zone,
    municipality_reference_no  text,
    municipality_notes         text,
    municipality_submitted_by  uuid,
    municipality_submitted_at  timestamp with time zone,
    municipality_approved_at   timestamp with time zone,
    municipality_approved_by   uuid,
    rejected_by                uuid,
    rejected_at                timestamp with time zone,
    completed_at               timestamp with time zone,
    completed_by               uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grn_headers TO authenticated;

-- ── grn_lines ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grn_lines (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id                     uuid,
    line_no                    integer,
    product_id                 uuid,
    batch_no                   text,
    expiry_date                date,
    qty_ordered                numeric DEFAULT 0,
    qty_received               numeric DEFAULT 0,
    unit_cost                  numeric DEFAULT 0,
    qc_status                  text DEFAULT 'pending'::text,
    qc_notes                   text,
    qc_inspected_by            uuid,
    qc_inspected_at            timestamp with time zone,
    notes                      text,
    created_at                 timestamp with time zone DEFAULT now(),
    production_date            date,
    qc_reason                  text,
    qc_checked_quantity        numeric,
    qty_damaged                numeric DEFAULT 0,
    qty_missing                numeric DEFAULT 0,
    qty_sample                 numeric DEFAULT 0,
    qty_accepted               numeric,
    putaway_warehouse_id       uuid,
    putaway_zone_id            uuid,
    putaway_location_ref       text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grn_lines TO authenticated;

-- ── inventory_batches ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id                 uuid,
    batch_no                   text,
    expiry_date                date,
    received_date              date DEFAULT CURRENT_DATE,
    qty_received               numeric DEFAULT 0,
    qty_available              numeric DEFAULT 0,
    unit_cost                  numeric,
    receiving_line_id          uuid,
    created_at                 timestamp with time zone DEFAULT now(),
    created_by                 uuid,
    warehouse_id               uuid,
    zone_id                    uuid,
    location_ref               text,
    production_date            date
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_batches TO authenticated;

-- ── products: reconcile out-of-band columns ──────────────────────────
-- The base migration created public.products with a minimal column set,
-- but production's products carries many more columns (added out-of-band).
-- Several product views / RPCs (phase_7, phase_8, phase_9) reference these
-- columns before the migration that adds them (phase_11) runs, so a
-- from-scratch apply fails (e.g. "column p.is_active does not exist").
-- Add them up-front, nullable + IF NOT EXISTS, so the views resolve and the
-- later ADD COLUMN IF NOT EXISTS statements become no-ops. No-op on
-- production where these columns already exist.
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS item_code         text,
    ADD COLUMN IF NOT EXISTS internal_code     text,
    ADD COLUMN IF NOT EXISTS name_en           text,
    ADD COLUMN IF NOT EXISTS name_ar           text,
    ADD COLUMN IF NOT EXISTS category          text,
    ADD COLUMN IF NOT EXISTS country           text,
    ADD COLUMN IF NOT EXISTS country_of_origin text,
    ADD COLUMN IF NOT EXISTS brand             text,
    ADD COLUMN IF NOT EXISTS uom               text,
    ADD COLUMN IF NOT EXISTS pack_size         text,
    ADD COLUMN IF NOT EXISTS image_path        text,
    ADD COLUMN IF NOT EXISTS is_active         boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at        timestamp with time zone DEFAULT now();

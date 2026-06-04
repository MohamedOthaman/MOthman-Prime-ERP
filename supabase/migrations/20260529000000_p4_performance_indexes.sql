-- P4 Performance: indexes for common query patterns + pg_trgm for fast product search

-- ─── pg_trgm ──────────────────────────────────────────────────────────────────
-- Required for GIN trigram indexes used by ILIKE / full-text product search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── products ─────────────────────────────────────────────────────────────────
-- Fast fuzzy name/code search (ILIKE '%term%') used by item-lookup in
-- the invoice entry, POS, and the upcoming P5 AI autofill feature.
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
    ON products USING GIN (name gin_trgm_ops);

-- products.code is the unique business identifier (there is no separate SKU
-- column on this schema); a trigram index enables fuzzy ILIKE matching on it.
CREATE INDEX IF NOT EXISTS idx_products_code_trgm
    ON products USING GIN (code gin_trgm_ops);

-- Composite: brand × name is used by catalog-browsing filters.
CREATE INDEX IF NOT EXISTS idx_products_brand_name
    ON products (brand_id, name);

-- ─── invoice_headers ──────────────────────────────────────────────────────────
-- Dashboard date-range queries: status-filtered invoices in a time window.
CREATE INDEX IF NOT EXISTS idx_invoice_headers_status_date
    ON invoice_headers (status, created_at DESC)
    WHERE status IS NOT NULL;

-- Customer invoice history (descending date is the natural sort).
CREATE INDEX IF NOT EXISTS idx_invoice_headers_customer_date
    ON invoice_headers (customer_id, created_at DESC);

-- ─── ocr_documents ────────────────────────────────────────────────────────────
-- The OCR document log has no indexes; these cover the most common access patterns.
CREATE INDEX IF NOT EXISTS idx_ocr_documents_status
    ON ocr_documents (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocr_documents_doc_type
    ON ocr_documents (document_type, created_at DESC);

-- ─── inventory_movements ──────────────────────────────────────────────────────
-- FEFO: product + expiry-date ordered batch lookups.
CREATE INDEX IF NOT EXISTS idx_im_product_performed
    ON inventory_movements (product_id, performed_at DESC);

-- ─── customer_sku_mappings ────────────────────────────────────────────────────
-- Reverse lookup: which customers map to a given product (used by P5 autofill).
CREATE INDEX IF NOT EXISTS idx_cust_sku_product_id
    ON customer_sku_mappings (product_id);

-- ─── auto_match_feedback ──────────────────────────────────────────────────────
-- Popularity-sorted suggestions: most-used matches first.
CREATE INDEX IF NOT EXISTS idx_auto_match_usage
    ON auto_match_feedback (usage_count DESC, last_used DESC);

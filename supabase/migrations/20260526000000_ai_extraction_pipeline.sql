-- Create customer SKU mappings table
CREATE TABLE IF NOT EXISTS customer_sku_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    external_name TEXT NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cust_external_mapping ON customer_sku_mappings(customer_id, lower(external_name));

-- Create auto match feedback table
CREATE TABLE IF NOT EXISTS auto_match_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_name TEXT NOT NULL,
    matched_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    usage_count INTEGER DEFAULT 1,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_match_feedback_ext ON auto_match_feedback(lower(external_name), matched_product_id);

-- Create OCR documents tracking table
CREATE TABLE IF NOT EXISTS ocr_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    document_type TEXT NOT NULL, -- 'po', 'quotation', 'invoice'
    status TEXT NOT NULL, -- 'uploaded', 'extracted', 'applied', 'error'
    confidence NUMERIC(3, 2), -- average extraction confidence
    raw_data JSONB, -- JSON output from LLM
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

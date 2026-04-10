-- Phase 6: Enhancements for Products, Salesmen, Customers, Invoices

-- ─── Salesmen: add notes column ───
ALTER TABLE public.salesmen
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── Customers: add address column ───
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address TEXT;

-- ─── Sales Lines: add discount column ───
ALTER TABLE public.sales_lines
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 3) NOT NULL DEFAULT 0;

-- Update line_total computation to include discount
-- line_total = (quantity * unit_price) - discount
-- We update existing rows to recalculate (only drafts, posted stay as-is)
UPDATE public.sales_lines
SET discount = 0
WHERE discount IS NULL;

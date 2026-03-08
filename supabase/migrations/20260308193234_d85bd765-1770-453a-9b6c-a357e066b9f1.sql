DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE status IN ('done', 'edited'));
DELETE FROM invoices WHERE status IN ('done', 'edited');
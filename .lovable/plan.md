

## Plan: Set imported invoices to "ready" status (no stock deduction)

The user clarified that the invoices PDF contains orders that were **created** but not yet fulfilled — so they should be imported as **"ready"** (pending), not "done". Stock should NOT be deducted at import time.

### Change

**File: `src/components/PdfImportSection.tsx`** (lines 58-87)

In the `applyInvoices` function:
1. **Remove** the FIFO stock deduction loop (lines 63-67) — no stock should be deducted when importing invoices from PDF.
2. **Change** `status: "done"` to `status: "ready"` (line 84).
3. **Remove** `deductionLog` from the invoice record since no deduction happens.

The invoice will appear in the "Ready" tab in Reports, and the user can manually process/fulfill it through the Invoice Scan workflow (which triggers the actual stock deduction).


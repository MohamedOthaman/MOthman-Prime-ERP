import { saveSalesInvoiceDraft } from "@/features/invoices/salesInvoiceService";
import type { OutboxRecord } from "@/database/types";
import { registerHandler } from "./index";

export const SALES_INVOICE_DRAFT_ENTITY = "sales_invoice_draft";

export interface SalesInvoiceDraftPayload {
  headerId: string | null;
  invoiceNo: string;
  invoiceDate: string;
  customerId: string;
  salesmanId: string;
  notes: string;
  totalAmount: number;
  lines: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
  }>;
}

async function handler(record: OutboxRecord): Promise<void> {
  const payload = record.payload as SalesInvoiceDraftPayload;
  await saveSalesInvoiceDraft(payload);
}

let registered = false;

/** Idempotent registration — safe to call multiple times. */
export function ensureSalesInvoiceHandlersRegistered(): void {
  if (registered) return;
  registerHandler(SALES_INVOICE_DRAFT_ENTITY, "create", handler);
  registerHandler(SALES_INVOICE_DRAFT_ENTITY, "update", handler);
  registered = true;
}
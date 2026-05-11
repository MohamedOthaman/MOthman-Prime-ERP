import type { SalesInvoiceStatus } from "@/features/invoices/salesInvoiceService";

export interface InvoiceListFilters {
  status?: SalesInvoiceStatus | "all";
  limit?: number;
  salesmanId?: string | null;
}

export const invoiceKeys = {
  all: ["invoices"] as const,
  lists: () => [...invoiceKeys.all, "list"] as const,
  list: (filters: InvoiceListFilters) =>
    [...invoiceKeys.lists(), filters] as const,
  details: () => [...invoiceKeys.all, "detail"] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
  lookups: () => [...invoiceKeys.all, "lookups"] as const,
  draft: (headerId: string) =>
    [...invoiceKeys.all, "draft", headerId] as const,
};
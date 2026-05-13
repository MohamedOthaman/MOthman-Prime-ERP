import { useQuery } from "@tanstack/react-query";
import { fetchInvoiceList } from "@/features/invoices/salesInvoiceService";
import { invoiceKeys, type InvoiceListFilters } from "./keys";

export function useInvoiceList(
  filters: InvoiceListFilters,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => fetchInvoiceList(filters),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}
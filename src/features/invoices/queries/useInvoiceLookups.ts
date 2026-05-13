import { useQuery } from "@tanstack/react-query";
import { fetchSalesInvoiceLookups } from "@/features/invoices/salesInvoiceService";
import { invoiceKeys } from "./keys";

const FIVE_MINUTES = 5 * 60_000;

export function useInvoiceLookups(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: invoiceKeys.lookups(),
    queryFn: fetchSalesInvoiceLookups,
    enabled: options?.enabled ?? true,
    staleTime: FIVE_MINUTES,
    gcTime: FIVE_MINUTES * 2,
  });
}
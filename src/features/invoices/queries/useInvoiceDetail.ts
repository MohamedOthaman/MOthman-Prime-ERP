import { useQuery } from "@tanstack/react-query";
import { fetchInvoiceDetail } from "@/features/invoices/salesInvoiceService";
import { invoiceKeys } from "./keys";

export function useInvoiceDetail(invoiceId: string | null | undefined) {
  return useQuery({
    queryKey: invoiceKeys.detail(invoiceId ?? ""),
    queryFn: () => fetchInvoiceDetail(invoiceId as string),
    enabled: Boolean(invoiceId),
    staleTime: 15_000,
  });
}

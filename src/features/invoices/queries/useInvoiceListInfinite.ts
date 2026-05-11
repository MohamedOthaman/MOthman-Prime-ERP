import { useInfiniteQuery } from "@tanstack/react-query";
import {
  fetchInvoiceListPage,
  type InvoiceListPageCursor,
  type SalesInvoiceStatus,
} from "@/features/invoices/salesInvoiceService";
import { invoiceKeys } from "./keys";

export interface InvoiceListInfiniteFilters {
  status?: SalesInvoiceStatus | "all";
  salesmanId?: string | null;
  search?: string | null;
  pageSize?: number;
}

export function useInvoiceListInfinite(
  filters: InvoiceListInfiniteFilters,
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery({
    queryKey: [...invoiceKeys.lists(), "infinite", filters] as const,
    queryFn: ({ pageParam }: { pageParam: InvoiceListPageCursor | null }) =>
      fetchInvoiceListPage({
        status: filters.status,
        salesmanId: filters.salesmanId,
        search: filters.search,
        pageSize: filters.pageSize ?? 50,
        cursor: pageParam,
      }),
    initialPageParam: null as InvoiceListPageCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}
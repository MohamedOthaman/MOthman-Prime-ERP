import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cancelInvoice,
  markInvoiceDone,
  markInvoiceReceived,
  postSalesInvoice,
  saveSalesInvoiceDraft,
} from "@/features/invoices/salesInvoiceService";
import { invoiceKeys } from "./keys";

export function useSaveInvoiceDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSalesInvoiceDraft,
    onSuccess: (headerId) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(headerId) });
    },
  });
}

export function usePostSalesInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postSalesInvoice,
    onSuccess: (_data, headerId) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(headerId) });
    },
  });
}

export function useMarkInvoiceDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markInvoiceDone,
    onSuccess: (_data, headerId) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(headerId) });
    },
  });
}

export function useMarkInvoiceReceived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markInvoiceReceived,
    onSuccess: (_data, headerId) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(headerId) });
    },
  });
}

export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ headerId, reason }: { headerId: string; reason: string }) =>
      cancelInvoice(headerId, reason),
    onSuccess: (_data, { headerId }) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(headerId) });
    },
  });
}
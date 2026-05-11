import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDatabase } from "@/database/DatabaseProvider";
import { useOfflineStatus } from "@/offline/OfflineProvider";
import { saveSalesInvoiceDraft } from "@/features/invoices/salesInvoiceService";
import { enqueue } from "@/sync/outbox";
import {
  SALES_INVOICE_DRAFT_ENTITY,
  ensureSalesInvoiceHandlersRegistered,
  type SalesInvoiceDraftPayload,
} from "@/sync/handlers/salesInvoice";
import { invoiceKeys } from "./keys";

function isFeatureEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem("food-choice-erp.offline.invoice") !== "0";
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface OfflineSaveDraftResult {
  headerId: string;
  /** Where the save landed: "online" hit Supabase synchronously, "queued" is local-only. */
  mode: "online" | "queued";
}

/**
 * Saves a sales-invoice draft with offline fallback.
 *
 * - When online + reachable: hits Supabase synchronously via the existing service.
 * - When offline OR Supabase unreachable: writes a local mirror row + outbox entry,
 *   resolves immediately, and the worker drains it when connectivity returns.
 *
 * The handler registry is initialised lazily on first use so the sync worker
 * has a registered handler before any offline-queued draft has a chance to drain.
 */
export function useOfflineSaveDraft() {
  const db = useDatabase();
  const offline = useOfflineStatus();
  const qc = useQueryClient();

  return useMutation<OfflineSaveDraftResult, Error, SalesInvoiceDraftPayload>({
    mutationFn: async (payload) => {
      ensureSalesInvoiceHandlersRegistered();

      const online = offline.isOnline && offline.supabaseReachable;
      const enabled = isFeatureEnabled();

      if (online || !enabled) {
        const headerId = await saveSalesInvoiceDraft(payload);
        return { headerId, mode: "online" };
      }

      const headerId = payload.headerId ?? generateId();

      const localRow = {
        id: headerId,
        invoice_no: payload.invoiceNo,
        invoice_date: payload.invoiceDate,
        customer_id: payload.customerId,
        salesman_id: payload.salesmanId || null,
        notes: payload.notes || null,
        status: "draft" as const,
        total_amount: payload.totalAmount,
        _local: true,
        _updatedAt: Date.now(),
      };

      await db.put("sales_headers_local", localRow);
      await enqueue(db, {
        entity: SALES_INVOICE_DRAFT_ENTITY,
        op: payload.headerId ? "update" : "create",
        payload: { ...payload, headerId },
      });

      return { headerId, mode: "queued" };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(result.headerId) });
    },
  });
}
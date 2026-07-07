/**
 * Manual stock corrections — movement-backed, never a direct overwrite.
 *
 * Calls the record_stock_adjustment RPC
 * (supabase/migrations/20260707110000_stock_adjustment_rpc.sql): one
 * ADJUSTMENT movement + qty_available update, atomic, audited, never
 * negative. Until that reviewed migration is applied the call fails with a
 * clear message and NO stock is touched — there is deliberately no
 * client-side fallback, because a non-atomic fallback could corrupt stock.
 */
import { supabase } from "@/integrations/supabase/client";

export interface StockAdjustmentResult {
  success: boolean;
  qty_available?: number;
  error?: string;
}

export async function recordStockAdjustment(
  batchId: string,
  qtyDelta: number,
  reason: string
): Promise<StockAdjustmentResult> {
  // Not in generated types until the reviewed migration is applied.
  const { data, error } = await (supabase.rpc as any)("record_stock_adjustment", {
    p_batch_id: batchId,
    p_qty_delta: qtyDelta,
    p_reason: reason,
  });

  if (error) {
    if (error.code === "PGRST202") {
      return {
        success: false,
        error:
          "Stock adjustments are not provisioned yet (apply migration 20260707110000_stock_adjustment_rpc.sql).",
      };
    }
    return { success: false, error: error.message };
  }

  const result = data as { success?: boolean; qty_available?: number; error?: string } | null;
  if (!result?.success) {
    return { success: false, error: result?.error ?? "Adjustment failed" };
  }
  return { success: true, qty_available: Number(result.qty_available ?? 0) };
}

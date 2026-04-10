import { supabase } from "@/integrations/supabase/client";

export interface PickingExecLine {
  id: string;
  invoice_line_id: string;
  product_id: string;
  qty_required: number;
  qty_scanned: number;
  picked_at: string | null;
}

export interface PickingExecLineFull extends PickingExecLine {
  qty_confirmed: number | null;
  loaded_at: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  inventory_batch_id: string | null;
  inventory_movement_id: string | null;
  returned_qty: number;
}

export interface PickingSession {
  id: string;
  status: "in_progress" | "completed" | "cancelled";
  started_by: string | null;
  started_at: string;
  confirmed_at: string | null;
  confirmed_by?: string | null;
}

export async function startOrGetPickingSession(invoiceId: string): Promise<{
  session: PickingSession;
  lines: PickingExecLine[];
}> {
  const { data, error } = await supabase.rpc("start_or_get_picking_session" as any, {
    p_invoice_id: invoiceId,
  });
  if (error) throw new Error(error.message);
  const result = data as any;
  if (!result?.success) throw new Error(result?.error ?? "Failed to start picking session");
  return {
    session: result.session as PickingSession,
    lines: ((result.lines ?? []) as PickingExecLine[]).map((l) => ({
      ...l,
      qty_required: Number(l.qty_required),
      qty_scanned: Number(l.qty_scanned),
    })),
  };
}

export async function recordOutboundScan(
  invoiceId: string,
  barcode: string,
  qty = 1
): Promise<{
  product_id: string;
  qty_scanned: number;
  qty_required: number;
  remaining: number;
  line_complete: boolean;
}> {
  const { data, error } = await supabase.rpc("record_outbound_scan" as any, {
    p_invoice_id: invoiceId,
    p_barcode: barcode,
    p_qty: qty,
  });
  if (error) throw new Error(error.message);
  const result = data as any;
  if (!result?.success) {
    const err = new Error(result?.error ?? "Scan failed") as Error & { code?: string };
    err.code = result?.code;
    throw err;
  }
  return {
    product_id: result.product_id,
    qty_scanned: Number(result.qty_scanned),
    qty_required: Number(result.qty_required),
    remaining: Number(result.remaining),
    line_complete: Boolean(result.line_complete),
  };
}

export async function confirmPickingDone(invoiceId: string): Promise<void> {
  const { data, error } = await supabase.rpc("confirm_picking_done" as any, {
    p_invoice_id: invoiceId,
  });
  if (error) throw new Error(error.message);
  const result = data as any;
  if (!result?.success) {
    const err = new Error(result?.error ?? "Failed to confirm picking") as Error & { code?: string };
    err.code = result?.code;
    throw err;
  }
}

export async function fetchExecutionSummary(invoiceId: string): Promise<{
  session: PickingSession;
  lines: PickingExecLineFull[];
} | null> {
  const { data: session, error: sErr } = await supabase
    .from("outbound_execution_sessions" as any)
    .select("id, status, started_by, started_at, confirmed_by, confirmed_at")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (sErr) throw new Error(sErr.message);
  if (!session) return null;

  const { data: lines, error: lErr } = await supabase
    .from("outbound_execution_lines" as any)
    .select(
      "id, invoice_line_id, product_id, qty_required, qty_scanned, qty_confirmed, picked_at, loaded_at, batch_no, expiry_date, inventory_batch_id, inventory_movement_id, returned_qty"
    )
    .eq("session_id", (session as any).id)
    .order("created_at", { ascending: true });

  if (lErr) throw new Error(lErr.message);

  return {
    session: session as PickingSession,
    lines: ((lines ?? []) as any[]).map((l) => ({
      id:                    l.id,
      invoice_line_id:       l.invoice_line_id,
      product_id:            l.product_id,
      qty_required:          Number(l.qty_required),
      qty_scanned:           Number(l.qty_scanned),
      qty_confirmed:         l.qty_confirmed != null ? Number(l.qty_confirmed) : null,
      picked_at:             l.picked_at ?? null,
      loaded_at:             l.loaded_at ?? null,
      batch_no:              l.batch_no ?? null,
      expiry_date:           l.expiry_date ?? null,
      inventory_batch_id:    l.inventory_batch_id ?? null,
      inventory_movement_id: l.inventory_movement_id ?? null,
      returned_qty:          Number(l.returned_qty ?? 0),
    })) satisfies PickingExecLineFull[],
  };
}

import { supabase } from "@/integrations/supabase/client";
import { normalizeStatus, type GRNWorkflowStatus } from "@/config/workflowConfig";

// ─── Types ──────────────────────────────────────────────────────────────────

export type QcLineStatus = "pending" | "pass" | "reject" | "hold";

export interface GrnQcQueueRow {
  id: string;
  grn_no: string;
  supplier_name: string | null;
  po_no: string | null;
  arrival_date: string | null;
  transaction_date: string | null;
  status: GRNWorkflowStatus;
  municipality_reference_no: string | null;
  municipality_notes: string | null;
  line_count: number;
  pending_count: number;
  pass_count: number;
  reject_count: number;
  hold_count: number;
}

export interface GrnQcHeaderRecord {
  id: string;
  grn_no: string;
  supplier_name: string | null;
  po_no: string | null;
  arrival_date: string | null;
  transaction_date: string | null;
  remarks: string | null;
  manual_invoice_no: string | null;
  status: GRNWorkflowStatus;
  municipality_reference_no: string | null;
  municipality_notes: string | null;
  inspected_at: string | null;
  municipality_submitted_at: string | null;
  municipality_approved_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
}

export interface GrnQcLineRecord {
  id: string;
  line_no: number;
  product_id: string | null;
  product_code: string | null;
  product_name: string;
  store: string | null;
  uom: string | null;
  barcode: string | null;
  batch_no: string | null;
  production_date: string | null;
  expiry_date: string | null;
  received_quantity: number;
  short_excess_quantity: number;
  short_excess_reason: string | null;
  qc_status: QcLineStatus;
  qc_reason: string | null;
  qc_notes: string | null;
  qc_checked_quantity: number | null;
  qc_inspected_at: string | null;
  // Discrepancy
  qty_damaged: number;
  qty_missing: number;
  qty_sample: number;
  qty_accepted: number | null;
  // Putaway
  putaway_warehouse_id: string | null;
  putaway_zone_id: string | null;
  putaway_location_ref: string | null;
}

export interface ReceivingPostResult {
  success: boolean;
  status?: string;
  batches_created?: number;
  lines_skipped?: number;
  error?: string;
  code?: string;
  line_no?: number;
}

// ─── Normalise helpers ───────────────────────────────────────────────────────

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeQcStatus(value: string | null | undefined): QcLineStatus {
  // Normalise legacy DB values (passed/rejected → pass/reject)
  if (value === "pass"   || value === "passed")   return "pass";
  if (value === "reject" || value === "rejected")  return "reject";
  if (value === "hold")                            return "hold";
  return "pending";
}

// ─── Queue ───────────────────────────────────────────────────────────────────

export async function fetchGrnQcQueue(): Promise<GrnQcQueueRow[]> {
  const [headersResult, linesResult] = await Promise.all([
    supabase
      .from("receiving_headers" as any)
      .select(
        "id, grn_no, supplier_name, po_no, arrival_date, transaction_date, status, municipality_reference_no, municipality_notes"
      )
      .in("status", ["received","inspected","municipality_pending","approved","partial_hold","completed"])
      .order("created_at", { ascending: false }),
    supabase
      .from("receiving_lines" as any)
      .select("id, header_id, qc_status, received_quantity, quantity, qty"),
  ]);

  if (headersResult.error) throw new Error(`Failed to load GRN queue: ${headersResult.error.message}`);
  if (linesResult.error)   throw new Error(`Failed to load GRN queue lines: ${linesResult.error.message}`);

  const summaryByHeader = new Map<string, {
    line_count: number; pending_count: number;
    pass_count: number; reject_count: number; hold_count: number;
  }>();

  ((linesResult.data ?? []) as any[]).forEach((line) => {
    const headerId = line.header_id as string | null;
    if (!headerId) return;

    const receivedQty = toNumber(line.received_quantity ?? line.quantity ?? line.qty);
    if (receivedQty <= 0) return;

    const cur = summaryByHeader.get(headerId) ?? {
      line_count: 0, pending_count: 0, pass_count: 0, reject_count: 0, hold_count: 0,
    };
    cur.line_count++;
    const s = normalizeQcStatus(line.qc_status);
    if (s === "pass")    cur.pass_count++;
    if (s === "reject")  cur.reject_count++;
    if (s === "hold")    cur.hold_count++;
    if (s === "pending") cur.pending_count++;
    summaryByHeader.set(headerId, cur);
  });

  return ((headersResult.data ?? []) as any[]).map((row): GrnQcQueueRow => {
    const summary = summaryByHeader.get(row.id) ?? {
      line_count: 0, pending_count: 0, pass_count: 0, reject_count: 0, hold_count: 0,
    };
    return {
      id: row.id,
      grn_no: row.grn_no ?? "",
      supplier_name: row.supplier_name ?? null,
      po_no: row.po_no ?? null,
      arrival_date: row.arrival_date ?? null,
      transaction_date: row.transaction_date ?? null,
      status: normalizeStatus(row.status ?? "draft"),
      municipality_reference_no: row.municipality_reference_no ?? null,
      municipality_notes: row.municipality_notes ?? null,
      ...summary,
    };
  });
}

// ─── Detail ──────────────────────────────────────────────────────────────────

export async function fetchGrnQcRecord(headerId: string) {
  const [headerResult, linesResult] = await Promise.all([
    supabase
      .from("receiving_headers" as any)
      .select("id, grn_no, supplier_name, po_no, arrival_date, transaction_date, remarks, manual_invoice_no, status, municipality_reference_no, municipality_notes, inspected_at, municipality_submitted_at, municipality_approved_at, approved_at, completed_at, completed_by")
      .eq("id", headerId)
      .single(),
    supabase
      .from("receiving_lines" as any)
      .select("id, line_no, product_id, product_code, product_name, store, uom, barcode, batch_no, production_date, expiry_date, received_quantity, quantity, qty, short_excess_quantity, short_excess_reason, qc_status, qc_reason, qc_notes, qc_checked_quantity, qc_inspected_at, qty_damaged, qty_missing, qty_sample, qty_accepted, putaway_warehouse_id, putaway_zone_id, putaway_location_ref")
      .eq("header_id", headerId)
      .order("line_no", { ascending: true }),
  ]);

  if (headerResult.error || !headerResult.data) {
    throw new Error(headerResult.error?.message ?? "GRN QC record not found.");
  }
  if (linesResult.error) {
    throw new Error(`Failed to load GRN QC lines: ${linesResult.error.message}`);
  }

  const h = headerResult.data as any;

  return {
    header: {
      id:                         h.id,
      grn_no:                     h.grn_no ?? "",
      supplier_name:              h.supplier_name ?? null,
      po_no:                      h.po_no ?? null,
      arrival_date:               h.arrival_date ?? null,
      transaction_date:           h.transaction_date ?? null,
      remarks:                    h.remarks ?? null,
      manual_invoice_no:          h.manual_invoice_no ?? null,
      status:                     normalizeStatus(h.status ?? "draft"),
      municipality_reference_no:  h.municipality_reference_no ?? null,
      municipality_notes:         h.municipality_notes ?? null,
      inspected_at:               h.inspected_at ?? null,
      municipality_submitted_at:  h.municipality_submitted_at ?? null,
      municipality_approved_at:   h.municipality_approved_at ?? null,
      approved_at:                h.approved_at ?? null,
      completed_at:               h.completed_at ?? null,
      completed_by:               h.completed_by ?? null,
    } satisfies GrnQcHeaderRecord,
    lines: ((linesResult.data ?? []) as any[]).map((row): GrnQcLineRecord => ({
      id:                    row.id,
      line_no:               Number(row.line_no ?? 0),
      product_id:            row.product_id ?? null,
      product_code:          row.product_code ?? null,
      product_name:          row.product_name ?? "",
      store:                 row.store ?? null,
      uom:                   row.uom ?? null,
      barcode:               row.barcode ?? null,
      batch_no:              row.batch_no ?? null,
      production_date:       row.production_date ?? null,
      expiry_date:           row.expiry_date ?? null,
      received_quantity:     toNumber(row.received_quantity ?? row.quantity ?? row.qty),
      short_excess_quantity: toNumber(row.short_excess_quantity),
      short_excess_reason:   row.short_excess_reason ?? null,
      qc_status:             normalizeQcStatus(row.qc_status),
      qc_reason:             row.qc_reason ?? null,
      qc_notes:              row.qc_notes ?? null,
      qc_checked_quantity:   row.qc_checked_quantity == null ? null : toNumber(row.qc_checked_quantity),
      qc_inspected_at:       row.qc_inspected_at ?? null,
      qty_damaged:           toNumber(row.qty_damaged),
      qty_missing:           toNumber(row.qty_missing),
      qty_sample:            toNumber(row.qty_sample),
      qty_accepted:          row.qty_accepted == null ? null : toNumber(row.qty_accepted),
      putaway_warehouse_id:  row.putaway_warehouse_id ?? null,
      putaway_zone_id:       row.putaway_zone_id ?? null,
      putaway_location_ref:  row.putaway_location_ref ?? null,
    })),
  };
}

// ─── Save QC ─────────────────────────────────────────────────────────────────

export async function saveGrnQcRecord(input: {
  headerId: string;
  userId: string | null;
  targetStatus: GRNWorkflowStatus;
  municipalityReferenceNo?: string;
  municipalityNotes?: string;
  lines: Array<{
    id: string;
    qc_status: QcLineStatus;
    qc_reason: string | null;
    qc_notes: string | null;
    qc_checked_quantity: number | null;
    qty_damaged?: number;
    qty_missing?: number;
    qty_sample?: number;
    qty_accepted?: number | null;
    putaway_location_ref?: string | null;
  }>;
}): Promise<void> {
  const now = new Date().toISOString();

  for (const line of input.lines) {
    const { error } = await supabase
      .from("receiving_lines" as any)
      .update({
        qc_status:           line.qc_status,
        qc_reason:           line.qc_reason,
        qc_notes:            line.qc_notes,
        qc_checked_quantity: line.qc_status === "pending" ? null : line.qc_checked_quantity,
        qc_inspected_at:     line.qc_status === "pending" ? null : now,
        qc_inspected_by:     line.qc_status === "pending" ? null : input.userId,
        qty_damaged:         line.qty_damaged ?? 0,
        qty_missing:         line.qty_missing ?? 0,
        qty_sample:          line.qty_sample  ?? 0,
        qty_accepted:        line.qty_accepted ?? null,
        putaway_location_ref: line.putaway_location_ref ?? null,
      })
      .eq("id", line.id);

    if (error) throw new Error(`Failed to save QC lines: ${error.message}`);
  }

  const headerPayload: Record<string, unknown> = {
    municipality_reference_no: input.municipalityReferenceNo?.trim() || null,
    municipality_notes:        input.municipalityNotes?.trim() || null,
    status:                    input.targetStatus,
  };

  if (input.targetStatus === "inspected") {
    headerPayload.inspected_at = now;
    headerPayload.inspected_by = input.userId;
  }
  if (input.targetStatus === "municipality_pending") {
    headerPayload.municipality_submitted_at = now;
    headerPayload.municipality_submitted_by = input.userId;
  }
  if (input.targetStatus === "approved") {
    headerPayload.municipality_approved_at = now;
    headerPayload.municipality_approved_by = input.userId;
    headerPayload.approved_at  = now;
    headerPayload.approved_by  = input.userId;
  }

  const { error } = await supabase
    .from("receiving_headers" as any)
    .update(headerPayload)
    .eq("id", input.headerId);

  if (error) throw new Error(`Failed to update GRN QC status: ${error.message}`);
}

// ─── Post to Inventory ───────────────────────────────────────────────────────

export async function postReceivingToInventory(grnId: string): Promise<ReceivingPostResult> {
  const { data, error } = await supabase.rpc(
    "post_receiving_to_inventory" as any,
    { p_grn_id: grnId }
  );
  if (error) throw new Error(error.message);
  return data as ReceivingPostResult;
}

// ─── Posting summary (batches created for a GRN) ─────────────────────────────

export async function fetchReceivingPostingSummary(grnId: string): Promise<{
  batchCount: number;
  totalQty: number;
  movements: Array<{
    product_id: string;
    batch_no: string | null;
    expiry_date: string | null;
    qty_in: number;
    location_ref: string | null;
    batch_id: string;
  }>;
}> {
  const { data, error } = await supabase
    .from("inventory_movements" as any)
    .select("batch_id, product_id, batch_no, expiry_date, qty_in, location_ref")
    .eq("reference_id", grnId)
    .eq("movement_type", "INBOUND")
    .order("performed_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as any[]).map((r) => ({
    batch_id:    r.batch_id   as string,
    product_id:  r.product_id as string,
    batch_no:    r.batch_no   as string | null,
    expiry_date: r.expiry_date as string | null,
    qty_in:      Number(r.qty_in ?? 0),
    location_ref: r.location_ref as string | null,
  }));

  return {
    batchCount: rows.length,
    totalQty:   rows.reduce((s, r) => s + r.qty_in, 0),
    movements:  rows,
  };
}

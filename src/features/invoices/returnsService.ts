import { supabase } from "@/integrations/supabase/client";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ReturnStatus = "draft" | "received" | "reviewed" | "posted" | "cancelled";
export type ReturnCondition = "OK" | "DMG" | "EXPIRY";

export interface SalesReturn {
  id: string;
  return_no: string | null;
  invoice_id: string;
  customer_id: string | null;
  status: ReturnStatus;
  notes: string | null;
  total_amount: number;
  created_by: string | null;
  received_by: string | null;
  reviewed_by: string | null;
  posted_by: string | null;
  created_at: string;
  received_at: string | null;
  reviewed_at: string | null;
  posted_at: string | null;
  updated_at: string;
  // joined
  invoice_number?: string | null;
  customer_name?: string | null;
}

export interface SalesReturnLine {
  id: string;
  return_id: string;
  invoice_line_id: string | null;
  outbound_execution_line_id: string | null;
  allocation_id: string | null;
  product_id: string;
  qty_returned: number;
  unit_price: number | null;
  reason: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  condition: ReturnCondition | null;
  return_movement_id: string | null;
  created_at: string;
  // enriched fields (set by fetchReturnDetails)
  product_name?: string | null;
  item_code?: string | null;
}

/**
 * Allocation-level return trace. One row per outbound batch slice consumed
 * by a return line. Source of truth for exact per-batch returned quantities.
 */
export interface SalesReturnAllocation {
  id: string;
  return_line_id: string;
  outbound_execution_allocation_id: string | null;
  outbound_execution_line_id: string | null;
  invoice_id: string | null;
  invoice_line_id: string | null;
  product_id: string;
  batch_id: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  qty_returned: number;
  condition: ReturnCondition | null;
  return_movement_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ReturnLineInput {
  invoice_line_id: string | null;
  outbound_execution_line_id: string | null;
  product_id: string;
  qty_returned: number;
  unit_price?: number | null;
  reason?: string | null;
  batch_no?: string | null;
  expiry_date?: string | null;
  condition: ReturnCondition;
}

export interface InvoiceReturnSummary {
  documents: SalesReturn[];
  totalReturnedQty: number;
  lineReturns: Record<string, number>;   // invoice_line_id → sum returned
  countsByStatus: Record<ReturnStatus, number>;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

export async function fetchReturnQueue(filters?: {
  status?: ReturnStatus | "all";
  limit?: number;
}): Promise<SalesReturn[]> {
  let q = (supabase as any)
    .from("sales_returns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }

  const { data: returns, error } = await q;
  if (error) throw new Error(error.message);
  if (!returns?.length) return [];

  // Enrich with invoice info
  const invoiceIds = [...new Set((returns as any[]).map((r: any) => r.invoice_id))];
  const { data: invoices } = await supabase
    .from("sales_invoices" as any)
    .select("id, invoice_number, customer_name")
    .in("id", invoiceIds);

  const invMap = new Map(((invoices ?? []) as any[]).map((i) => [i.id, i]));

  return (returns as any[]).map((r) => ({
    ...r,
    total_amount: Number(r.total_amount ?? 0),
    invoice_number: invMap.get(r.invoice_id)?.invoice_number ?? null,
    customer_name: invMap.get(r.invoice_id)?.customer_name ?? null,
  })) as SalesReturn[];
}

export async function fetchReturnDetails(returnId: string): Promise<{
  returnDoc: SalesReturn;
  lines: SalesReturnLine[];
  allocations: SalesReturnAllocation[];
  invoiceDetail: { invoice_number: string | null; customer_name: string | null; invoice_date: string } | null;
}> {
  const { data: doc, error: docErr } = await supabase
    .from("sales_returns" as any)
    .select("*")
    .eq("id", returnId)
    .single();

  if (docErr || !doc) throw new Error(docErr?.message ?? "Return not found");

  const [linesResult, allocsResult, invResult] = await Promise.allSettled([
    supabase
      .from("sales_return_lines" as any)
      .select("*")
      .eq("return_id", returnId)
      .order("created_at", { ascending: true }),
    supabase
      .from("sales_return_allocations" as any)
      .select("*")
      .eq("return_line_id.return_id" as any, returnId) // will re-do via line ids below
      .limit(0), // placeholder — real query below
    supabase
      .from("sales_invoices" as any)
      .select("invoice_number, customer_name, invoice_date")
      .eq("id", (doc as any).invoice_id)
      .maybeSingle(),
  ]);

  const rawLines: SalesReturnLine[] =
    linesResult.status === "fulfilled"
      ? ((linesResult.value.data ?? []) as any[]).map((l) => ({
          ...l,
          qty_returned: Number(l.qty_returned),
          unit_price: l.unit_price != null ? Number(l.unit_price) : null,
        })) as SalesReturnLine[]
      : [];

  // Enrich lines with product names
  let lines = rawLines;
  if (rawLines.length > 0) {
    const productIds = [...new Set(rawLines.map((l) => l.product_id))];
    const { data: prods } = await supabase
      .from("products_overview" as any)
      .select("id, name, name_en, item_code")
      .in("id", productIds);
    const prodMap = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]));
    lines = rawLines.map((l) => ({
      ...l,
      product_name: (prodMap.get(l.product_id) as any)?.name ?? (prodMap.get(l.product_id) as any)?.name_en ?? null,
      item_code:    (prodMap.get(l.product_id) as any)?.item_code ?? null,
    }));
  }

  // Fetch allocations for this return's lines
  let allocations: SalesReturnAllocation[] = [];
  if (lines.length > 0) {
    const lineIds = lines.map((l) => l.id);
    const { data: allocData } = await supabase
      .from("sales_return_allocations" as any)
      .select("*")
      .in("return_line_id", lineIds)
      .order("created_at", { ascending: true });
    allocations = ((allocData ?? []) as any[]).map((a) => ({
      ...a,
      qty_returned: Number(a.qty_returned),
    })) as SalesReturnAllocation[];
  }

  const inv =
    invResult.status === "fulfilled" ? (invResult.value.data as any) : null;

  return {
    returnDoc: {
      ...(doc as any),
      total_amount: Number((doc as any).total_amount ?? 0),
      invoice_number: inv?.invoice_number ?? null,
      customer_name: inv?.customer_name ?? null,
    } as SalesReturn,
    lines,
    allocations,
    invoiceDetail: inv
      ? {
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name,
          invoice_date: inv.invoice_date,
        }
      : null,
  };
}

export async function fetchInvoiceReturnSummary(invoiceId: string): Promise<InvoiceReturnSummary> {
  const { data: docs, error } = await supabase
    .from("sales_returns" as any)
    .select("id, return_no, status, total_amount, created_at, received_at, posted_at")
    .eq("invoice_id", invoiceId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const documents = ((docs ?? []) as any[]).map((d) => ({
    ...d,
    total_amount: Number(d.total_amount ?? 0),
  })) as SalesReturn[];

  // Count by status
  const countsByStatus: Record<ReturnStatus, number> = {
    draft: 0, received: 0, reviewed: 0, posted: 0, cancelled: 0,
  };
  for (const d of documents) {
    if (d.status in countsByStatus) {
      countsByStatus[d.status as ReturnStatus]++;
    }
  }

  if (!documents.length) {
    return { documents: [], totalReturnedQty: 0, lineReturns: {}, countsByStatus };
  }

  const returnIds = documents.map((d) => d.id);
  const { data: lines } = await supabase
    .from("sales_return_lines" as any)
    .select("return_id, invoice_line_id, qty_returned")
    .in("return_id", returnIds);

  const lineReturns: Record<string, number> = {};
  let totalReturnedQty = 0;

  ((lines ?? []) as any[]).forEach((l: any) => {
    const qty = Number(l.qty_returned ?? 0);
    totalReturnedQty += qty;
    if (l.invoice_line_id) {
      lineReturns[l.invoice_line_id] = (lineReturns[l.invoice_line_id] ?? 0) + qty;
    }
  });

  return { documents, totalReturnedQty, lineReturns, countsByStatus };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function createDraftReturn(
  invoiceId: string,
  customerId: string | null,
  notes?: string
): Promise<string> {
  const { data, error } = await supabase
    .from("sales_returns" as any)
    .insert({ invoice_id: invoiceId, customer_id: customerId, notes: notes ?? null })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return (data as any).id as string;
}

export async function addReturnLines(
  returnId: string,
  lines: ReturnLineInput[]
): Promise<void> {
  const rows = lines.map((l) => ({
    return_id: returnId,
    invoice_line_id: l.invoice_line_id,
    outbound_execution_line_id: l.outbound_execution_line_id,
    product_id: l.product_id,
    qty_returned: l.qty_returned,
    unit_price: l.unit_price ?? null,
    reason: l.reason ?? null,
    batch_no: l.batch_no ?? null,
    expiry_date: l.expiry_date ?? null,
    condition: l.condition,
  }));

  const { error } = await supabase.from("sales_return_lines" as any).insert(rows);
  if (error) throw new Error(error.message);
}

export async function deleteReturnLine(lineId: string): Promise<void> {
  const { error } = await supabase
    .from("sales_return_lines" as any)
    .delete()
    .eq("id", lineId);
  if (error) throw new Error(error.message);
}

export async function updateReturnNotes(returnId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from("sales_returns" as any)
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", returnId);
  if (error) throw new Error(error.message);
}

export async function receiveReturn(returnId: string): Promise<void> {
  const { data, error } = await supabase.rpc("receive_sales_return" as any, {
    p_return_id: returnId,
  });
  if (error) throw new Error(error.message);
  const result = data as any;
  if (!result?.success) {
    const err = new Error(result?.error ?? "Failed to receive return") as Error & { code?: string };
    err.code = result?.code;
    throw err;
  }
}

export async function postReturn(returnId: string): Promise<void> {
  const { data, error } = await supabase.rpc("post_sales_return" as any, {
    p_return_id: returnId,
  });
  if (error) throw new Error(error.message);
  const result = data as any;
  if (!result?.success) {
    const err = new Error(result?.error ?? "Failed to post return") as Error & { code?: string };
    err.code = result?.code;
    throw err;
  }
}

export async function cancelReturn(returnId: string): Promise<void> {
  const { error } = await supabase
    .from("sales_returns" as any)
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", returnId)
    .in("status", ["draft"]);
  if (error) throw new Error(error.message);
}

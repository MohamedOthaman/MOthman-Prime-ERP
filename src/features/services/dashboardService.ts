/**
 * dashboardService — centralized, typed data-fetching functions for role dashboards.
 *
 * Each function fetches one focused domain slice. Dashboards compose from these
 * instead of scattering ad-hoc queries. This is also the data layer foundation
 * for the widget system.
 *
 * DB tables used:
 *   sales_headers              (invoices — status: draft/ready/done/received/cancelled/returns)
 *   grn_headers                (GRN receiving)
 *   grn_lines                  (QC line details)
 *   outbound_execution_sessions (picking)
 *   sales_returns              (returns — status: draft/received/cancelled)
 *   inventory_movements        (stock movements)
 *   customers                  (customer master)
 *   salesmen                   (salesman master)
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toN(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceStatusCounts {
  draft: number;
  ready: number;
  done: number;
  received: number;
  cancelled: number;
  returns: number;
  total: number;
  doneToday: number;
  receivedToday: number;
  recent: InvoiceRowSummary[];
}

export interface InvoiceRowSummary {
  id: string;
  invoice_no: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  customer_id: string | null;
}

export interface GrnStatusCounts {
  draft: number;
  received: number;
  inspected: number;
  municipality_pending: number;
  approved: number;
  partial_hold: number;
  completed: number;
  rejected: number;
  total: number;
  todayCount: number;
  recent: GrnRowSummary[];
}

export interface GrnRowSummary {
  id: string;
  grn_no: string | null;
  supplier_name: string | null;
  status: string;
  created_at: string;
}

export interface QcLineCounts {
  holdLines: number;
  rejectLines: number;
  awaitingPosting: number; // grn_headers status='approved'
}

export interface PickingStats {
  readyInvoices: number;   // sales_headers status='ready'
  activeSessions: number;  // outbound_execution_sessions in_progress
  doneToday: number;       // sessions confirmed today
}

export interface ReturnCounts {
  draft: number;    // pending / not yet posted
  received: number; // posted / processed
  cancelled: number;
  total: number;
}

export interface MovementsSummary {
  inboundToday: number;
  outboundToday: number;
  returnToday: number;
  totalToday: number;
}

export interface CustomerStats {
  total: number;
}

export interface SalesmanSummary {
  id: string;
  name: string;
  code: string | null;
  invoiceCount: number;
  revenue: number;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Invoice lifecycle counts from sales_headers.
 * Fetches last 50 to build status buckets + today counts.
 */
export async function fetchInvoiceStatusCounts(): Promise<InvoiceStatusCounts> {
  const { data, error } = await supabase
    .from("sales_headers" as any)
    .select("id, invoice_no, status, total_amount, created_at, customer_id")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Failed to load invoices: ${error.message}`);

  const rows = (data ?? []) as any[];
  const today = todayIso();

  const counts: InvoiceStatusCounts = {
    draft: 0, ready: 0, done: 0, received: 0, cancelled: 0, returns: 0,
    total: rows.length, doneToday: 0, receivedToday: 0,
    recent: rows.slice(0, 10).map(r => ({
      id: r.id,
      invoice_no: r.invoice_no ?? null,
      status: r.status ?? "draft",
      total_amount: toN(r.total_amount),
      created_at: r.created_at,
      customer_id: r.customer_id ?? null,
    })),
  };

  for (const row of rows) {
    const s = row.status ?? "draft";
    if (s in counts) (counts as any)[s]++;
    if (s === "done"     && (row.created_at ?? "").startsWith(today)) counts.doneToday++;
    if (s === "received" && (row.created_at ?? "").startsWith(today)) counts.receivedToday++;
  }

  return counts;
}

/**
 * GRN status counts from grn_headers.
 * Returns all-time counts + recent list for display.
 */
export async function fetchGrnStatusCounts(): Promise<GrnStatusCounts> {
  const { data, error } = await supabase
    .from("grn_headers" as any)
    .select("id, grn_no, supplier_name, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Failed to load GRNs: ${error.message}`);

  const rows = (data ?? []) as any[];
  const today = todayIso();

  const counts: GrnStatusCounts = {
    draft: 0, received: 0, inspected: 0, municipality_pending: 0,
    approved: 0, partial_hold: 0, completed: 0, rejected: 0,
    total: rows.length, todayCount: 0,
    recent: rows.slice(0, 8).map(r => ({
      id: r.id,
      grn_no: r.grn_no ?? null,
      supplier_name: r.supplier_name ?? null,
      status: r.status ?? "draft",
      created_at: r.created_at,
    })),
  };

  for (const row of rows) {
    const s = (row.status ?? "draft").replace(/-/g, "_") as keyof GrnStatusCounts;
    if (typeof counts[s] === "number") (counts as any)[s]++;
    if ((row.created_at ?? "").startsWith(today)) counts.todayCount++;
  }

  return counts;
}

/**
 * QC line-level counts: hold/reject lines across all GRNs + approved GRNs awaiting posting.
 */
export async function fetchQcLineCounts(): Promise<QcLineCounts> {
  const [holdRes, rejectRes, approvedRes] = await Promise.allSettled([
    supabase
      .from("grn_lines" as any)
      .select("id", { count: "exact", head: true })
      .eq("qc_status", "hold"),

    supabase
      .from("grn_lines" as any)
      .select("id", { count: "exact", head: true })
      .eq("qc_status", "reject"),

    supabase
      .from("grn_headers" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
  ]);

  return {
    holdLines:       holdRes.status    === "fulfilled" ? ((holdRes.value    as any).count ?? 0) : 0,
    rejectLines:     rejectRes.status  === "fulfilled" ? ((rejectRes.value  as any).count ?? 0) : 0,
    awaitingPosting: approvedRes.status === "fulfilled" ? ((approvedRes.value as any).count ?? 0) : 0,
  };
}

/**
 * Picking statistics: ready invoices + active/done-today sessions.
 */
export async function fetchPickingStats(): Promise<PickingStats> {
  const [readyRes, sessionsRes] = await Promise.allSettled([
    supabase
      .from("sales_headers" as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "ready"),

    supabase
      .from("outbound_execution_sessions" as any)
      .select("id, status, confirmed_at")
      .in("status", ["in_progress", "completed"]),
  ]);

  const readyInvoices = readyRes.status === "fulfilled"
    ? ((readyRes.value as any).count ?? 0)
    : 0;

  const sessions: any[] = sessionsRes.status === "fulfilled"
    ? ((sessionsRes.value as any).data ?? [])
    : [];

  const today = todayIso();
  const activeSessions  = sessions.filter(s => s.status === "in_progress").length;
  const doneToday       = sessions.filter(
    s => s.status === "completed" && (s.confirmed_at ?? "").startsWith(today)
  ).length;

  return { readyInvoices, activeSessions, doneToday };
}

/**
 * Sales returns counts.
 */
export async function fetchReturnCounts(): Promise<ReturnCounts> {
  const { data, error } = await supabase
    .from("sales_returns" as any)
    .select("id, status")
    .limit(500);

  if (error) throw new Error(`Failed to load returns: ${error.message}`);

  const rows = (data ?? []) as any[];
  const counts: ReturnCounts = { draft: 0, received: 0, cancelled: 0, total: rows.length };
  for (const r of rows) {
    const s = r.status ?? "draft";
    if (s in counts) (counts as any)[s]++;
  }
  return counts;
}

/**
 * Today's inventory movement summary.
 */
export async function fetchMovementsSummary(): Promise<MovementsSummary> {
  const today = todayIso();
  const { data, error } = await supabase
    .from("inventory_movements" as any)
    .select("movement_type")
    .gte("performed_at", `${today}T00:00:00Z`)
    .lte("performed_at", `${today}T23:59:59Z`);

  if (error) {
    return { inboundToday: 0, outboundToday: 0, returnToday: 0, totalToday: 0 };
  }

  const rows = (data ?? []) as any[];
  const summary: MovementsSummary = {
    inboundToday: 0, outboundToday: 0, returnToday: 0, totalToday: rows.length,
  };
  for (const r of rows) {
    if (r.movement_type === "INBOUND")  summary.inboundToday++;
    if (r.movement_type === "OUTBOUND") summary.outboundToday++;
    if (r.movement_type === "RETURN")   summary.returnToday++;
  }
  return summary;
}

/**
 * Customer and salesman counts/summaries for sales dashboards.
 */
export async function fetchSalesContext(): Promise<{
  customerCount: number;
  salesmen: SalesmanSummary[];
}> {
  const [custRes, salesmenRes] = await Promise.allSettled([
    supabase
      .from("customers" as any)
      .select("id", { count: "exact", head: true }),

    supabase
      .from("salesmen" as any)
      .select("id, name, code")
      .limit(30),
  ]);

  const customerCount = custRes.status === "fulfilled"
    ? ((custRes.value as any).count ?? 0)
    : 0;

  const salesmen: SalesmanSummary[] = (
    salesmenRes.status === "fulfilled"
      ? ((salesmenRes.value as any).data ?? [])
      : []
  ).map((s: any) => ({
    id:           s.id,
    name:         s.name ?? "Unknown",
    code:         s.code ?? null,
    invoiceCount: 0,
    revenue:      0,
  }));

  return { customerCount, salesmen };
}

/**
 * Enrich salesman list with invoice performance from a preloaded invoice array.
 */
export function enrichSalesmenWithInvoices(
  salesmen: SalesmanSummary[],
  invoices: InvoiceRowSummary[]
): SalesmanSummary[] {
  const perfMap: Record<string, { invoiceCount: number; revenue: number }> = {};
  for (const inv of invoices) {
    const sid = (inv as any).salesman_id ?? "__none__";
    if (!perfMap[sid]) perfMap[sid] = { invoiceCount: 0, revenue: 0 };
    perfMap[sid].invoiceCount++;
    perfMap[sid].revenue += inv.total_amount;
  }
  return salesmen
    .map(s => ({
      ...s,
      invoiceCount: perfMap[s.id]?.invoiceCount ?? 0,
      revenue:      perfMap[s.id]?.revenue ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

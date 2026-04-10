import { supabase } from "@/integrations/supabase/client";
import type {
    Customer,
    CustomersBySalesmanGroup,
    CustomersWithoutSalesmanRow,
} from "../reports/types";

// ─── Types for new reports ─────────────────────────────────────────────────────

export interface SalesmanPerformanceRow {
  id: string;
  name: string;
  code: string | null;
  totalInvoices: number;
  doneInvoices: number;
  totalRevenue: number;
  avgInvoiceValue: number;
}

export interface CustomerAnalysisRow {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  area: string | null;
  type: string | null;
  salesmanName: string | null;
  salesmanId: string | null;
  invoiceCount: number;
  totalRevenue: number;
  lastInvoiceDate: string | null;
}

export interface ProductPerformanceRow {
  product_id: string;
  code: string | null;
  item_code: string | null;
  name_en: string | null;
  brand: string | null;
  category: string | null;
  storage_type: string | null;
  available_quantity: number;
  batch_count: number;
  nearest_expiry: string | null;
  outbound30d: number;
}

function toReadableError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
    ) {
        return String((error as { message: unknown }).message);
    }
    return "An unexpected error occurred. Please try again.";
}

export async function getCustomersBySalesman(): Promise<CustomersBySalesmanGroup[]> {
    const { data, error } = await supabase
        .from("customers")
        .select(
            "id, code, name, name_ar, type, group_name, area, credit_days, credit_limit, is_active, salesman_id, salesmen!customers_salesman_id_fkey ( id, code, name, is_active )"
        )
        .not("salesman_id", "is", null)
        .or("is_active.eq.true,is_active.is.null")
        .order("name");

    if (error) {
        throw new Error(
            `Failed to load customers: ${toReadableError(error)}`
        );
    }

    const groupsMap = new Map<string, CustomersBySalesmanGroup>();

    (data as Customer[]).forEach((customer) => {
        const salesmanId = customer.salesman_id;
        const salesman = customer.salesmen;

        if (!salesmanId || !salesman) return;

        if (!groupsMap.has(salesmanId)) {
            groupsMap.set(salesmanId, { salesman, customers: [] });
        }

        groupsMap.get(salesmanId)!.customers.push(customer);
    });

    return Array.from(groupsMap.values()).sort((a, b) =>
        a.salesman.name.localeCompare(b.salesman.name)
    );
}

export async function getCustomersWithoutSalesman(): Promise<
    CustomersWithoutSalesmanRow[]
> {
    const { data, error } = await supabase
        .from("customers")
        .select(
            "id, code, name, name_ar, type, group_name, area, credit_days, credit_limit, is_active, salesman_id"
        )
        .is("salesman_id", null)
        .or("is_active.eq.true,is_active.is.null")
        .order("name");

    if (error) {
        throw new Error(
            `Failed to load unassigned customers: ${toReadableError(error)}`
        );
    }

    return (data ?? []).map((customer) => ({
        customer: customer as Customer,
    }));
}

// ─── Sales Performance ─────────────────────────────────────────────────────────

export async function getSalesPerformance(fromDate?: string, toDate?: string): Promise<SalesmanPerformanceRow[]> {
    // Fetch all salesmen
    const { data: salesmenData, error: salesmenErr } = await supabase
        .from("salesmen" as any)
        .select("id, name, code")
        .order("name");

    if (salesmenErr) throw new Error(`Failed to load salesmen: ${toReadableError(salesmenErr)}`);

    // Fetch invoices with salesman_id and financial fields
    let invoiceQuery = (supabase as any)
        .from("sales_headers")
        .select("id, salesman_id, status, total_amount, created_at")
        .limit(2000);

    if (fromDate) invoiceQuery = invoiceQuery.gte("created_at", `${fromDate}T00:00:00Z`);
    if (toDate)   invoiceQuery = invoiceQuery.lte("created_at", `${toDate}T23:59:59Z`);

    const { data: invoiceData } = await invoiceQuery;
    const invoices = (invoiceData ?? []) as any[];

    // Aggregate per salesman
    const perfMap: Record<string, { total: number; done: number; revenue: number }> = {};
    for (const inv of invoices) {
        const sid = inv.salesman_id ?? "__none__";
        if (!perfMap[sid]) perfMap[sid] = { total: 0, done: 0, revenue: 0 };
        perfMap[sid].total++;
        if (inv.status === "done" || inv.status === "received") perfMap[sid].done++;
        perfMap[sid].revenue += Number(inv.total_amount ?? 0);
    }

    const rows: SalesmanPerformanceRow[] = ((salesmenData ?? []) as any[]).map((s: any) => {
        const p = perfMap[s.id] ?? { total: 0, done: 0, revenue: 0 };
        return {
            id:              s.id,
            name:            s.name ?? "Unknown",
            code:            s.code ?? null,
            totalInvoices:   p.total,
            doneInvoices:    p.done,
            totalRevenue:    p.revenue,
            avgInvoiceValue: p.total > 0 ? Math.round(p.revenue / p.total) : 0,
        };
    });

    return rows.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// ─── Customer Analysis ─────────────────────────────────────────────────────────

export async function getCustomerAnalysis(salesmanId?: string): Promise<CustomerAnalysisRow[]> {
    let q = (supabase as any)
        .from("customers")
        .select("id, code, name, name_ar, area, type, salesman_id, salesmen!customers_salesman_id_fkey(id, name)")
        .order("name")
        .limit(1000);

    if (salesmanId) q = q.eq("salesman_id", salesmanId);

    const { data: custData, error: custErr } = await q;
    if (custErr) throw new Error(`Failed to load customers: ${toReadableError(custErr)}`);

    // Fetch invoice aggregates per customer
    const { data: invData } = await (supabase as any)
        .from("sales_headers")
        .select("customer_id, total_amount, created_at")
        .limit(5000);

    const invMap: Record<string, { count: number; revenue: number; lastDate: string | null }> = {};
    for (const inv of (invData ?? []) as any[]) {
        const cid = inv.customer_id;
        if (!cid) continue;
        if (!invMap[cid]) invMap[cid] = { count: 0, revenue: 0, lastDate: null };
        invMap[cid].count++;
        invMap[cid].revenue += Number(inv.total_amount ?? 0);
        if (!invMap[cid].lastDate || inv.created_at > invMap[cid].lastDate!) {
            invMap[cid].lastDate = inv.created_at;
        }
    }

    return ((custData ?? []) as any[]).map((c: any) => ({
        id:              c.id,
        code:            c.code ?? "",
        name:            c.name ?? "",
        name_ar:         c.name_ar ?? null,
        area:            c.area ?? null,
        type:            c.type ?? null,
        salesmanId:      c.salesman_id ?? null,
        salesmanName:    (c.salesmen as any)?.name ?? null,
        invoiceCount:    invMap[c.id]?.count    ?? 0,
        totalRevenue:    invMap[c.id]?.revenue  ?? 0,
        lastInvoiceDate: invMap[c.id]?.lastDate ?? null,
    }));
}

// ─── Product Performance ───────────────────────────────────────────────────────

export async function getProductPerformance(): Promise<ProductPerformanceRow[]> {
    const { data: stockData, error: stockErr } = await (supabase as any)
        .from("inventory_product_stock_summary")
        .select("product_id, code, item_code, name_en, brand, category, storage_type, available_quantity, batch_count, nearest_expiry")
        .limit(2000);

    if (stockErr) throw new Error(`Failed to load product stock: ${toReadableError(stockErr)}`);

    // Fetch outbound movements for last 30 days
    const from30d = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: outData } = await (supabase as any)
        .from("inventory_movements")
        .select("product_id, qty_out")
        .eq("movement_type", "OUTBOUND")
        .gte("performed_at", from30d)
        .limit(5000);

    const outMap: Record<string, number> = {};
    for (const row of (outData ?? []) as any[]) {
        outMap[row.product_id] = (outMap[row.product_id] ?? 0) + Number(row.qty_out ?? 0);
    }

    return ((stockData ?? []) as any[]).map((p: any) => ({
        product_id:         p.product_id,
        code:               p.code ?? null,
        item_code:          p.item_code ?? null,
        name_en:            p.name_en ?? null,
        brand:              p.brand ?? null,
        category:           p.category ?? null,
        storage_type:       p.storage_type ?? null,
        available_quantity: Number(p.available_quantity ?? 0),
        batch_count:        Number(p.batch_count ?? 0),
        nearest_expiry:     p.nearest_expiry ?? null,
        outbound30d:        outMap[p.product_id] ?? 0,
    }));
}

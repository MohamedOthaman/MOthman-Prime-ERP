import { supabase } from "@/integrations/supabase/client";
import { getAvailableBatches } from "@/features/services/inventoryService";
import { getProductDisplayName, type ProductDisplayLanguage } from "@/lib/productDisplay";

export type SalesInvoiceStatus = "draft" | "ready" | "done" | "received" | "cancelled" | "returns" | "posted";

export interface CustomerLookup {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  salesman_id: string | null;
}

export interface SalesmanLookup {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
}

export interface ProductLookup {
  id: string;
  item_code: string | null;
  name: string | null;
  name_en: string | null;
  name_ar: string | null;
  uom: string | null;
  primary_barcode: string | null;
  all_barcodes: string[] | null;
  selling_price: number | null;
  is_active: boolean;
}

export interface SalesHeaderRecord {
  id: string;
  invoice_no: string | null;
  invoice_date: string;
  customer_id: string | null;
  salesman_id: string | null;
  notes: string | null;
  status: SalesInvoiceStatus;
  total_amount: number | null;
}

export interface SalesLineRecord {
  id: string;
  line_no: number;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number | null;
}

export interface FefoPreviewAllocation {
  batch_no: string | null;
  expiry_date: string | null;
  allocated_qty: number;
  available_quantity: number;
}

function coerceRpcNumber(data: unknown) {
  if (typeof data === "number") return Number(data);

  if (Array.isArray(data)) {
    return coerceRpcNumber(data[0]);
  }

  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const candidate =
      row.available_quantity ??
      row.available_qty ??
      row.get_product_available_qty ??
      row.qty ??
      row.value ??
      0;

    return Number(candidate ?? 0);
  }

  return 0;
}

export function getProductLabel(product: ProductLookup, lang: ProductDisplayLanguage) {
  return getProductDisplayName(product, lang);
}

async function fetchProductLookups() {
  const baseQuery = supabase
    .from("products_overview" as any)
    .order("item_code", { ascending: true });

  const preferredResult = await baseQuery
    .select("id, item_code, name, name_en, name_ar, uom, primary_barcode, all_barcodes, selling_price, is_active")
    .or("is_active.eq.true,is_active.is.null");

  if (!preferredResult.error) {
    return preferredResult;
  }

  const message = preferredResult.error.message || "";
  const missingAllBarcodes =
    preferredResult.error.code === "42703" || message.includes("all_barcodes");

  if (!missingAllBarcodes) {
    return preferredResult;
  }

  const fallbackResult = await supabase
    .from("products_overview" as any)
    .select("id, item_code, name, name_en, name_ar, uom, primary_barcode, selling_price, is_active")
    .or("is_active.eq.true,is_active.is.null")
    .order("item_code", { ascending: true });

  if (fallbackResult.error) {
    return fallbackResult;
  }

  return {
    data: (fallbackResult.data ?? []).map((row: any) => ({
      ...row,
      all_barcodes: row.primary_barcode ? [row.primary_barcode] : [],
    })),
    error: null,
  };
}

export async function fetchSalesInvoiceLookups() {
  const [customersResult, salesmenResult, productsResult] = await Promise.all([
    supabase
      .from("customers" as any)
      .select("id, code, name, name_ar, salesman_id")
      .or("is_active.eq.true,is_active.is.null")
      .order("name", { ascending: true }),
    supabase
      .from("salesmen" as any)
      .select("id, code, name, name_ar")
      .or("is_active.eq.true,is_active.is.null")
      .order("name", { ascending: true }),
    fetchProductLookups(),
  ]);

  if (customersResult.error) {
    throw new Error(`Failed to load customers: ${customersResult.error.message}`);
  }

  if (salesmenResult.error) {
    throw new Error(`Failed to load salesmen: ${salesmenResult.error.message}`);
  }

  if (productsResult.error) {
    throw new Error(`Failed to load products: ${productsResult.error.message}`);
  }

  return {
    customers: (customersResult.data ?? []) as CustomerLookup[],
    salesmen: (salesmenResult.data ?? []) as SalesmanLookup[],
    products: ((productsResult.data ?? []) as ProductLookup[]).map((row) => ({
      ...row,
      selling_price: row.selling_price == null ? null : Number(row.selling_price),
    })),
  };
}

export async function fetchSalesInvoice(headerId: string) {
  const [headerResult, linesResult] = await Promise.all([
    supabase
      .from("sales_headers" as any)
      .select("id, invoice_no, invoice_date, customer_id, salesman_id, notes, status, total_amount")
      .eq("id", headerId)
      .single(),
    supabase
      .from("sales_lines" as any)
      .select("id, line_no, product_id, quantity, unit_price, discount, line_total")
      .eq("header_id", headerId)
      .order("line_no", { ascending: true }),
  ]);

  if (headerResult.error || !headerResult.data) {
    throw new Error(headerResult.error?.message ?? "Sales invoice not found.");
  }

  if (linesResult.error) {
    throw new Error(`Failed to load sales invoice lines: ${linesResult.error.message}`);
  }

  return {
    header: headerResult.data as SalesHeaderRecord,
    lines: ((linesResult.data ?? []) as SalesLineRecord[]).map((line) => ({
      ...line,
      quantity: Number(line.quantity ?? 0),
      unit_price: Number(line.unit_price ?? 0),
      discount: Number(line.discount ?? 0),
      line_total: line.line_total == null ? null : Number(line.line_total),
    })),
  };
}

export async function getProductAvailableQty(productId: string) {
  const { data, error } = await supabase.rpc("get_product_available_qty" as any, {
    p_product_id: productId,
  });

  if (error) {
    throw new Error(`Failed to load available stock: ${error.message}`);
  }

  return coerceRpcNumber(data);
}

export async function getProductFefoPreview(
  productId: string,
  requestedQty: number
): Promise<FefoPreviewAllocation[]> {
  if (!productId || requestedQty <= 0) {
    return [];
  }

  const batches = await getAvailableBatches(productId);
  const allocations: FefoPreviewAllocation[] = [];
  let remainingQty = requestedQty;

  for (const batch of batches) {
    if (remainingQty <= 0) {
      break;
    }

    const availableQuantity = Number(batch.available_quantity ?? 0);
    if (availableQuantity <= 0) {
      continue;
    }

    const allocatedQty = Math.min(availableQuantity, remainingQty);

    allocations.push({
      batch_no: batch.batch_no,
      expiry_date: batch.expiry_date,
      allocated_qty: allocatedQty,
      available_quantity: availableQuantity,
    });

    remainingQty -= allocatedQty;
  }

  return allocations;
}

export async function saveSalesInvoiceDraft(input: {
  headerId: string | null;
  invoiceNo: string;
  invoiceDate: string;
  customerId: string;
  salesmanId: string;
  notes: string;
  totalAmount: number;
  lines: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
  }>;
}) {
  const headerPayload = {
    invoice_no: input.invoiceNo.trim(),
    invoice_date: input.invoiceDate,
    customer_id: input.customerId,
    salesman_id: input.salesmanId || null,
    notes: input.notes.trim() || null,
    status: "draft",
    total_amount: input.totalAmount,
  };

  let currentHeaderId = input.headerId;

  if (!currentHeaderId) {
    const insertHeaderResult = await supabase
      .from("sales_headers" as any)
      .insert(headerPayload)
      .select("id")
      .single();

    if (insertHeaderResult.error || !insertHeaderResult.data) {
      throw new Error(insertHeaderResult.error?.message ?? "Failed to create sales invoice.");
    }

    currentHeaderId = insertHeaderResult.data.id as string;
  } else {
    const updateHeaderResult = await supabase
      .from("sales_headers" as any)
      .update(headerPayload)
      .eq("id", currentHeaderId);

    if (updateHeaderResult.error) {
      throw new Error(`Failed to save sales invoice header: ${updateHeaderResult.error.message}`);
    }

    const deleteLinesResult = await supabase
      .from("sales_lines" as any)
      .delete()
      .eq("header_id", currentHeaderId);

    if (deleteLinesResult.error) {
      throw new Error(`Failed to replace sales invoice lines: ${deleteLinesResult.error.message}`);
    }
  }

  if (input.lines.length > 0) {
    const insertLinesResult = await supabase.from("sales_lines" as any).insert(
      input.lines.map((line, index) => ({
        header_id: currentHeaderId,
        line_no: index + 1,
        product_id: line.product_id,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount: line.discount,
      }))
    );

    if (insertLinesResult.error) {
      throw new Error(`Failed to save sales invoice lines: ${insertLinesResult.error.message}`);
    }
  }

  return currentHeaderId;
}

export async function postSalesInvoice(headerId: string) {
  const { data, error } = await supabase.rpc("post_sales_invoice" as any, {
    p_sales_header_id: headerId,
  });
  if (error) throw new Error(`Failed to post sales invoice: ${error.message}`);
  const result = data as { success: boolean; error?: string } | null;
  if (result && !result.success) throw new Error(result.error ?? "Failed to post invoice");
}

export async function markInvoiceDone(headerId: string) {
  const { data, error } = await supabase.rpc("mark_invoice_done" as any, {
    p_header_id: headerId,
  });
  if (error) throw new Error(`Failed to mark done: ${error.message}`);
  const result = data as { success: boolean; error?: string } | null;
  if (result && !result.success) throw new Error(result.error ?? "Failed to mark done");
}

export async function markInvoiceReceived(headerId: string) {
  const { data, error } = await supabase.rpc("mark_invoice_received" as any, {
    p_header_id: headerId,
  });
  if (error) throw new Error(`Failed to mark received: ${error.message}`);
  const result = data as { success: boolean; error?: string } | null;
  if (result && !result.success) throw new Error(result.error ?? "Failed to mark received");
}

export async function cancelInvoice(headerId: string, reason: string) {
  const { data, error } = await supabase.rpc("cancel_invoice" as any, {
    p_header_id: headerId,
    p_reason: reason,
  });
  if (error) throw new Error(`Failed to cancel invoice: ${error.message}`);
  const result = data as { success: boolean; error?: string; code?: string } | null;
  if (result && !result.success) {
    const err = new Error(result.error ?? "Failed to cancel invoice") as Error & { code?: string };
    err.code = result.code;
    throw err;
  }
}

export async function fetchInvoiceDetail(invoiceId: string) {
  const { data: header, error: headerError } = await supabase
    .from("sales_invoices" as any)
    .select(
      "id, invoice_number, invoice_date, customer_id, customer_name, salesman_id, salesman_name, status, total_amount, notes, created_at, ready_at, done_at, received_at, cancelled_at, cancel_reason, returns_at"
    )
    .eq("id", invoiceId)
    .single();

  if (headerError || !header) {
    throw new Error(headerError?.message ?? "Invoice not found");
  }

  const { data: lines, error: linesError } = await supabase
    .from("sales_lines" as any)
    .select("id, line_no, product_id, quantity, unit_price, discount, line_total")
    .eq("header_id", invoiceId)
    .order("line_no", { ascending: true });

  if (linesError) throw new Error(`Failed to load lines: ${linesError.message}`);

  const productIds = [...new Set(((lines ?? []) as any[]).map((l) => l.product_id))];
  const productMap = new Map<string, any>();

  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from("products_overview" as any)
      .select("id, item_code, name, name_en, name_ar, uom, primary_barcode")
      .in("id", productIds);
    ((prods ?? []) as any[]).forEach((p) => productMap.set(p.id, p));
  }

  return {
    header: header as {
      id: string;
      invoice_number: string | null;
      invoice_date: string;
      customer_id: string | null;
      customer_name: string | null;
      salesman_id: string | null;
      salesman_name: string | null;
      status: SalesInvoiceStatus;
      total_amount: number | null;
      notes: string | null;
      created_at: string;
      ready_at: string | null;
      done_at: string | null;
      received_at: string | null;
      cancelled_at: string | null;
      cancel_reason: string | null;
      returns_at: string | null;
    },
    lines: ((lines ?? []) as any[]).map((line) => ({
      id: line.id as string,
      line_no: line.line_no as number,
      product_id: line.product_id as string,
      quantity: Number(line.quantity ?? 0),
      unit_price: Number(line.unit_price ?? 0),
      discount: Number(line.discount ?? 0),
      line_total: line.line_total != null ? Number(line.line_total) : null,
      product: (productMap.get(line.product_id) ?? null) as {
        id: string;
        item_code: string | null;
        name: string | null;
        name_en: string | null;
        name_ar: string | null;
        uom: string | null;
        primary_barcode: string | null;
      } | null,
    })),
  };
}

export async function fetchInvoiceList(filters?: {
  status?: SalesInvoiceStatus | "all";
  limit?: number;
  salesmanId?: string | null;
}) {
  let q = supabase
    .from("sales_invoices" as any)
    .select("id, invoice_number, invoice_date, customer_name, salesman_name, status, total_amount, created_at, ready_at, done_at, received_at, cancelled_at")
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.status && filters.status !== "all") {
    q = q.eq("status", filters.status);
  }
  if (filters?.salesmanId) {
    q = q.eq("salesman_id", filters.salesmanId);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Failed to load invoices: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    invoice_number: string | null;
    invoice_date: string;
    customer_name: string | null;
    salesman_name: string | null;
    status: SalesInvoiceStatus;
    total_amount: number;
    created_at: string;
    ready_at: string | null;
    done_at: string | null;
    received_at: string | null;
    cancelled_at: string | null;
  }>;
}

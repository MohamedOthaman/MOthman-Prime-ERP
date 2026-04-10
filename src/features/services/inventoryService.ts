import { supabase } from "@/integrations/supabase/client";

export interface AvailableBatchRow {
  product_id: string;
  batch_no: string | null;
  expiry_date: string | null;
  available_quantity: number;
}

export interface InventoryBatchStockRow {
  product_id: string;
  batch_no: string | null;
  production_date: string | null;
  expiry_date: string | null;
  received_quantity: number;
  issued_quantity: number;
  remaining_quantity: number;
  first_received_date: string | null;
  last_received_date: string | null;
  receiving_invoice_no: string | null;
  grn_no: string | null;
  receiving_reference: string | null;
}

export interface InventoryProductStockSummaryRow {
  product_id: string;
  code: string | null;
  item_code: string | null;
  name: string | null;
  name_ar: string | null;
  name_en: string | null;
  brand: string | null;
  category: string | null;
  section: string | null;
  uom: string | null;
  packaging: string | null;
  storage_type: string | null;
  carton_holds: number | null;
  primary_barcode: string | null;
  all_barcodes: string[];
  available_quantity: number;
  batch_count: number;
  nearest_expiry: string | null;
}

export interface InventoryStockPageSnapshot {
  products: InventoryProductStockSummaryRow[];
  batches: InventoryBatchStockRow[];
}

export interface InventoryProductCatalogRow {
  id: string;
  code: string | null;
  item_code: string | null;
  internal_code: string | null;
  name: string | null;
  name_ar: string | null;
  name_en: string | null;
  brand: string | null;
  category: string | null;
  section: string | null;
  uom: string | null;
  pack_size: string | null;
  packaging: string | null;
  storage_type: string | null;
  carton_holds: number | null;
  primary_barcode: string | null;
  all_barcodes: string[];
  cost_price: number | null;
  selling_price: number | null;
  discount: number | null;
  price_source: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

const PAGE_SIZE = 1000;

function isMissingRelation(error: { code?: string; message?: string } | null, relation: string) {
  if (!error) return false;
  return error.code === "PGRST205" || error.message?.includes(relation) || false;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchAllRows(
  fetchPage: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>
) {
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const result = await fetchPage(from, from + PAGE_SIZE - 1);
    if (result.error) {
      return { data: null, error: result.error };
    }

    const pageRows = result.data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      return { data: rows, error: null };
    }

    from += PAGE_SIZE;
  }
}

function normalizeBatchRow(row: any): InventoryBatchStockRow {
  return {
    product_id: row.product_id,
    batch_no: row.batch_no ?? null,
    production_date: row.production_date ?? null,
    expiry_date: row.expiry_date ?? null,
    received_quantity: toNumber(row.received_quantity),
    issued_quantity: toNumber(row.issued_quantity),
    remaining_quantity: toNumber(
      row.remaining_quantity ?? row.available_quantity ?? row.quantity_on_hand ?? row.quantity ?? row.qty
    ),
    first_received_date: row.first_received_date ?? null,
    last_received_date: row.last_received_date ?? null,
    receiving_invoice_no: row.receiving_invoice_no ?? null,
    grn_no: row.grn_no ?? null,
    receiving_reference: row.receiving_reference ?? row.grn_no ?? row.batch_no ?? null,
  };
}

function normalizeProductSummaryRow(row: any): InventoryProductStockSummaryRow {
  return {
    product_id: row.product_id ?? row.id,
    code: row.code ?? null,
    item_code: row.item_code ?? null,
    name: row.name ?? null,
    name_ar: row.name_ar ?? null,
    name_en: row.name_en ?? null,
    brand: row.brand ?? null,
    category: row.category ?? null,
    section: row.section ?? null,
    uom: row.uom ?? null,
    packaging: row.packaging ?? null,
    storage_type: row.storage_type ?? null,
    carton_holds: row.carton_holds != null ? toNumber(row.carton_holds) : null,
    primary_barcode: row.primary_barcode ?? null,
    all_barcodes: Array.isArray(row.all_barcodes) ? row.all_barcodes : [],
    available_quantity: toNumber(row.available_quantity),
    batch_count: Math.max(0, Math.trunc(toNumber(row.batch_count))),
    nearest_expiry: row.nearest_expiry ?? null,
  };
}

function normalizeProductMasterRow(row: any): InventoryProductCatalogRow {
  const primaryBarcode = row.primary_barcode ?? null;
  const barcodes = Array.isArray(row.all_barcodes)
    ? row.all_barcodes
    : primaryBarcode
      ? [primaryBarcode]
      : [];

  return {
    id: row.id,
    code: row.code ?? null,
    item_code: row.item_code ?? null,
    internal_code: row.internal_code ?? null,
    name: row.name ?? null,
    name_ar: row.name_ar ?? null,
    name_en: row.name_en ?? null,
    brand: row.brand ?? null,
    category: row.category ?? null,
    section: row.section ?? null,
    uom: row.uom ?? null,
    pack_size: row.pack_size ?? null,
    packaging: row.packaging ?? null,
    storage_type: row.storage_type ?? null,
    carton_holds: row.carton_holds != null ? toNumber(row.carton_holds) : null,
    primary_barcode: primaryBarcode,
    all_barcodes: Array.from(new Set(barcodes.filter(Boolean))),
    cost_price: row.cost_price != null ? toNumber(row.cost_price) : null,
    selling_price: row.selling_price != null ? toNumber(row.selling_price) : null,
    discount: row.discount != null ? toNumber(row.discount) : null,
    price_source: row.price_source ?? null,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

async function getInventoryBatchStockRows(): Promise<InventoryBatchStockRow[]> {
  const batchResult = await fetchAllRows((from, to) =>
    supabase
      .from("inventory_batch_stock_details" as any)
      .select(
        "product_id, batch_no, expiry_date, received_quantity, issued_quantity, remaining_quantity, first_received_date, last_received_date, receiving_invoice_no, grn_no, receiving_reference"
      )
      .gt("remaining_quantity", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("batch_no", { ascending: true, nullsFirst: false })
      .range(from, to)
  );

  if (!batchResult.error) {
    return ((batchResult.data ?? []) as any[]).map(normalizeBatchRow);
  }

  if (!isMissingRelation(batchResult.error, "inventory_batch_stock_details")) {
    throw new Error(`Failed to load stock batches: ${batchResult.error.message}`);
  }

  const fallbackResult = await fetchAllRows((from, to) =>
    supabase
        .from("inventory_stock_by_batch" as any)
        .select("product_id, batch_no, expiry_date, available_quantity")
      .gt("available_quantity", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("batch_no", { ascending: true, nullsFirst: false })
      .range(from, to)
  );

  if (!fallbackResult.error) {
    return ((fallbackResult.data ?? []) as any[]).map((row) =>
      normalizeBatchRow({
        ...row,
        remaining_quantity: row.available_quantity,
        received_quantity: row.available_quantity,
        issued_quantity: 0,
        receiving_reference: row.batch_no ?? null,
      })
    );
  }

  if (!isMissingRelation(fallbackResult.error, "inventory_stock_by_batch")) {
    throw new Error(`Failed to load stock batches: ${fallbackResult.error.message}`);
  }

  const legacyResult = await fetchAllRows((from, to) =>
    supabase
      .from("inventory_batches" as any)
      .select("*")
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .range(from, to)
  );

  if (!legacyResult.error) {
    return ((legacyResult.data ?? []) as any[])
      .map((row) =>
        normalizeBatchRow({
          product_id: row.product_id,
          batch_no: row.batch_no ?? null,
          production_date: row.production_date ?? null,
          expiry_date: row.expiry_date ?? null,
          received_quantity: row.qty_received ?? row.received_quantity ?? row.quantity ?? row.qty ?? 0,
          issued_quantity: 0,
          remaining_quantity:
            row.qty_available ?? row.available_quantity ?? row.quantity_on_hand ?? row.quantity ?? row.qty ?? 0,
          first_received_date: row.received_date ?? null,
          last_received_date: row.received_date ?? null,
          receiving_reference: row.batch_no ?? null,
        })
      )
      .filter((row) => row.remaining_quantity > 0);
  }

  if (!isMissingRelation(legacyResult.error, "inventory_batches")) {
    throw new Error(`Failed to load stock batches: ${legacyResult.error.message}`);
  }

  const batchesTableResult = await fetchAllRows((from, to) =>
    supabase
      .from("batches" as any)
      .select("product_id, batch_no, qty, unit, production_date, expiry_date, received_date")
      .gt("qty", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("batch_no", { ascending: true, nullsFirst: false })
      .range(from, to)
  );

  if (batchesTableResult.error) {
    throw new Error(`Failed to load stock batches: ${batchesTableResult.error.message}`);
  }

  return ((batchesTableResult.data ?? []) as any[])
    .map((row) =>
      normalizeBatchRow({
        product_id: row.product_id,
        batch_no: row.batch_no ?? null,
        production_date: row.production_date ?? null,
        expiry_date: row.expiry_date ?? null,
        received_quantity: row.quantity ?? row.qty ?? row.available_quantity ?? 0,
        issued_quantity: 0,
        remaining_quantity: row.qty ?? row.quantity ?? row.available_quantity ?? 0,
        first_received_date: row.received_date ?? null,
        last_received_date: row.received_date ?? null,
        receiving_reference: row.batch_no ?? null,
      })
    )
    .filter((row) => row.remaining_quantity > 0);
}

async function getProductBarcodeMap() {
  const result = await fetchAllRows((from, to) =>
    supabase
      .from("product_barcodes" as any)
      .select("product_id, barcode, is_primary")
      .range(from, to)
  );

  if (result.error) {
    return new Map<string, string[]>();
  }

  const barcodeMap = new Map<string, string[]>();
  ((result.data ?? []) as any[]).forEach((row) => {
    if (!row.product_id || !row.barcode) return;
    const current = barcodeMap.get(row.product_id) ?? [];
    current.push(String(row.barcode));
    barcodeMap.set(row.product_id, current);
  });

  return barcodeMap;
}

async function getInventoryProductMasters(includeInactive = false): Promise<InventoryProductCatalogRow[]> {
  const richResult = await fetchAllRows((from, to) =>
    (() => {
      let query = supabase
        .from("products_overview" as any)
        .select(
          "id, code, item_code, internal_code, name, name_ar, name_en, brand, category, section, uom, pack_size, packaging, storage_type, carton_holds, primary_barcode, all_barcodes, cost_price, selling_price, discount, price_source, is_active, created_at, updated_at"
        )
        .order("name_en", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true, nullsFirst: false });

      if (!includeInactive) {
        query = query.or("is_active.eq.true,is_active.is.null");
      }

      return query.range(from, to);
    })()
  );

  if (!richResult.error) {
    return ((richResult.data ?? []) as any[]).map(normalizeProductMasterRow);
  }

  const fallbackResult = await fetchAllRows((from, to) =>
    (() => {
      let query = supabase
        .from("products_overview" as any)
        .select(
          "id, code, item_code, internal_code, name, name_ar, name_en, brand, category, uom, pack_size, packaging, storage_type, carton_holds, primary_barcode, cost_price, selling_price, discount, price_source, is_active, created_at, updated_at"
        )
        .order("name_en", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true, nullsFirst: false });

      if (!includeInactive) {
        query = query.or("is_active.eq.true,is_active.is.null");
      }

      return query.range(from, to);
    })()
  );

  if (fallbackResult.error) {
    throw new Error(`Failed to load products overview: ${fallbackResult.error.message}`);
  }

  const barcodeMap = await getProductBarcodeMap();

  return ((fallbackResult.data ?? []) as any[]).map((row) =>
    normalizeProductMasterRow({
      ...row,
      section: null,
      all_barcodes: barcodeMap.get(row.id) ?? (row.primary_barcode ? [row.primary_barcode] : []),
    })
  );
}

export async function getInventoryProductCatalog(options?: { includeInactive?: boolean }) {
  return getInventoryProductMasters(options?.includeInactive ?? false);
}

async function getInventoryProductStockSummariesByProduct(
  batches: InventoryBatchStockRow[]
) {
  const summaryResult = await fetchAllRows((from, to) =>
    supabase
      .from("inventory_product_stock_summary" as any)
      .select(
        "product_id, code, item_code, name, name_ar, name_en, brand, category, section, uom, packaging, storage_type, carton_holds, primary_barcode, all_barcodes, available_quantity, batch_count, nearest_expiry"
      )
      .order("name_en", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true, nullsFirst: false })
      .range(from, to)
  );

  if (!summaryResult.error) {
    return new Map(
      ((summaryResult.data ?? []) as any[]).map((row) => {
        const normalized = normalizeProductSummaryRow(row);
        return [normalized.product_id, normalized] as const;
      })
    );
  }

  if (!isMissingRelation(summaryResult.error, "inventory_product_stock_summary")) {
    throw new Error(`Failed to load stock summary: ${summaryResult.error.message}`);
  }

  const productViewResult = await fetchAllRows((from, to) =>
    supabase
      .from("inventory_stock_by_product" as any)
      .select("product_id, available_quantity")
      .range(from, to)
  );

  if (!productViewResult.error) {
    return new Map(
      ((productViewResult.data ?? []) as any[]).map((row) => [
        row.product_id,
        normalizeProductSummaryRow({
          product_id: row.product_id,
          available_quantity: row.available_quantity,
          batch_count: (batches.filter((batch) => batch.product_id === row.product_id) ?? []).length,
          nearest_expiry:
            batches
              .filter((batch) => batch.product_id === row.product_id && batch.expiry_date)
              .map((batch) => batch.expiry_date)
              .sort((left, right) => String(left).localeCompare(String(right)))[0] ?? null,
        }),
      ])
    );
  }

  if (!isMissingRelation(productViewResult.error, "inventory_stock_by_product")) {
    throw new Error(`Failed to load stock summary: ${productViewResult.error.message}`);
  }

  const legacySummary = await fetchAllRows((from, to) =>
    supabase
      .from("v_product_stock_balance" as any)
      .select("product_id, item_code, name, qty_available")
      .range(from, to)
  );

  if (!legacySummary.error) {
    return new Map(
      ((legacySummary.data ?? []) as any[]).map((row) => [
        row.product_id,
        normalizeProductSummaryRow({
          product_id: row.product_id,
          item_code: row.item_code,
          name: row.name,
          available_quantity: row.qty_available,
          batch_count: (batches.filter((batch) => batch.product_id === row.product_id) ?? []).length,
          nearest_expiry:
            batches
              .filter((batch) => batch.product_id === row.product_id && batch.expiry_date)
              .map((batch) => batch.expiry_date)
              .sort((left, right) => String(left).localeCompare(String(right)))[0] ?? null,
        }),
      ])
    );
  }

  if (!isMissingRelation(legacySummary.error, "v_product_stock_balance")) {
    throw new Error(`Failed to load stock summary: ${legacySummary.error.message}`);
  }

  return new Map<string, InventoryProductStockSummaryRow>();
}

export async function getInventoryStockPageSnapshot(): Promise<InventoryStockPageSnapshot> {
  const batches = await getInventoryBatchStockRows();
  const masters = await getInventoryProductMasters();
  const summaryByProduct = await getInventoryProductStockSummariesByProduct(batches);
  const batchesByProduct = new Map<string, InventoryBatchStockRow[]>();

  batches.forEach((batch) => {
    const current = batchesByProduct.get(batch.product_id) ?? [];
    current.push(batch);
    batchesByProduct.set(batch.product_id, current);
  });

  const products = masters.map((master) => {
    const productBatches = (batchesByProduct.get(master.id) ?? []).filter(
      (batch) => batch.remaining_quantity > 0
    );
    const summary = summaryByProduct.get(master.id);
    const nearestExpiry =
      productBatches
        .map((batch) => batch.expiry_date)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => left.localeCompare(right))[0] ?? summary?.nearest_expiry ?? null;

    return normalizeProductSummaryRow({
      product_id: master.id,
      code: master.code,
      item_code: master.item_code,
      name: master.name,
      name_ar: master.name_ar,
      name_en: master.name_en,
      brand: master.brand,
      category: master.category,
      section: master.section,
      uom: master.uom,
      packaging: master.packaging,
      storage_type: master.storage_type,
      carton_holds: master.carton_holds,
      primary_barcode: master.primary_barcode,
      all_barcodes: master.all_barcodes,
      available_quantity:
        productBatches.length > 0
          ? productBatches.reduce((sum, batch) => sum + toNumber(batch.remaining_quantity), 0)
          : (summary?.available_quantity ?? 0),
      batch_count: productBatches.length > 0 ? productBatches.length : (summary?.batch_count ?? 0),
      nearest_expiry: nearestExpiry,
    });
  });

  return { products, batches };
}

export async function getAvailableStock(productId: string): Promise<number> {
  const { data, error } = await supabase
    .from("inventory_stock_by_product" as any)
    .select("available_quantity")
    .eq("product_id", productId)
    .maybeSingle();

  if (!error) {
    return toNumber(data?.available_quantity);
  }

  const missingSummaryView = isMissingRelation(error, "inventory_stock_by_product");

  if (!missingSummaryView) {
    throw new Error(`Failed to load available stock: ${error.message}`);
  }

  const legacySummary = await supabase
    .from("v_product_stock_balance" as any)
    .select("qty_available")
    .eq("product_id", productId)
    .maybeSingle();

  if (!legacySummary.error) {
    return toNumber(legacySummary.data?.qty_available);
  }

  if (!isMissingRelation(legacySummary.error, "v_product_stock_balance")) {
    throw new Error(`Failed to load available stock: ${legacySummary.error.message}`);
  }

  const fallbackBatches = await getAvailableBatches(productId);
  return fallbackBatches.reduce((sum, row) => sum + toNumber(row.available_quantity), 0);
}

export async function getAvailableBatches(productId: string): Promise<AvailableBatchRow[]> {
  const batchRows = await getInventoryBatchStockRows();
  return batchRows
    .filter((row) => row.product_id === productId && row.remaining_quantity > 0)
    .map((row) => ({
      product_id: row.product_id,
      batch_no: row.batch_no,
      expiry_date: row.expiry_date,
      available_quantity: toNumber(row.remaining_quantity),
    }));
}

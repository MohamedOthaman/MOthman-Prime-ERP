import { supabase } from "@/integrations/supabase/client";
import {
  getInventoryStockPageSnapshot,
  type InventoryProductStockSummaryRow,
} from "@/features/services/inventoryService";

export interface InventoryMovementLogRow {
  id: string;
  movement_type: string;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  qty_in: number;
  qty_out: number;
  balance_after: number | null;
  unit_cost: number | null;
  location_ref: string | null;
  notes: string | null;
  performed_at: string;
  performed_by: string | null;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  product_name_ar: string | null;
  uom: string | null;
  brand: string | null;
  grn_no: string | null;
  invoice_no: string | null;
}

export async function fetchInventoryMovementsLog(filters?: {
  movementType?: string;
  productId?: string;
  referenceType?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}): Promise<InventoryMovementLogRow[]> {
  let query = supabase
    .from("inventory_movements_log" as any)
    .select(
      "id, movement_type, reference_type, reference_id, batch_id, batch_no, expiry_date, qty_in, qty_out, balance_after, unit_cost, location_ref, notes, performed_at, performed_by, product_id, product_code, product_name, product_name_ar, uom, brand, grn_no, invoice_no"
    )
    .order("performed_at", { ascending: false });

  if (filters?.movementType) {
    query = query.eq("movement_type", filters.movementType);
  }
  if (filters?.productId) {
    query = query.eq("product_id", filters.productId);
  }
  if (filters?.referenceType) {
    query = query.eq("reference_type", filters.referenceType);
  }
  if (filters?.fromDate) {
    query = query.gte("performed_at", filters.fromDate);
  }
  if (filters?.toDate) {
    query = query.lte("performed_at", filters.toDate + "T23:59:59Z");
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.range(filters.offset, (filters.offset) + (filters.limit ?? 100) - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load inventory movements: ${error.message}`);

  return ((data ?? []) as any[]).map((r): InventoryMovementLogRow => ({
    id:               r.id,
    movement_type:    r.movement_type,
    reference_type:   r.reference_type ?? null,
    reference_id:     r.reference_id ?? null,
    batch_id:         r.batch_id ?? null,
    batch_no:         r.batch_no ?? null,
    expiry_date:      r.expiry_date ?? null,
    qty_in:           Number(r.qty_in ?? 0),
    qty_out:          Number(r.qty_out ?? 0),
    balance_after:    r.balance_after == null ? null : Number(r.balance_after),
    unit_cost:        r.unit_cost == null ? null : Number(r.unit_cost),
    location_ref:     r.location_ref ?? null,
    notes:            r.notes ?? null,
    performed_at:     r.performed_at,
    performed_by:     r.performed_by ?? null,
    product_id:       r.product_id,
    product_code:     r.product_code ?? null,
    product_name:     r.product_name ?? null,
    product_name_ar:  r.product_name_ar ?? null,
    uom:              r.uom ?? null,
    brand:            r.brand ?? null,
    grn_no:           r.grn_no ?? null,
    invoice_no:       r.invoice_no ?? null,
  }));
}

export type InventoryOperationalBatchStatus =
  | "available"
  | "near_expiry"
  | "expired";

export interface InventoryOperationalBatchRow {
  product_id: string;
  code: string | null;
  item_code: string | null;
  name: string | null;
  name_ar: string | null;
  name_en: string | null;
  brand: string | null;
  category: string | null;
  section: string | null;
  storage_type: string | null;
  batch_no: string | null;
  production_date: string | null;
  expiry_date: string | null;
  available_quantity: number;
  reserved_quantity: number;
  days_to_expiry: number | null;
  fefo_rank: number;
  status: InventoryOperationalBatchStatus;
  grn_no: string | null;
  receiving_reference: string | null;
  receiving_invoice_no: string | null;
}

export interface InventoryExpiryAlertBucket {
  threshold_days: 7 | 14 | 30;
  batch_count: number;
  product_count: number;
  total_quantity: number;
  items: InventoryOperationalBatchRow[];
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStartOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getDaysToExpiry(expiryDate: string | null) {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;

  const today = toStartOfDay(new Date());
  const normalizedExpiry = toStartOfDay(expiry);

  return Math.floor(
    (normalizedExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function getOperationalBatchStatus(daysToExpiry: number | null): InventoryOperationalBatchStatus {
  if (daysToExpiry != null && daysToExpiry < 0) {
    return "expired";
  }

  if (daysToExpiry != null && daysToExpiry <= 30) {
    return "near_expiry";
  }

  return "available";
}

function createProductMap(products: InventoryProductStockSummaryRow[]) {
  return new Map(products.map((product) => [product.product_id, product]));
}

export async function getInventoryOperationalBatches(): Promise<InventoryOperationalBatchRow[]> {
  const snapshot = await getInventoryStockPageSnapshot();
  const productById = createProductMap(snapshot.products);
  const fefoRankByProduct = new Map<string, number>();

  return [...snapshot.batches]
    .filter((batch) => batch.remaining_quantity > 0)
    .sort((left, right) => {
      const leftExpiry = left.expiry_date ?? "9999-12-31";
      const rightExpiry = right.expiry_date ?? "9999-12-31";

      if (left.product_id === right.product_id) {
        if (leftExpiry === rightExpiry) {
          return (left.batch_no ?? "").localeCompare(right.batch_no ?? "");
        }

        return leftExpiry.localeCompare(rightExpiry);
      }

      return leftExpiry.localeCompare(rightExpiry);
    })
    .map((batch) => {
      const product = productById.get(batch.product_id);
      const currentRank = (fefoRankByProduct.get(batch.product_id) ?? 0) + 1;
      fefoRankByProduct.set(batch.product_id, currentRank);

      const daysToExpiry = getDaysToExpiry(batch.expiry_date);

      return {
        product_id: batch.product_id,
        code: product?.code ?? null,
        item_code: product?.item_code ?? null,
        name: product?.name ?? null,
        name_ar: product?.name_ar ?? null,
        name_en: product?.name_en ?? null,
        brand: product?.brand ?? null,
        category: product?.category ?? null,
        section: product?.section ?? null,
        storage_type: product?.storage_type ?? null,
        batch_no: batch.batch_no,
        production_date: batch.production_date,
        expiry_date: batch.expiry_date,
        available_quantity: toNumber(batch.remaining_quantity),
        reserved_quantity: 0,
        days_to_expiry: daysToExpiry,
        fefo_rank: currentRank,
        status: getOperationalBatchStatus(daysToExpiry),
        grn_no: batch.grn_no,
        receiving_reference: batch.receiving_reference,
        receiving_invoice_no: batch.receiving_invoice_no,
      } satisfies InventoryOperationalBatchRow;
    });
}

export async function getInventoryExpiryAlerts(): Promise<InventoryExpiryAlertBucket[]> {
  const operationalRows = await getInventoryOperationalBatches();
  const activeRows = operationalRows.filter(
    (row) => row.days_to_expiry != null && row.days_to_expiry >= 0
  );

  return ([7, 14, 30] as const).map((threshold) => {
    const items = activeRows.filter(
      (row) => row.days_to_expiry != null && row.days_to_expiry <= threshold
    );

    return {
      threshold_days: threshold,
      batch_count: items.length,
      product_count: new Set(items.map((item) => item.product_id)).size,
      total_quantity: items.reduce(
        (sum, item) => sum + toNumber(item.available_quantity),
        0
      ),
      items,
    };
  });
}

export async function getFefoInventoryBatches(productId: string) {
  const operationalRows = await getInventoryOperationalBatches();

  return operationalRows.filter((row) => row.product_id === productId);
}

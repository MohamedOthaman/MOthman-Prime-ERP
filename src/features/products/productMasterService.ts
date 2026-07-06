/**
 * Product master persistence — the single write path for product master data.
 *
 * Local-first contract (docs/LOCAL_FIRST_ARCHITECTURE.md):
 * - `saveProductMasterLocalFirst` writes the local mirror IMMEDIATELY, then
 *   tries the remote write; if the cloud is unreachable the save is queued in
 *   the outbox and replayed by the sync worker — the user never loses work.
 * - Batch QUANTITIES are never overwritten here: new batches insert as opening
 *   stock, existing batches receive metadata-only updates (movement history
 *   stays authoritative).
 */
import { supabase } from "@/integrations/supabase/client";
import type { DatabaseAdapter } from "@/database/types";
import { enqueue } from "@/sync/outbox";

export function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function sanitizeBarcodes(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function isMissingRpcSignature(error: { code?: string; message?: string } | null, fnName: string) {
  if (!error) return false;
  return error.code === "PGRST202" && error.message?.includes(fnName);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProductMasterPayload {
  itemCode: string;
  nameAr: string | null;
  nameEn: string | null;
  category: string | null;
  uom: string;
  storageType: string | null;
  barcodes: string[];
  costPrice: number;
  sellingPrice: number;
  discount: number;
}

export interface ProductMetadataPatch {
  brand: string | null;
  category: string | null;
  section: string | null;
  packaging: string | null;
  carton_holds: number | null;
  pack_size: string | null;
  uom: string | null;
  storage_type: string | null;
}

export interface BatchEditRow {
  id?: string;
  batchNo: string;
  unit: string;
  productionDate: string;
  expiryDate: string;
  qty: number;
  receivedDate: string;
}

export interface ProductMasterSaveInput {
  mode: "create" | "update";
  /** Required for update; ignored for create. */
  productId: string | null;
  isActive: boolean;
  payload: ProductMasterPayload;
  metadata: ProductMetadataPatch;
  batches: BatchEditRow[];
  /**
   * products.image_path value: a storage key in the product-images bucket,
   * null to remove the image, or undefined to leave it untouched.
   */
  imagePath?: string | null;
}

export const PRODUCT_MASTER_ENTITY = "product_master";

// ─── Remote persistence (verbatim behavior from the former ProductDialog) ────

async function applyProductMetadataPatch(productId: string, patch: Record<string, unknown>) {
  const primary = await supabase.from("products").update(patch).eq("id", productId);
  if (!primary.error) return;

  const missingSectionColumn =
    typeof patch.section !== "undefined" &&
    (primary.error.message.includes("section") || primary.error.code === "PGRST204");

  if (!missingSectionColumn) throw primary.error;

  const { section: _ignored, ...fallbackPatch } = patch;
  const fallback = await supabase.from("products").update(fallbackPatch).eq("id", productId);
  if (fallback.error) throw fallback.error;
}

async function syncProductBarcodes(productId: string, barcodes: string[], source: string) {
  const normalizedBarcodes = sanitizeBarcodes(barcodes);
  const { error: deleteError } = await supabase.from("product_barcodes").delete().eq("product_id", productId);
  if (deleteError && deleteError.code !== "PGRST205") throw deleteError;

  if (normalizedBarcodes.length === 0) return;

  const { error: insertError } = await supabase.from("product_barcodes").insert(
    normalizedBarcodes.map((barcode, index) => ({
      product_id: productId,
      barcode,
      is_primary: index === 0,
      source,
    }))
  );

  if (insertError) throw insertError;
}

async function syncProductPrice(
  productId: string,
  values: { costPrice: number; sellingPrice: number; discount: number; priceSource: string }
) {
  const existingPrice = await supabase
    .from("product_prices")
    .select("id")
    .eq("product_id", productId)
    .maybeSingle();

  if (existingPrice.error && existingPrice.error.code !== "PGRST116") {
    throw existingPrice.error;
  }

  if (existingPrice.data?.id) {
    const { error } = await supabase
      .from("product_prices")
      .update({
        cost_price: values.costPrice,
        selling_price: values.sellingPrice,
        discount: values.discount,
        price_source: values.priceSource,
      })
      .eq("product_id", productId);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("product_prices").insert({
    product_id: productId,
    cost_price: values.costPrice,
    selling_price: values.sellingPrice,
    discount: values.discount,
    price_source: values.priceSource,
  });

  if (error) throw error;
}

async function createProductDirect(payload: ProductMasterPayload) {
  const { data, error } = await supabase
    .from("products")
    .insert({
      item_code: payload.itemCode,
      code: payload.itemCode,
      name_ar: payload.nameAr,
      name_en: payload.nameEn,
      name: payload.nameEn || payload.nameAr || payload.itemCode,
      category: payload.category,
      uom: payload.uom,
      storage_type: payload.storageType,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw error;

  await syncProductPrice(data.id, {
    costPrice: payload.costPrice,
    sellingPrice: payload.sellingPrice,
    discount: payload.discount,
    priceSource: "manual_direct",
  });
  await syncProductBarcodes(data.id, payload.barcodes, "manual_direct");
  return data.id as string;
}

async function updateProductDirect(productId: string, payload: ProductMasterPayload & { isActive: boolean }) {
  const { error } = await supabase
    .from("products")
    .update({
      item_code: payload.itemCode,
      code: payload.itemCode,
      name_ar: payload.nameAr,
      name_en: payload.nameEn,
      name: payload.nameEn || payload.nameAr || payload.itemCode,
      category: payload.category,
      uom: payload.uom,
      storage_type: payload.storageType,
      is_active: payload.isActive,
    })
    .eq("id", productId);

  if (error) throw error;

  await syncProductPrice(productId, {
    costPrice: payload.costPrice,
    sellingPrice: payload.sellingPrice,
    discount: payload.discount,
    priceSource: "manual_direct",
  });
  await syncProductBarcodes(productId, payload.barcodes, "manual_direct");
}

async function createProductWithCompatibility(payload: ProductMasterPayload): Promise<string> {
  // Live create_product_full takes a single p_barcode; remaining fields
  // (category/uom/storage/extra barcodes) are applied via direct update +
  // barcode sync afterwards.
  const rpcResult = await supabase.rpc("create_product_full", {
    p_item_code: payload.itemCode,
    p_name_ar: payload.nameAr ?? "",
    p_name_en: payload.nameEn ?? "",
    p_barcode: payload.barcodes[0] ?? "",
    p_barcode_source: "manual",
    p_cost_price: payload.costPrice,
    p_selling_price: payload.sellingPrice,
    p_discount: payload.discount,
    p_price_source: "manual",
  });

  if (!rpcResult.error) {
    const newId = rpcResult.data as string;
    await updateProductDirect(newId, { ...payload, isActive: true }).catch(() => { /* core row already created */ });
    return newId;
  }
  if (!isMissingRpcSignature(rpcResult.error, "create_product_full")) throw rpcResult.error;

  return createProductDirect(payload);
}

async function updateProductWithCompatibility(
  productId: string,
  payload: ProductMasterPayload & { isActive: boolean }
) {
  // Live update_product_full takes a single p_barcode and no category/uom/
  // storage/is_active args — those are applied via the direct update below,
  // which also syncs the full barcode list.
  const rpcResult = await supabase.rpc("update_product_full", {
    p_product_id: productId,
    p_item_code: payload.itemCode,
    p_name_ar: payload.nameAr ?? "",
    p_name_en: payload.nameEn ?? "",
    p_barcode: payload.barcodes[0] ?? "",
    p_cost_price: payload.costPrice,
    p_selling_price: payload.sellingPrice,
    p_discount: payload.discount,
  });

  if (rpcResult.error && !isMissingRpcSignature(rpcResult.error, "update_product_full")) {
    throw rpcResult.error;
  }

  await updateProductDirect(productId, payload);
}

export async function loadProductBatches(productId: string, fallbackUnit: string) {
  const result = await supabase
    .from("inventory_batches")
    .select("id, product_id, batch_no, production_date, qty_available, qty_received, expiry_date, received_date")
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true });

  if (result.error) throw result.error;

  return ((result.data || []) as any[]).map((row) => ({
    clientId: row.id || `batch-${Math.random().toString(36).slice(2)}`,
    id: row.id,
    batchNo: row.batch_no || "",
    unit: fallbackUnit,
    productionDate: row.production_date || "",
    expiryDate: row.expiry_date || "",
    qty: Number(row.qty_available ?? row.qty_received ?? 0),
    receivedDate: row.received_date || todayIso(),
  }));
}

/**
 * Persist batch edits WITHOUT destroying stock history.
 * - New rows (no id) are inserted as opening stock.
 * - Existing rows get metadata updates only (batch_no / dates) — quantities
 *   change exclusively through GRN receiving, invoice posting, returns and
 *   (future) adjustment movements, never by overwriting qty here.
 * - Rows removed in the editor are intentionally NOT deleted: existing
 *   batches carry movement history and must be corrected via movements.
 */
async function persistProductBatches(productId: string, batches: BatchEditRow[]) {
  const rows = batches.filter((batch) => batch.batchNo.trim() && batch.expiryDate);

  const newRows = rows.filter((batch) => !batch.id);
  if (newRows.length > 0) {
    const { error: insertError } = await supabase.from("inventory_batches").insert(
      newRows.map((batch) => ({
        product_id: productId,
        batch_no: batch.batchNo.trim(),
        production_date: batch.productionDate || null,
        expiry_date: batch.expiryDate,
        qty_received: Number(batch.qty || 0),
        qty_available: Number(batch.qty || 0),
        received_date: batch.receivedDate || todayIso(),
      }))
    );
    if (insertError) throw insertError;
  }

  for (const batch of rows.filter((row) => row.id)) {
    const { error: updateError } = await supabase
      .from("inventory_batches")
      .update({
        batch_no: batch.batchNo.trim(),
        production_date: batch.productionDate || null,
        expiry_date: batch.expiryDate,
        received_date: batch.receivedDate || todayIso(),
      })
      .eq("id", batch.id);
    if (updateError) throw updateError;
  }
}

/**
 * The full remote save sequence. Used both for the online path and for outbox
 * replay — MUST stay idempotent (create falls back to update when the item
 * code already exists, so a replayed create cannot duplicate a product).
 */
export async function persistProductMasterRemote(input: ProductMasterSaveInput): Promise<string> {
  let productId = input.mode === "update" ? input.productId : null;

  if (input.mode === "create") {
    // Idempotency guard for replays: if a product with this item_code already
    // exists (a previous attempt half-succeeded), switch to update semantics.
    const existing = await supabase
      .from("products")
      .select("id")
      .eq("item_code", input.payload.itemCode)
      .maybeSingle();
    if (existing.data?.id) {
      productId = existing.data.id;
      await updateProductWithCompatibility(productId, { ...input.payload, isActive: input.isActive });
    } else {
      productId = await createProductWithCompatibility(input.payload);
    }
  } else {
    if (!productId) throw new Error("Product update requires a product id.");
    await updateProductWithCompatibility(productId, { ...input.payload, isActive: input.isActive });
  }

  if (!productId) throw new Error("Product save did not return an id.");

  const metadataPatch: Record<string, unknown> = { ...input.metadata };
  if (typeof input.imagePath !== "undefined") {
    metadataPatch.image_path = input.imagePath;
  }
  await applyProductMetadataPatch(productId, metadataPatch);
  await persistProductBatches(productId, input.batches);
  return productId;
}

// ─── Local-first save ─────────────────────────────────────────────────────────

function buildLocalMirrorRow(input: ProductMasterSaveInput, productId: string) {
  const { payload, metadata } = input;
  return {
    id: productId,
    item_code: payload.itemCode,
    code: payload.itemCode,
    name: payload.nameEn || payload.nameAr || payload.itemCode,
    name_en: payload.nameEn,
    name_ar: payload.nameAr,
    brand: metadata.brand,
    category: metadata.category ?? payload.category,
    uom: payload.uom,
    pack_size: metadata.pack_size,
    packaging: metadata.packaging,
    storage_type: payload.storageType,
    carton_holds: metadata.carton_holds,
    primary_barcode: payload.barcodes[0] ?? null,
    all_barcodes: payload.barcodes,
    cost_price: payload.costPrice,
    selling_price: payload.sellingPrice,
    discount: payload.discount,
    image_path: typeof input.imagePath === "undefined" ? null : input.imagePath,
    is_active: input.isActive,
    _syncedAt: Date.now(),
    _source: "local_edit",
  };
}

export interface ProductMasterSaveResult {
  productId: string;
  /** True when the remote write succeeded inline; false when queued for sync. */
  synced: boolean;
}

/**
 * Save a product master edit local-first:
 * 1. The local mirror is updated immediately (the UI reflects the edit even
 *    fully offline).
 * 2. The remote write is attempted inline; on failure the save is enqueued in
 *    the outbox and the sync worker replays it when the cloud is reachable.
 *
 * Offline-created products use a `local:` id placeholder; the first successful
 * full catalog refresh replaces it with the server row.
 */
export async function saveProductMasterLocalFirst(
  db: DatabaseAdapter,
  input: ProductMasterSaveInput
): Promise<ProductMasterSaveResult> {
  const provisionalId =
    input.productId ??
    `local:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`;

  // Preserve the existing local image when the edit didn't touch it.
  let effectiveInput = input;
  if (typeof input.imagePath === "undefined" && input.productId) {
    const existing = await db.get<{ image_path?: string | null }>("products", input.productId).catch(() => null);
    effectiveInput = { ...input, imagePath: existing?.image_path ?? undefined };
  }

  await db
    .put("products", buildLocalMirrorRow(effectiveInput, provisionalId))
    .catch(() => { /* local mirror failures must never block the save */ });

  try {
    const productId = await persistProductMasterRemote(effectiveInput);
    if (productId !== provisionalId) {
      // Replace the provisional row with the server-id row.
      await db.delete("products", provisionalId).catch(() => undefined);
      await db.put("products", buildLocalMirrorRow(effectiveInput, productId)).catch(() => undefined);
    }
    return { productId, synced: true };
  } catch {
    await enqueue(db, {
      entity: PRODUCT_MASTER_ENTITY,
      op: effectiveInput.mode,
      payload: effectiveInput,
    });
    return { productId: provisionalId, synced: false };
  }
}

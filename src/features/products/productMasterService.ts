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
import { logAudit } from "@/services/auditService";
import {
  classifyError,
  SyncOperationError,
  type ClassifiedError,
  type SyncRecordState,
} from "@/sync/errors";
import {
  preparedProductImageDataUrl,
  uploadPreparedProductImage,
  type PreparedProductImage,
} from "./productImages";

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
  /** Compressed image bytes + deterministic object key, persisted in outbox. */
  imageUpload?: PreparedProductImage;
}

export const PRODUCT_MASTER_ENTITY = "product_master";

const PRODUCT_CREATE_ROLES = new Set([
  "admin",
  "owner",
  "ops_manager",
  "purchase",
  "purchase_manager",
]);
const PRODUCT_UPDATE_ROLES = new Set([...PRODUCT_CREATE_ROLES, "manager"]);

function validateProductInput(input: ProductMasterSaveInput): void {
  if (!input.payload.itemCode.trim()) {
    throw new SyncOperationError("Item code is required.", {
      code: "INVALID_PAYLOAD",
      permanent: true,
      retryable: false,
      syncState: "local_only",
    });
  }
  if (!input.payload.nameAr?.trim() && !input.payload.nameEn?.trim()) {
    throw new SyncOperationError("Arabic or English product name is required.", {
      code: "INVALID_PAYLOAD",
      permanent: true,
      retryable: false,
      syncState: "local_only",
    });
  }
  if (sanitizeBarcodes(input.payload.barcodes).length === 0) {
    throw new SyncOperationError("At least one barcode is required.", {
      code: "INVALID_PAYLOAD",
      permanent: true,
      retryable: false,
      syncState: "local_only",
    });
  }
}

async function assertProductWriteAccess(mode: ProductMasterSaveInput["mode"]): Promise<void> {
  const auth = await supabase.auth.getUser();
  if (auth.error) {
    const classified = classifyError(auth.error);
    throw new SyncOperationError(classified.message, {
      ...classified,
      code: classified.code ?? "AUTH_CHECK_FAILED",
      syncState: "local_only",
    });
  }
  if (!auth.data.user) {
    throw new SyncOperationError("Supabase session is missing or expired.", {
      code: "SESSION_REQUIRED",
      status: 401,
      permanent: true,
      retryable: false,
      syncState: "local_only",
      hint: "Sign in again before retrying this product operation.",
    });
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id,full_name,email,role,is_active")
    .eq("id", auth.data.user.id)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) {
    throw new SyncOperationError("No application profile exists for the signed-in user.", {
      code: "PROFILE_MISSING",
      permanent: true,
      retryable: false,
      syncState: "local_only",
      details: `Authenticated user id: ${auth.data.user.id}. get_my_role() would resolve this user to read_only.`,
      hint: "An owner/admin must create the matching public.profiles row before retrying.",
    });
  }
  if (!profileResult.data.is_active) {
    throw new SyncOperationError("The signed-in application profile is inactive.", {
      code: "PROFILE_INACTIVE",
      permanent: true,
      retryable: false,
      syncState: "local_only",
      details: `Profile ${profileResult.data.id} (${profileResult.data.email ?? profileResult.data.full_name ?? "unnamed"}) is inactive.`,
      hint: "An owner/admin must reactivate the profile before retrying.",
    });
  }

  const role = profileResult.data.role ?? "read_only";
  const allowed = mode === "create" ? PRODUCT_CREATE_ROLES : PRODUCT_UPDATE_ROLES;
  if (!allowed.has(role)) {
    throw new SyncOperationError(`Role ${role} is not permitted to ${mode} products.`, {
      code: "42501",
      permanent: true,
      retryable: false,
      syncState: "local_only",
      details: `Resolved profile ${profileResult.data.id} (${profileResult.data.email ?? profileResult.data.full_name ?? "unnamed"}) to role ${role}.`,
      hint: "Ask an owner/admin to correct the active profile role, then retry from the Sync Log.",
    });
  }
}

function writeNotApplied(entity: string, id: string): SyncOperationError {
  return new SyncOperationError(`${entity} write was not applied for record ${id}.`, {
    code: "42501",
    permanent: true,
    retryable: false,
    syncState: "partial_remote",
    remoteRecordId: id,
    hint: "The row may exist, but RLS or the resolved profile role rejected the follow-up update.",
  });
}

// ─── Remote persistence (verbatim behavior from the former ProductDialog) ────

async function applyProductMetadataPatch(productId: string, patch: Record<string, unknown>) {
  const primary = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .select("id")
    .maybeSingle();
  if (!primary.error) {
    if (!primary.data) throw writeNotApplied("Product metadata", productId);
    return;
  }

  const missingSectionColumn =
    typeof patch.section !== "undefined" &&
    (primary.error.message.includes("section") || primary.error.code === "PGRST204");

  if (!missingSectionColumn) throw primary.error;

  const { section: _ignored, ...fallbackPatch } = patch;
  const fallback = await supabase
    .from("products")
    .update(fallbackPatch)
    .eq("id", productId)
    .select("id")
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  if (!fallback.data) throw writeNotApplied("Product metadata", productId);
}

async function syncProductBarcodes(productId: string, barcodes: string[], source: string) {
  const normalizedBarcodes = sanitizeBarcodes(barcodes);
  const existing = await supabase
    .from("product_barcodes")
    .select("id,barcode,is_primary")
    .eq("product_id", productId);
  if (existing.error) throw existing.error;

  if (normalizedBarcodes.length > 0) {
    const conflicts = await supabase
      .from("product_barcodes")
      .select("barcode,product_id")
      .in("barcode", normalizedBarcodes)
      .neq("product_id", productId);
    if (conflicts.error) throw conflicts.error;
    if (conflicts.data.length > 0) {
      throw new SyncOperationError(
        `Barcode ${conflicts.data[0].barcode} already belongs to another product.`,
        {
          code: "23505",
          permanent: true,
          retryable: false,
          syncState: "partial_remote",
          remoteRecordId: productId,
        }
      );
    }
  }

  // Add/update desired rows before deleting obsolete ones. A transient failure
  // therefore cannot leave the product with every barcode removed.
  for (const [index, barcode] of normalizedBarcodes.entries()) {
    const current = existing.data.find((row) => row.barcode === barcode);
    if (current) {
      const updated = await supabase
        .from("product_barcodes")
        .update({ is_primary: index === 0, source })
        .eq("id", current.id)
        .select("id")
        .maybeSingle();
      if (updated.error) throw updated.error;
      if (!updated.data) throw writeNotApplied("Product barcode", productId);
    } else {
      const inserted = await supabase.from("product_barcodes").insert({
        product_id: productId,
        barcode,
        is_primary: index === 0,
        source,
      });
      if (inserted.error) throw inserted.error;
    }
  }

  const obsoleteIds = existing.data
    .filter((row) => !normalizedBarcodes.includes(row.barcode))
    .map((row) => row.id);
  if (obsoleteIds.length > 0) {
    const removed = await supabase
      .from("product_barcodes")
      .delete()
      .in("id", obsoleteIds)
      .select("id");
    if (removed.error) throw removed.error;
    if ((removed.data?.length ?? 0) !== obsoleteIds.length) {
      throw writeNotApplied("Product barcode cleanup", productId);
    }
  }
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
    const { data, error } = await supabase
      .from("product_prices")
      .update({
        cost_price: values.costPrice,
        selling_price: values.sellingPrice,
        discount: values.discount,
        price_source: values.priceSource,
      })
      .eq("product_id", productId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw writeNotApplied("Product price", productId);
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

async function updateProductDirect(
  productId: string,
  payload: ProductMasterPayload & { isActive: boolean },
  syncRelated = true
) {
  const { data, error } = await supabase
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
    .eq("id", productId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw writeNotApplied("Product", productId);

  if (syncRelated) {
    await syncProductPrice(productId, {
      costPrice: payload.costPrice,
      sellingPrice: payload.sellingPrice,
      discount: payload.discount,
      priceSource: "manual_direct",
    });
    await syncProductBarcodes(productId, payload.barcodes, "manual_direct");
  }
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
    // Do NOT swallow: if the follow-up write fails the caller must see it
    // (previously this hid RLS/permission failures and left half-configured
    // products). The write is idempotent, so a retry re-applies it.
    await updateProductDirect(newId, { ...payload, isActive: true }, false);
    await syncProductBarcodes(newId, payload.barcodes, "manual");
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

  await updateProductDirect(productId, payload, false);
  await syncProductBarcodes(productId, payload.barcodes, "manual");
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
    const batchNos = Array.from(new Set(newRows.map((batch) => batch.batchNo.trim())));
    const existing = await supabase
      .from("inventory_batches")
      .select("batch_no")
      .eq("product_id", productId)
      .in("batch_no", batchNos);
    if (existing.error) throw existing.error;
    const existingNos = new Set(existing.data.map((row) => row.batch_no));
    const missingRows = newRows.filter((batch) => !existingNos.has(batch.batchNo.trim()));
    if (missingRows.length > 0) {
      const { error: insertError } = await supabase.from("inventory_batches").insert(
        missingRows.map((batch) => ({
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
  }

  for (const batch of rows.filter((row) => row.id)) {
    // Read the current metadata first so every edit leaves a revision trail.
    const { data: before } = await supabase
      .from("inventory_batches")
      .select("batch_no, production_date, expiry_date, received_date")
      .eq("id", batch.id!)
      .maybeSingle();

    const next = {
      batch_no: batch.batchNo.trim(),
      production_date: batch.productionDate || null,
      expiry_date: batch.expiryDate,
      received_date: batch.receivedDate || todayIso(),
    };

    const changed =
      !before ||
      before.batch_no !== next.batch_no ||
      before.production_date !== next.production_date ||
      before.expiry_date !== next.expiry_date ||
      before.received_date !== next.received_date;
    if (!changed) continue;

    const { data: updated, error: updateError } = await supabase
      .from("inventory_batches")
      .update(next)
      .eq("id", batch.id!)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw writeNotApplied("Inventory batch", batch.id!);

    void logAudit({
      entityType: "batch",
      entityId: batch.id,
      action: "batch_metadata_updated",
      oldValue: before ?? undefined,
      newValue: next,
    });
  }
}

/**
 * Atomic canonical save via the upsert_product_master RPC (one transaction:
 * product + price + barcodes + metadata + image, with an explicit permission
 * check). Returns the product id, or null when the RPC is not deployed yet
 * (PGRST202) so the caller can fall back to the legacy multi-step path.
 */
async function upsertProductMasterAtomic(input: ProductMasterSaveInput): Promise<string | null> {
  const { payload, metadata } = input;

  const { data, error } = await (supabase.rpc as any)("upsert_product_master", {
    p_product_id: input.mode === "update" ? input.productId : null,
    p_item_code: payload.itemCode,
    p_name_en: payload.nameEn ?? "",
    p_name_ar: payload.nameAr ?? "",
    p_brand: metadata.brand,
    p_category: metadata.category ?? payload.category,
    p_uom: payload.uom,
    p_packaging: metadata.packaging,
    p_storage_type: payload.storageType,
    p_pack_size: metadata.pack_size,
    p_carton_holds: metadata.carton_holds,
    p_cost_price: payload.costPrice,
    p_selling_price: payload.sellingPrice,
    p_discount: payload.discount,
    p_barcodes: payload.barcodes,
    p_image_path: typeof input.imagePath === "undefined" ? null : input.imagePath,
    p_image_path_set: typeof input.imagePath !== "undefined",
    p_is_active: input.isActive,
  });

  if (error) {
    if (isMissingRpcSignature(error, "upsert_product_master")) return null; // not deployed
    throw error; // real, structured error — surfaced to the caller
  }

  const result = data as { product_id?: string } | null;
  if (!result?.product_id) throw new Error("upsert_product_master returned no product id.");

  return result.product_id;
}

/**
 * The full remote save sequence. Used both for the online path and for outbox
 * replay — MUST stay idempotent (upsert by item_code, so a replayed create
 * cannot duplicate a product).
 *
 * Prefers the atomic upsert_product_master RPC; only if that RPC is not
 * deployed does it fall back to the legacy multi-step path — and that path no
 * longer swallows errors (a failed follow-up write now fails the whole save
 * loudly instead of leaving a half-configured product).
 */
async function findRemoteProductId(itemCode: string): Promise<string | null> {
  const result = await supabase
    .from("products")
    .select("id")
    .eq("item_code", itemCode)
    .maybeSingle();
  return result.error ? null : result.data?.id ?? null;
}

async function persistProductMasterRecordRemote(input: ProductMasterSaveInput): Promise<string> {
  validateProductInput(input);
  try {
    await assertProductWriteAccess(input.mode);
  } catch (error) {
    const classified = classifyError(error);
    throw new SyncOperationError(classified.message, {
      ...classified,
      syncState: "local_only",
      remoteRecordId: input.mode === "update" ? input.productId ?? undefined : undefined,
    });
  }

  let productId = input.mode === "update" ? input.productId : null;
  try {
    const atomicId = await upsertProductMasterAtomic(input);
    if (atomicId) {
      productId = atomicId;
    } else {
      // Legacy fallback while the reviewed atomic RPC remains unapplied.
      if (input.mode === "create") {
        const existing = await supabase
          .from("products")
          .select("id")
          .eq("item_code", input.payload.itemCode)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data?.id) {
          productId = existing.data.id;
          await updateProductWithCompatibility(productId, { ...input.payload, isActive: input.isActive });
        } else {
          productId = await createProductWithCompatibility(input.payload);
        }
      } else {
        if (!productId) {
          throw new SyncOperationError("Product update requires a product id.", {
            code: "INVALID_PAYLOAD",
            permanent: true,
            retryable: false,
          });
        }
        await updateProductWithCompatibility(productId, { ...input.payload, isActive: input.isActive });
      }

      if (!productId) throw new Error("Product save did not return an id.");
      const metadataPatch: Record<string, unknown> = { ...input.metadata };
      if (typeof input.imagePath !== "undefined") metadataPatch.image_path = input.imagePath;
      await applyProductMetadataPatch(productId, metadataPatch);
    }

    await persistProductBatches(productId, input.batches);
    return productId;
  } catch (error) {
    // A legacy RPC may have committed a bare product before a follow-up failed.
    // Discover that id so the outbox records partial success and replays safely.
    productId = productId ?? (await findRemoteProductId(input.payload.itemCode));
    const classified = classifyError(error);
    throw new SyncOperationError(classified.message, {
      ...classified,
      syncState: productId ? "partial_remote" : "local_only",
      remoteRecordId: productId ?? undefined,
    });
  }
}

export interface ProductRemoteSaveResult {
  productId: string;
  imagePath?: string | null;
  imageSynced: boolean;
}

/**
 * Persist the product record first, then upload/link its image. The image key
 * and bytes are stable across replay, so a retry cannot duplicate either.
 */
export async function persistProductMasterRemote(
  input: ProductMasterSaveInput
): Promise<ProductRemoteSaveResult> {
  const productId = await persistProductMasterRecordRemote(input);
  if (!input.imageUpload) {
    return { productId, imagePath: input.imagePath, imageSynced: true };
  }

  try {
    const imagePath = await uploadPreparedProductImage(input.imageUpload);
    await applyProductMetadataPatch(productId, { image_path: imagePath });
    return { productId, imagePath, imageSynced: true };
  } catch (error) {
    const classified = classifyError(error);
    throw new SyncOperationError(
      `Product saved remotely, but its image is not synchronized: ${classified.message}`,
      {
        ...classified,
        syncState: "partial_remote",
        remoteRecordId: productId,
      }
    );
  }
}

// ─── Local-first save ─────────────────────────────────────────────────────────

function buildLocalMirrorRow(
  input: ProductMasterSaveInput,
  productId: string,
  imagePath: string | null | undefined,
  syncState: SyncRecordState
) {
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
    image_path: imagePath ?? null,
    is_active: input.isActive,
    _syncedAt: syncState === "remote" ? Date.now() : null,
    _syncState: syncState,
    _source: "local_edit",
  };
}

export interface ProductMasterSaveResult {
  productId: string;
  /** True when the remote write succeeded inline; false when queued for sync. */
  synced: boolean;
  /** When not synced: the real classified error (never a generic message). */
  error?: ClassifiedError;
  imageSynced: boolean;
  syncState: SyncRecordState;
  outboxId?: string;
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
    `local:product:${encodeURIComponent(input.payload.itemCode.trim().toUpperCase())}`;

  const existing = await db
    .get<{ image_path?: string | null }>("products", provisionalId)
    .catch(() => null);
  const localImagePath = input.imageUpload
    ? preparedProductImageDataUrl(input.imageUpload)
    : typeof input.imagePath === "undefined"
      ? existing?.image_path
      : input.imagePath;

  await db
    .put("products", buildLocalMirrorRow(input, provisionalId, localImagePath, "pending"))
    .catch(() => { /* local mirror failures must never block the save */ });

  try {
    const remote = await persistProductMasterRemote(input);
    const productId = remote.productId;
    if (productId !== provisionalId) {
      // Replace the provisional row with the server-id row.
      await db.delete("products", provisionalId).catch(() => undefined);
    }
    await db
      .put(
        "products",
        buildLocalMirrorRow(
          input,
          productId,
          typeof remote.imagePath === "undefined" ? localImagePath : remote.imagePath,
          "remote"
        )
      )
      .catch(() => undefined);
    return {
      productId,
      synced: true,
      imageSynced: remote.imageSynced,
      syncState: "remote",
    };
  } catch (err) {
    const classified = classifyError(err);
    const remoteId = classified.remoteRecordId;
    const visibleId = remoteId ?? provisionalId;
    if (visibleId !== provisionalId) {
      await db.delete("products", provisionalId).catch(() => undefined);
    }
    await db
      .put(
        "products",
        buildLocalMirrorRow(
          input,
          visibleId,
          localImagePath,
          classified.syncState ?? (remoteId ? "partial_remote" : "local_only")
        )
      )
      .catch(() => undefined);
    const replayInput: ProductMasterSaveInput = remoteId
      ? { ...input, mode: "update", productId: remoteId }
      : input;
    // Queue for replay with a human-readable label + the real first error, so
    // the sync log shows WHAT and WHY, not a generic failure.
    const queued = await enqueue(db, {
      entity: PRODUCT_MASTER_ENTITY,
      op: replayInput.mode,
      payload: replayInput,
      label: `${classified.syncState === "partial_remote" ? "Complete" : replayInput.mode === "create" ? "Create" : "Edit"} product ${input.payload.itemCode}`,
      dedupeKey: `${PRODUCT_MASTER_ENTITY}:${input.payload.itemCode}`,
      itemCode: input.payload.itemCode,
      entityName: input.payload.nameEn ?? input.payload.nameAr ?? input.payload.itemCode,
      localRecordId: provisionalId,
      remoteRecordId: remoteId,
      syncState: classified.syncState ?? (remoteId ? "partial_remote" : "local_only"),
      initialFailure: classified,
    });
    return {
      productId: visibleId,
      synced: false,
      imageSynced: !input.imageUpload,
      syncState: classified.syncState ?? (remoteId ? "partial_remote" : "local_only"),
      error: classified,
      outboxId: queued.id,
    };
  }
}

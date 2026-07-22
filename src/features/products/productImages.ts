/**
 * Product image handling — local-first friendly.
 *
 * Storage model: products.image_path holds either a full URL (external) or an
 * object key inside the public `product-images` Supabase Storage bucket
 * (created by supabase/migrations/20260706120000_storage_buckets.sql).
 *
 * Performance rules (docs/LOCAL_FIRST_ARCHITECTURE.md):
 * - list views render ONLY small lazy <img> tags with a placeholder fallback;
 * - images are compressed client-side before upload (max 800px JPEG) so the
 *   bucket never accumulates multi-MB camera originals;
 * - a missing bucket or offline state degrades gracefully — the product still
 *   saves, only the image is skipped with a clear message.
 */
import { supabase } from "@/integrations/supabase/client";
import { classifyError, SyncOperationError } from "@/sync/errors";

export const PRODUCT_IMAGES_BUCKET = "product-images";

const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.82;

export interface PreparedProductImage {
  /** Stable across retries, so Storage upsert cannot create duplicate objects. */
  objectKey: string;
  contentType: string;
  base64: string;
}

/** Resolve an image_path value to a renderable URL (null-safe). */
export function resolveProductImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  if (/^(https?:|data:|blob:)/i.test(imagePath)) return imagePath;
  return supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

/** Downscale + re-encode an image file on a canvas before upload. */
export async function compressProductImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 300_000) return file; // already small enough

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

/**
 * Upload a (compressed) product image; returns the storage object key to put
 * into products.image_path. Throws with a human-readable message when the
 * bucket is missing or the network is down.
 */
function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(value: string, contentType: string): Blob {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

export function preparedProductImageDataUrl(image: PreparedProductImage): string {
  return `data:${image.contentType};base64,${image.base64}`;
}

/** Compress and serialize once. The exact object key and bytes survive restart. */
export async function prepareProductImageUpload(
  itemCode: string,
  file: File
): Promise<PreparedProductImage> {
  const blob = await compressProductImage(file);
  const safeCode = itemCode.replace(/[^A-Za-z0-9_-]/g, "_") || "product";
  const contentType = blob.type || file.type || "image/jpeg";
  const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const objectKey = `products/${safeCode}-${nonce}.${extensionFor(contentType)}`;
  const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  return { objectKey, contentType, base64 };
}

/** Idempotent upload of bytes prepared before the operation entered the outbox. */
export async function uploadPreparedProductImage(image: PreparedProductImage): Promise<string> {
  const blob = base64ToBlob(image.base64, image.contentType);

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(image.objectKey, blob, { contentType: image.contentType, upsert: true });

  if (error) {
    const classified = classifyError(error);
    throw new SyncOperationError(`Image upload failed: ${classified.message}`, {
      code: classified.code,
      status: classified.status,
      details: classified.details,
      hint: classified.hint,
      permanent: classified.permanent,
      retryable: classified.retryable,
      syncState: "partial_remote",
    });
  }
  return image.objectKey;
}

/** Convenience path retained for callers that do not need durable replay. */
export async function uploadProductImage(itemCode: string, file: File): Promise<string> {
  return uploadPreparedProductImage(await prepareProductImageUpload(itemCode, file));
}

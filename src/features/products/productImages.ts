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

export const PRODUCT_IMAGES_BUCKET = "product-images";

const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.82;

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
export async function uploadProductImage(itemCode: string, file: File): Promise<string> {
  const blob = await compressProductImage(file);
  const safeCode = itemCode.replace(/[^A-Za-z0-9_-]/g, "_") || "product";
  const key = `products/${safeCode}-${Date.now().toString(36)}.jpg`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(key, blob, { contentType: "image/jpeg", upsert: true });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        "Image storage is not provisioned yet (apply migration 20260706120000_storage_buckets.sql)."
      );
    }
    throw new Error(`Image upload failed: ${error.message}`);
  }
  return key;
}

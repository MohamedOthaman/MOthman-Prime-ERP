/**
 * SKU-matching learning store (customer_sku_mappings + auto_match_feedback).
 *
 * Why manual upserts: the live unique indexes are expression-based —
 * (customer_id, lower(external_name)) and (lower(external_name),
 * matched_product_id) — which PostgREST's `onConflict` cannot target, so
 * `.upsert(...)` always failed with 42P10 and the learning loop silently
 * never persisted anything. This service selects case-insensitively first,
 * then inserts or updates, and treats a unique-violation race (23505) as
 * success-by-other-writer.
 *
 * When to record: ONLY after the user has reviewed the lines (draft save) —
 * never inside the extraction loop, where a wrong fuzzy match would poison
 * the alias store before anyone confirmed it.
 */
import { supabase } from "@/integrations/supabase/client";

export interface MatchLearningEntry {
  /** The raw name that appeared on the uploaded document. */
  externalName: string;
  /** The product the user (implicitly) confirmed it maps to. */
  productId: string;
}

const UNIQUE_VIOLATION = "23505";

async function recordCustomerMapping(customerId: string, entry: MatchLearningEntry) {
  const externalName = entry.externalName.trim();
  if (!externalName) return;

  const { data: existing, error: selectError } = await supabase
    .from("customer_sku_mappings")
    .select("id, product_id")
    .eq("customer_id", customerId)
    .ilike("external_name", externalName)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    if (existing.product_id !== entry.productId) {
      // The user corrected the mapping — the correction wins.
      const { error } = await supabase
        .from("customer_sku_mappings")
        .update({ product_id: entry.productId })
        .eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  const { error } = await supabase.from("customer_sku_mappings").insert({
    customer_id: customerId,
    external_name: externalName,
    product_id: entry.productId,
  });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

async function recordFeedback(entry: MatchLearningEntry) {
  const externalName = entry.externalName.trim();
  if (!externalName) return;

  const { data: existing, error: selectError } = await supabase
    .from("auto_match_feedback")
    .select("id, usage_count")
    .ilike("external_name", externalName)
    .eq("matched_product_id", entry.productId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("auto_match_feedback")
      .update({
        usage_count: (existing.usage_count || 0) + 1,
        last_used: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("auto_match_feedback").insert({
    external_name: externalName,
    matched_product_id: entry.productId,
    usage_count: 1,
    last_used: new Date().toISOString(),
  });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

/**
 * Persist reviewed match learnings. Failures are logged (loudly) but never
 * break the invoice flow — learning is an enhancement, not a dependency.
 */
export async function recordMatchLearnings(
  customerId: string | null,
  entries: MatchLearningEntry[]
): Promise<void> {
  for (const entry of entries) {
    try {
      if (customerId) await recordCustomerMapping(customerId, entry);
      await recordFeedback(entry);
    } catch (err) {
      console.warn(
        "[sku-learning] failed to persist mapping",
        entry.externalName,
        (err as Error).message
      );
    }
  }
}

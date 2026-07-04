/**
 * Embedding utilities for P5 semantic search.
 *
 * STATUS: AI EMBEDDINGS INTENTIONALLY DISABLED
 * Gemini text-embedding-004 is retained here as a future option but is NOT
 * active at runtime. generateEmbedding, semanticSearch, and indexProduct are
 * no-ops / return empty results.
 *
 * Generates 768-dim vectors via the Gemini text-embedding-004 API and stores
 * them in the `entity_embeddings` table (pgvector). The `match_entities`
 * Postgres function handles cosine-similarity search server-side.
 */

import { supabase } from "@/integrations/supabase/client";

export type EntityType = "product" | "customer" | "invoice";

export interface EmbeddingMatch {
  entityType: EntityType;
  entityId: string;
  content: string;
  similarity: number;
}

// ─── Gemini embedding API (reference only — not called while AI is disabled) ──

// DISABLED: const GEMINI_EMBED_URL =
//   "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

export async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  // AI embeddings are disabled. Gemini text-embedding-004 is kept as a future option.
  void text;
  void apiKey;
  throw new Error(
    "AI embeddings are disabled. Gemini text-embedding-004 is retained as a future option but is not active.",
  );
}

// ─── Index helpers ─────────────────────────────────────────────────────────────

/**
 * Persist an embedding. NOTE: the `entity_embeddings` table has RLS that denies
 * writes to anon/authenticated clients — indexing must run with the service-role
 * key from a trusted server/admin context. Calling this with the browser anon
 * client will fail the RLS check (by design). See the P5 migration.
 */
export async function upsertEmbedding(
  entityType: EntityType,
  entityId: string,
  content: string,
  embedding: number[],
): Promise<void> {
  // entity_embeddings comes from the unapplied P5 pgvector migration, so it is
  // absent from the generated schema types — keep this dormant path untyped.
  const { error } = await (supabase.from("entity_embeddings" as never) as any)
    .upsert(
      {
        entity_type: entityType,
        entity_id: entityId,
        content,
        embedding: `[${embedding.join(",")}]`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "entity_type,entity_id" },
    );

  if (error) throw new Error(`Failed to upsert embedding: ${error.message}`);
}

export async function indexProduct(
  productId: string,
  name: string,
  sku: string | null,
  description: string | null,
  apiKey: string,
): Promise<void> {
  // AI embeddings are disabled — indexProduct is a no-op.
  void productId;
  void name;
  void sku;
  void description;
  void apiKey;
  console.warn(
    "[embeddings] indexProduct called but AI embeddings are disabled. " +
    "Gemini text-embedding-004 is kept as a future option.",
  );
}

// ─── Semantic search ───────────────────────────────────────────────────────────

export async function semanticSearch(
  query: string,
  apiKey: string,
  opts: {
    entityType?: EntityType;
    matchCount?: number;
    minSimilarity?: number;
  } = {},
): Promise<EmbeddingMatch[]> {
  // AI embeddings are disabled — return empty results to avoid UI crashes.
  void query;
  void apiKey;
  void opts;
  return [];
}

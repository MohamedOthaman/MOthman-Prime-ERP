/**
 * Embedding utilities for P5 semantic search.
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

// ─── Gemini embedding API ──────────────────────────────────────────────────────

const GEMINI_EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

export async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini embedding failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.embedding.values as number[];
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
  const { error } = await supabase
    .from("entity_embeddings" as never)
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
  const text = [name, sku, description].filter(Boolean).join(" — ");
  const embedding = await generateEmbedding(text, apiKey);
  await upsertEmbedding("product", productId, text, embedding);
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
  const embedding = await generateEmbedding(query, apiKey);

  const { data, error } = await supabase.rpc("match_entities" as never, {
    query_embedding: `[${embedding.join(",")}]`,
    filter_type: opts.entityType ?? null,
    match_count: opts.matchCount ?? 10,
    min_similarity: opts.minSimilarity ?? 0.4,
  });

  if (error) throw new Error(`Semantic search failed: ${error.message}`);

  return ((data as unknown[]) ?? []).map((row: unknown) => {
    const r = row as { entity_type: string; entity_id: string; content: string; similarity: number };
    return {
      entityType: r.entity_type as EntityType,
      entityId: r.entity_id,
      content: r.content,
      similarity: r.similarity,
    };
  });
}

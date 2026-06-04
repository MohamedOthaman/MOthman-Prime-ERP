-- P5 AI assistant: pgvector + semantic search over products, customers, invoices
--
-- Production-safety notes (addressed below):
--   • HNSW index (not IVFFlat): IVFFlat must be built on a populated table to
--     train its cluster lists — building it on an empty table yields a
--     degenerate index. HNSW needs no training data and is safe to create up
--     front. (pgvector ≥ 0.5.0; Supabase PG15+ ships a newer version.)
--   • RLS is enabled on BOTH new tables. entity_embeddings is derived data:
--     authenticated staff may READ for search; WRITES are restricted to the
--     service role (indexing must run server-side / via an admin context, NOT
--     from the browser with the anon key).
--   • match_entities pins search_path (no mutable search_path) and runs with
--     INVOKER rights so it respects the caller's RLS.

-- ─── Extension ────────────────────────────────────────────────────────────────
-- On Supabase the vector extension lives in the `extensions` schema.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ─── Embeddings store ─────────────────────────────────────────────────────────
-- One row per indexed entity. Content is the text that was embedded so callers
-- can display a snippet without re-fetching the original row.
CREATE TABLE IF NOT EXISTS public.entity_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,          -- 'product' | 'customer' | 'invoice'
    entity_id   UUID NOT NULL,
    content     TEXT NOT NULL,          -- the text chunk that was embedded
    embedding   extensions.vector(768), -- Gemini text-embedding-004 (768-dim)
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- One embedding per entity (upsert pattern).
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_embeddings_entity
    ON public.entity_embeddings (entity_type, entity_id);

-- HNSW approximate nearest-neighbour index (cosine distance).
-- Safe to build on an empty table; m / ef_construction are pgvector defaults.
CREATE INDEX IF NOT EXISTS idx_entity_embeddings_hnsw
    ON public.entity_embeddings USING hnsw (embedding extensions.vector_cosine_ops);

-- ─── Row-level security: embeddings ────────────────────────────────────────────
ALTER TABLE public.entity_embeddings ENABLE ROW LEVEL SECURITY;

-- All authenticated staff may read embeddings for semantic search.
-- (SELECT USING (true) is the intended pattern for shared, non-owned reference data.)
CREATE POLICY "Authenticated can read embeddings"
    ON public.entity_embeddings
    FOR SELECT
    TO authenticated
    USING (true);

-- No INSERT/UPDATE/DELETE policy is defined → writes are denied for anon and
-- authenticated. Indexing must use the service role (which bypasses RLS) from a
-- trusted server/admin context. This keeps derived data un-writable by clients.

-- ─── Similarity search function ───────────────────────────────────────────────
-- INVOKER rights (respects the caller's RLS) + pinned search_path.
CREATE OR REPLACE FUNCTION public.match_entities(
    query_embedding  extensions.vector(768),
    filter_type      TEXT DEFAULT NULL,   -- pass NULL to search all entity types
    match_count      INT  DEFAULT 10,
    min_similarity   FLOAT DEFAULT 0.4
)
RETURNS TABLE (
    entity_type  TEXT,
    entity_id    UUID,
    content      TEXT,
    similarity   FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ee.entity_type,
        ee.entity_id,
        ee.content,
        (1 - (ee.embedding <=> query_embedding))::FLOAT AS similarity
    FROM public.entity_embeddings ee
    WHERE
        (filter_type IS NULL OR ee.entity_type = filter_type)
        AND (1 - (ee.embedding <=> query_embedding)) >= min_similarity
    ORDER BY ee.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ─── AI assistant conversation log ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    messages    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user
    ON public.assistant_sessions (user_id, updated_at DESC);

-- Row-level security: users see only their own sessions.
-- auth.uid() is wrapped in a scalar sub-select so it is evaluated once per
-- query rather than once per row (avoids the auth_rls_initplan perf warning).
ALTER TABLE public.assistant_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions"
    ON public.assistant_sessions
    FOR ALL
    TO authenticated
    USING  ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

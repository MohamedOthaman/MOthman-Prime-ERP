-- P5 AI assistant: pgvector + semantic search over products, customers, invoices

-- ─── Extension ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Embeddings store ─────────────────────────────────────────────────────────
-- One row per indexed entity. Content is the text that was embedded so callers
-- can display a snippet without re-fetching the original row.
CREATE TABLE IF NOT EXISTS entity_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,          -- 'product' | 'customer' | 'invoice'
    entity_id   UUID NOT NULL,
    content     TEXT NOT NULL,          -- the text chunk that was embedded
    embedding   vector(768),            -- Gemini text-embedding-004 (768-dim)
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- One embedding per entity (upsert pattern).
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_embeddings_entity
    ON entity_embeddings (entity_type, entity_id);

-- IVFFlat approximate nearest-neighbour index (cosine distance).
-- lists = 100 is a reasonable default for up to ~100k vectors; tune later.
CREATE INDEX IF NOT EXISTS idx_entity_embeddings_ivfflat
    ON entity_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ─── Similarity search function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_entities(
    query_embedding  vector(768),
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
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ee.entity_type,
        ee.entity_id,
        ee.content,
        (1 - (ee.embedding <=> query_embedding))::FLOAT AS similarity
    FROM entity_embeddings ee
    WHERE
        (filter_type IS NULL OR ee.entity_type = filter_type)
        AND (1 - (ee.embedding <=> query_embedding)) >= min_similarity
    ORDER BY ee.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ─── AI assistant conversation log ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    messages    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user
    ON assistant_sessions (user_id, updated_at DESC);

-- Row-level security: users see only their own sessions.
ALTER TABLE assistant_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sessions"
    ON assistant_sessions
    FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

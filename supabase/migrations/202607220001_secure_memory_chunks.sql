-- Secure and version persistent memory chunks without resetting existing data.

ALTER TABLE public.memory_chunks
  ADD COLUMN IF NOT EXISTS chunk_index INTEGER,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

WITH ranked_chunks AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY material_id
    ORDER BY created_at, id
  ) - 1 AS generated_chunk_index
  FROM public.memory_chunks
)
UPDATE public.memory_chunks AS chunks
SET chunk_index = ranked_chunks.generated_chunk_index
FROM ranked_chunks
WHERE chunks.id = ranked_chunks.id
  AND chunks.chunk_index IS NULL;

UPDATE public.memory_chunks
SET embedding_model = 'legacy-unknown'
WHERE embedding_model IS NULL;

UPDATE public.memory_chunks
SET content_hash = md5(chunk_text)
WHERE content_hash IS NULL;

UPDATE public.memory_chunks
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.memory_chunks
  ALTER COLUMN chunk_index SET NOT NULL,
  ALTER COLUMN embedding_model SET NOT NULL,
  ALTER COLUMN content_hash SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_materials_id_profile
  ON public.memory_materials(id, memory_profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_chunks_material_chunk
  ON public.memory_chunks(material_id, chunk_index);

ALTER TABLE public.memory_chunks
  DROP CONSTRAINT IF EXISTS memory_chunks_material_id_fkey;

ALTER TABLE public.memory_chunks
  DROP CONSTRAINT IF EXISTS memory_chunks_material_profile_fkey;

ALTER TABLE public.memory_chunks
  ADD CONSTRAINT memory_chunks_material_profile_fkey
  FOREIGN KEY (material_id, memory_profile_id)
  REFERENCES public.memory_materials(id, memory_profile_id)
  ON DELETE CASCADE;

ALTER TABLE public.memory_chunks
  DROP CONSTRAINT IF EXISTS memory_chunks_source_type_check;

ALTER TABLE public.memory_chunks
  ADD CONSTRAINT memory_chunks_source_type_check
  CHECK (source_type IN ('text', 'image', 'audio', 'video', 'document'));

DROP POLICY IF EXISTS "Users can create chunks for their own profiles"
  ON public.memory_chunks;

DROP POLICY IF EXISTS "Users can delete chunks for their own profiles"
  ON public.memory_chunks;

REVOKE INSERT, UPDATE, DELETE ON public.memory_chunks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.match_memory_chunks(
  p_memory_profile_id UUID,
  p_query_embedding vector(1536),
  p_match_count INTEGER DEFAULT 10,
  p_min_similarity DOUBLE PRECISION DEFAULT 0.2
)
RETURNS TABLE (
  id UUID,
  material_id UUID,
  title TEXT,
  source_type TEXT,
  chunk_text TEXT,
  chunk_index INTEGER,
  similarity DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memory_profiles AS profiles
    WHERE profiles.id = p_memory_profile_id
      AND profiles.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Memory profile not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    chunks.id,
    chunks.material_id,
    materials.title,
    chunks.source_type,
    chunks.chunk_text,
    chunks.chunk_index,
    (1 - (chunks.embedding <=> p_query_embedding))::DOUBLE PRECISION AS similarity
  FROM public.memory_chunks AS chunks
  INNER JOIN public.memory_materials AS materials
    ON materials.id = chunks.material_id
   AND materials.memory_profile_id = chunks.memory_profile_id
  WHERE chunks.memory_profile_id = p_memory_profile_id
    AND chunks.embedding IS NOT NULL
    AND (1 - (chunks.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY chunks.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(p_match_count, 1), 20);
END;
$$;

REVOKE ALL ON FUNCTION public.match_memory_chunks(UUID, vector, INTEGER, DOUBLE PRECISION)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_memory_chunks(UUID, vector, INTEGER, DOUBLE PRECISION)
  TO authenticated;


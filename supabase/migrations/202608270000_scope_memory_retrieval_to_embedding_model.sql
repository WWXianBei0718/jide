-- Keep embedding spaces isolated when switching AI providers or models.
-- Vectors from different embedding models are not comparable, even at 1536 dimensions.

create index if not exists idx_memory_chunks_profile_embedding_model
  on public.memory_chunks(memory_profile_id, embedding_model)
  where embedding is not null;

-- Keep the existing four-argument function for OpenAI compatibility during rollout.
-- Qwen uses this model-aware overload only after this migration is deployed.
create or replace function public.match_memory_chunks(
  p_memory_profile_id uuid,
  p_query_embedding vector(1536),
  p_embedding_model text,
  p_match_count integer default 10,
  p_min_similarity double precision default 0.2
)
returns table (
  id uuid,
  material_id uuid,
  title text,
  source_type text,
  chunk_text text,
  chunk_index integer,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.memory_profiles as profiles
    where profiles.id = p_memory_profile_id and profiles.user_id = auth.uid()
  ) then
    raise exception 'Memory profile not found or access denied';
  end if;

  return query
  select
    chunks.id,
    chunks.material_id,
    materials.title,
    chunks.source_type,
    chunks.chunk_text,
    chunks.chunk_index,
    (1 - (chunks.embedding <=> p_query_embedding))::double precision as similarity
  from public.memory_chunks as chunks
  inner join public.memory_materials as materials
    on materials.id = chunks.material_id
   and materials.memory_profile_id = chunks.memory_profile_id
  where chunks.memory_profile_id = p_memory_profile_id
    and chunks.embedding_model = p_embedding_model
    and chunks.embedding is not null
    and (1 - (chunks.embedding <=> p_query_embedding)) >= p_min_similarity
  order by chunks.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 20);
end;
$$;

revoke all on function public.match_memory_chunks(uuid, vector, text, integer, double precision)
  from public, anon;
grant execute on function public.match_memory_chunks(uuid, vector, text, integer, double precision)
  to authenticated;

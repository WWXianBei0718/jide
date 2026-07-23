import { createHash } from 'node:crypto';
import { adminSupabase } from './admin-supabase';
import { chunkMaterialContent } from './memory-retrieval';
import { createEmbeddings, EMBEDDING_MODEL } from './openai-embeddings';
import type { MemoryMaterial } from '@/types';

export type IndexableMaterialType = MemoryMaterial['type'];

export interface MemoryIndexingResult {
  status: 'ready' | 'skipped' | 'failed';
  chunkCount: number;
  model?: string;
  reason?: string;
}

export type MemoryIndexingStatus = 'pending' | 'processing' | 'ready' | 'skipped' | 'failed';

function indexingMetadata(
  metadata: Record<string, unknown> | null | undefined,
  status: MemoryIndexingStatus,
  details: Record<string, unknown> = {}
): Record<string, unknown> {
  const next = { ...(metadata || {}) };
  delete next.indexing_error;
  delete next.indexing_failed_at;
  delete next.indexed_at;
  delete next.indexed_chunk_count;
  delete next.embedding_model;

  return {
    ...next,
    indexing_status: status,
    indexing_attempts:
      status === 'processing'
        ? (typeof next.indexing_attempts === 'number' ? next.indexing_attempts : 0) + 1
        : next.indexing_attempts,
    indexing_updated_at: new Date().toISOString(),
    ...details,
  };
}

export function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function indexMemoryMaterial(input: {
  materialId: string;
  profileId: string;
  sourceType: IndexableMaterialType;
  content: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<MemoryIndexingResult> {
  const chunks = chunkMaterialContent(input.content || '');
  if (!chunks.length) {
    await adminSupabase.from('memory_materials').update({
      metadata: indexingMetadata(input.metadata, 'skipped', {
        indexing_error: 'no_text_content',
      }),
    }).eq('id', input.materialId).eq('memory_profile_id', input.profileId);
    return { status: 'skipped', chunkCount: 0, reason: 'no_text_content' };
  }

  const processingMetadata = indexingMetadata(input.metadata, 'processing');
  const { error: processingError } = await adminSupabase.from('memory_materials').update({
    metadata: processingMetadata,
  }).eq('id', input.materialId).eq('memory_profile_id', input.profileId);

  if (processingError) {
    return { status: 'failed', chunkCount: 0, reason: 'indexing_state_update_failed' };
  }

  try {
    const embeddings = await createEmbeddings(chunks);
    const rows = chunks.map((chunkText, chunkIndex) => ({
      memory_profile_id: input.profileId,
      material_id: input.materialId,
      chunk_text: chunkText,
      embedding: vectorLiteral(embeddings[chunkIndex]),
      source_type: input.sourceType,
      chunk_index: chunkIndex,
      embedding_model: EMBEDDING_MODEL,
      content_hash: contentHash(chunkText),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await adminSupabase.from('memory_chunks').upsert(rows, {
      onConflict: 'material_id,chunk_index',
    });
    if (error) throw new Error('Memory chunk persistence failed');

    const { error: staleChunkError } = await adminSupabase
      .from('memory_chunks')
      .delete()
      .eq('material_id', input.materialId)
      .eq('memory_profile_id', input.profileId)
      .gte('chunk_index', rows.length);
    if (staleChunkError) throw new Error('Stale memory chunk cleanup failed');

    const { error: readyStateError } = await adminSupabase.from('memory_materials').update({
      metadata: indexingMetadata(processingMetadata, 'ready', {
        embedding_model: EMBEDDING_MODEL,
        indexed_chunk_count: rows.length,
        indexed_at: new Date().toISOString(),
      }),
    }).eq('id', input.materialId).eq('memory_profile_id', input.profileId);
    if (readyStateError) throw new Error('Indexing state persistence failed');

    return { status: 'ready', chunkCount: rows.length, model: EMBEDDING_MODEL };
  } catch (error) {
    console.error('Memory material indexing failed:', error instanceof Error ? error.message : 'unknown');
    await adminSupabase.from('memory_materials').update({
      metadata: indexingMetadata(processingMetadata, 'failed', {
        indexing_error: 'embedding_or_persistence_failed',
        indexing_failed_at: new Date().toISOString(),
      }),
    }).eq('id', input.materialId).eq('memory_profile_id', input.profileId);
    return { status: 'failed', chunkCount: 0, reason: 'embedding_or_persistence_failed' };
  }
}

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
    return { status: 'skipped', chunkCount: 0, reason: 'no_text_content' };
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
    }));

    const { error } = await adminSupabase.from('memory_chunks').insert(rows);
    if (error) throw new Error('Memory chunk persistence failed');

    await adminSupabase.from('memory_materials').update({
      metadata: {
        ...(input.metadata || {}),
        indexing_status: 'ready',
        embedding_model: EMBEDDING_MODEL,
        indexed_chunk_count: rows.length,
        indexed_at: new Date().toISOString(),
      },
    }).eq('id', input.materialId).eq('memory_profile_id', input.profileId);

    return { status: 'ready', chunkCount: rows.length, model: EMBEDDING_MODEL };
  } catch (error) {
    console.error('Memory material indexing failed:', error instanceof Error ? error.message : 'unknown');
    await adminSupabase.from('memory_materials').update({
      metadata: {
        ...(input.metadata || {}),
        indexing_status: 'failed',
        indexing_error: 'embedding_or_persistence_failed',
        indexing_failed_at: new Date().toISOString(),
      },
    }).eq('id', input.materialId).eq('memory_profile_id', input.profileId);
    return { status: 'failed', chunkCount: 0, reason: 'embedding_or_persistence_failed' };
  }
}

import { EMBEDDING_MODEL } from './openai-embeddings';

export interface BackfillMaterial {
  id: string;
  memory_profile_id: string;
  type: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type BackfillReason = 'not_indexed' | 'failed' | 'outdated_model';

export interface BackfillCandidate extends BackfillMaterial {
  reason: BackfillReason;
}

export interface MemoryBackfillPlan {
  candidates: BackfillCandidate[];
  eligibleCount: number;
  deferredCount: number;
  skipped: {
    ready: number;
    noText: number;
    unsupported: number;
  };
}

export function createMemoryBackfillPlan(
  materials: BackfillMaterial[],
  limit: number
): MemoryBackfillPlan {
  const eligible: BackfillCandidate[] = [];
  const skipped = { ready: 0, noText: 0, unsupported: 0 };

  for (const material of materials) {
    if (material.type !== 'text') {
      skipped.unsupported += 1;
      continue;
    }
    if (!material.content?.trim()) {
      skipped.noText += 1;
      continue;
    }

    const status = material.metadata?.indexing_status;
    const model = material.metadata?.embedding_model;
    if (status === 'ready' && model === EMBEDDING_MODEL) {
      skipped.ready += 1;
      continue;
    }

    eligible.push({
      ...material,
      reason:
        status === 'failed'
          ? 'failed'
          : status === 'ready'
            ? 'outdated_model'
            : 'not_indexed',
    });
  }

  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  return {
    candidates: eligible.slice(0, safeLimit),
    eligibleCount: eligible.length,
    deferredCount: Math.max(0, eligible.length - safeLimit),
    skipped,
  };
}

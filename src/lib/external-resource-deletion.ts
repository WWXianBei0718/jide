import type { StorageDeletionTarget } from './account-deletion';

export interface ExternalDeletionResult {
  ok: boolean;
  deletedCount: number;
  reason?: 'not_configured' | 'provider_rejected' | 'storage_failed';
}

export type VoiceDeleteRequest = (
  url: string,
  init: RequestInit
) => Promise<{ ok: boolean; status: number }>;

export async function deleteElevenLabsVoices(
  voiceIds: string[],
  apiKey: string | undefined,
  request: VoiceDeleteRequest = fetch
): Promise<ExternalDeletionResult> {
  const uniqueVoiceIds = [...new Set(voiceIds.filter(Boolean))];
  if (!uniqueVoiceIds.length) return { ok: true, deletedCount: 0 };
  if (!apiKey) return { ok: false, deletedCount: 0, reason: 'not_configured' };

  let deletedCount = 0;
  for (const voiceId of uniqueVoiceIds) {
    const response = await request(
      `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
      {
        method: 'DELETE',
        headers: { 'xi-api-key': apiKey },
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!response.ok && response.status !== 404) {
      return {
        ok: false,
        deletedCount,
        reason: 'provider_rejected',
      };
    }
    deletedCount += 1;
  }
  return { ok: true, deletedCount };
}

export function groupStorageDeletionTargets(
  targets: StorageDeletionTarget[]
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const target of targets) {
    const paths = grouped.get(target.bucket) || [];
    if (!paths.includes(target.path)) paths.push(target.path);
    grouped.set(target.bucket, paths);
  }
  return grouped;
}

export type StorageRemoveRequest = (
  bucket: string,
  paths: string[]
) => Promise<{ error: unknown }>;

export async function deleteStorageTargets(
  targets: StorageDeletionTarget[],
  remove: StorageRemoveRequest
): Promise<ExternalDeletionResult> {
  let deletedCount = 0;
  for (const [bucket, paths] of groupStorageDeletionTargets(targets)) {
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error } = await remove(bucket, batch);
      if (error) {
        return { ok: false, deletedCount, reason: 'storage_failed' };
      }
      deletedCount += batch.length;
    }
  }
  return { ok: true, deletedCount };
}

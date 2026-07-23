import { adminSupabase } from './admin-supabase';

export interface ExpiredUpload {
  id: string;
  quarantine_path: string | null;
}

export interface ExpiredUploadCleanupResult {
  claimed: number;
  deleted: number;
  pending: number;
}

export function collectUniqueQuarantinePaths(
  uploads: ExpiredUpload[]
): string[] {
  return [...new Set(
    uploads
      .map((upload) => upload.quarantine_path)
      .filter((path): path is string => Boolean(path))
  )];
}

export async function cleanupExpiredUploadsForUser(
  userId: string,
  now = new Date()
): Promise<ExpiredUploadCleanupResult> {
  const empty = { claimed: 0, deleted: 0, pending: 0 };
  const { data: candidates, error: candidatesError } = await adminSupabase
    .from('uploaded_files')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['requested', 'quarantined'])
    .lt('upload_expires_at', now.toISOString())
    .limit(50);

  if (candidatesError || !candidates?.length) return empty;

  const ids = candidates.map((candidate: { id: string }) => candidate.id);
  const { data: claimed, error: claimError } = await adminSupabase
    .from('uploaded_files')
    .update({
      status: 'deleting',
      processing_error: 'expired_upload_cleanup',
    })
    .eq('user_id', userId)
    .in('id', ids)
    .in('status', ['requested', 'quarantined'])
    .lt('upload_expires_at', now.toISOString())
    .select('id, quarantine_path');

  if (claimError || !claimed?.length) return empty;

  const uploads = claimed as ExpiredUpload[];
  const paths = collectUniqueQuarantinePaths(uploads);
  const { error: storageError } = paths.length
    ? await adminSupabase.storage.from('memory-quarantine').remove(paths)
    : { error: null };

  if (storageError) {
    await adminSupabase
      .from('uploaded_files')
      .update({
        status: 'quarantined',
        processing_error: 'expired_upload_cleanup_pending',
      })
      .eq('user_id', userId)
      .in('id', uploads.map((upload) => upload.id))
      .eq('status', 'deleting')
      .eq('processing_error', 'expired_upload_cleanup');

    return {
      claimed: uploads.length,
      deleted: 0,
      pending: uploads.length,
    };
  }

  const claimedIds = uploads.map((upload) => upload.id);
  const deletedAt = now.toISOString();
  const { error: updateError } = await adminSupabase
    .from('uploaded_files')
    .update({
      status: 'rejected',
      deleted_at: deletedAt,
      processing_error: 'upload_authorization_expired',
    })
    .eq('user_id', userId)
    .in('id', claimedIds)
    .eq('status', 'deleting');

  return {
    claimed: uploads.length,
    deleted: updateError ? 0 : uploads.length,
    pending: updateError ? uploads.length : 0,
  };
}

export const ACCOUNT_DELETE_CONFIRMATION = '永久删除我的账号';
export const MAX_REAUTH_AGE_SECONDS = 5 * 60;

export interface StorageDeletionTarget {
  bucket: string;
  path: string;
}

export interface DeletableUpload {
  storage_bucket: string;
  file_path: string;
  quarantine_path: string | null;
  status: string;
}

export function accessTokenIssuedAt(accessToken: string): number | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      iat?: unknown;
    };
    return typeof parsed.iat === 'number' && Number.isFinite(parsed.iat) ? parsed.iat : null;
  } catch {
    return null;
  }
}

export function hasRecentAuthentication(
  accessToken: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const issuedAt = accessTokenIssuedAt(accessToken);
  if (issuedAt === null) return false;
  const age = nowSeconds - issuedAt;
  return age >= -60 && age <= MAX_REAUTH_AGE_SECONDS;
}

export function storageDeletionTargets(uploads: DeletableUpload[]): StorageDeletionTarget[] {
  const unique = new Map<string, StorageDeletionTarget>();
  for (const upload of uploads) {
    if (upload.status === 'deleted') continue;
    if (upload.file_path) {
      const target = { bucket: upload.storage_bucket, path: upload.file_path };
      unique.set(`${target.bucket}:${target.path}`, target);
    }
    if (upload.quarantine_path) {
      const target = { bucket: 'memory-quarantine', path: upload.quarantine_path };
      unique.set(`${target.bucket}:${target.path}`, target);
    }
  }
  return [...unique.values()];
}

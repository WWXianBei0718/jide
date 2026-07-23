export const ACCOUNT_DELETE_CONFIRMATION = '永久删除我的账号';
export const MAX_REAUTH_AGE_SECONDS = 5 * 60;

interface AuthenticationMethodReference {
  method: string;
  timestamp: number;
}

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

export function accessTokenAuthenticationMethods(
  accessToken: string
): AuthenticationMethodReference[] {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return [];
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      amr?: unknown;
    };
    if (!Array.isArray(parsed.amr)) return [];

    return parsed.amr.flatMap((entry) => {
      if (
        typeof entry !== 'object'
        || entry === null
        || !('method' in entry)
        || !('timestamp' in entry)
        || typeof entry.method !== 'string'
        || typeof entry.timestamp !== 'number'
        || !Number.isFinite(entry.timestamp)
      ) {
        return [];
      }
      return [{ method: entry.method, timestamp: entry.timestamp }];
    });
  } catch {
    return [];
  }
}

export function hasRecentPasswordAuthentication(
  accessToken: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  return accessTokenAuthenticationMethods(accessToken).some(({ method, timestamp }) => {
    if (method !== 'password') return false;
    const age = nowSeconds - timestamp;
    return age >= -60 && age <= MAX_REAUTH_AGE_SECONDS;
  });
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

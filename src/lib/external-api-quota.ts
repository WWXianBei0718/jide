import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_EXTERNAL_API_UNITS = 25 * 1024 * 1024;

export type ExternalApiOperation = 'voice_clone' | 'tts' | 'upload';
export type ExternalApiLimitScope = 'burst' | 'daily_requests' | 'daily_units';

interface ExternalApiQuotaRow {
  allowed: boolean;
  limit_scope: ExternalApiLimitScope | null;
  retry_after_seconds: number;
}

export type ExternalApiQuotaResult =
  | { status: 'allowed' }
  | {
      status: 'limited';
      scope: ExternalApiLimitScope;
      retryAfterSeconds: number;
    }
  | { status: 'unavailable' };

function isQuotaRow(value: unknown): value is ExternalApiQuotaRow {
  if (!value || typeof value !== 'object') return false;

  const row = value as Partial<ExternalApiQuotaRow>;
  return (
    typeof row.allowed === 'boolean' &&
    (row.limit_scope === null ||
      row.limit_scope === 'burst' ||
      row.limit_scope === 'daily_requests' ||
      row.limit_scope === 'daily_units') &&
    typeof row.retry_after_seconds === 'number' &&
    Number.isFinite(row.retry_after_seconds)
  );
}

export function interpretExternalApiQuota(
  data: unknown,
  hasError = false
): ExternalApiQuotaResult {
  if (hasError || !Array.isArray(data) || !isQuotaRow(data[0])) {
    return { status: 'unavailable' };
  }

  const row = data[0];
  if (row.allowed) return { status: 'allowed' };
  if (!row.limit_scope) return { status: 'unavailable' };

  return {
    status: 'limited',
    scope: row.limit_scope,
    retryAfterSeconds: Math.max(1, Math.ceil(row.retry_after_seconds)),
  };
}

export async function consumeExternalApiQuota(
  client: SupabaseClient,
  operation: ExternalApiOperation,
  units = 1
): Promise<ExternalApiQuotaResult> {
  if (!Number.isInteger(units) || units < 1 || units > MAX_EXTERNAL_API_UNITS) {
    return { status: 'unavailable' };
  }

  try {
    const { data, error } = await client.rpc('consume_external_api_quota', {
      requested_operation: operation,
      requested_units: units,
    });
    return interpretExternalApiQuota(data, Boolean(error));
  } catch {
    return { status: 'unavailable' };
  }
}

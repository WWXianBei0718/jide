import type { SupabaseClient } from '@supabase/supabase-js';

export const CHAT_REQUESTS_PER_MINUTE = 10;
export const CHAT_REQUESTS_PER_DAY = 100;

interface ChatQuotaRow {
  allowed: boolean;
  limit_scope: 'minute' | 'day' | null;
  retry_after_seconds: number;
}

export type ChatQuotaResult =
  | { status: 'allowed' }
  | { status: 'limited'; scope: 'minute' | 'day'; retryAfterSeconds: number }
  | { status: 'unavailable' };

function isQuotaRow(value: unknown): value is ChatQuotaRow {
  if (!value || typeof value !== 'object') return false;

  const row = value as Partial<ChatQuotaRow>;
  return (
    typeof row.allowed === 'boolean' &&
    (row.limit_scope === null || row.limit_scope === 'minute' || row.limit_scope === 'day') &&
    typeof row.retry_after_seconds === 'number' &&
    Number.isFinite(row.retry_after_seconds)
  );
}

export function interpretChatQuota(data: unknown, hasError = false): ChatQuotaResult {
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

export async function consumeChatQuota(client: SupabaseClient): Promise<ChatQuotaResult> {
  try {
    const { data, error } = await client.rpc('consume_chat_quota');
    return interpretChatQuota(data, Boolean(error));
  } catch {
    return { status: 'unavailable' };
  }
}

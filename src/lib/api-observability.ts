import { randomUUID } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { adminSupabase } from '@/lib/admin-supabase';

export type ApiRequestContext = {
  requestId: string;
  route: string;
};

type SafeLogDetails = {
  errorName?: string;
  providerStatus?: number;
  outcome?: string;
};

export type SecurityAuditRecord = {
  level: 'error';
  event: string;
  request_id: string;
  route: string;
  error_name?: string;
  provider_status?: number;
  outcome?: string;
};

const requestIdPattern = /^[A-Za-z0-9_-]{8,64}$/;
const safeLabelPattern = /^[A-Za-z0-9_.:-]{1,80}$/;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeLabel(value: string | undefined): string | undefined {
  if (!value || !safeLabelPattern.test(value)) return undefined;
  return value;
}

export function beginApiRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  route: string
): ApiRequestContext {
  const incomingRequestId = firstHeaderValue(req.headers['x-request-id']);
  const requestId = incomingRequestId && requestIdPattern.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID();

  res.setHeader('X-Request-Id', requestId);

  return {
    requestId,
    route,
  };
}

export function buildSecurityAuditRecord(
  context: ApiRequestContext,
  event: string,
  details: SafeLogDetails = {}
): SecurityAuditRecord {
  return {
    level: 'error',
    event: safeLabel(event) || 'api.error',
    request_id: context.requestId,
    route: safeLabel(context.route) || 'unknown',
    ...(safeLabel(details.errorName) ? { error_name: details.errorName } : {}),
    ...(Number.isInteger(details.providerStatus)
      && details.providerStatus! >= 100
      && details.providerStatus! <= 599
      ? { provider_status: details.providerStatus }
      : {}),
    ...(safeLabel(details.outcome) ? { outcome: details.outcome } : {}),
  };
}

async function persistSecurityAuditRecord(record: SecurityAuditRecord): Promise<void> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const persistence = adminSupabase.from('security_audit_events').insert(record);
    await Promise.race([
      persistence,
      new Promise((resolve) => {
        timeout = setTimeout(resolve, 1500);
      }),
    ]);
  } catch {
    // Console output remains the safe fallback when persistent audit storage is unavailable.
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function logApiError(
  context: ApiRequestContext,
  event: string,
  details: SafeLogDetails = {}
): Promise<void> {
  const record = buildSecurityAuditRecord(context, event, details);

  console.error(JSON.stringify({
    level: record.level,
    event: record.event,
    requestId: record.request_id,
    route: record.route,
    ...(record.error_name ? { errorName: record.error_name } : {}),
    ...(record.provider_status ? { providerStatus: record.provider_status } : {}),
    ...(record.outcome ? { outcome: record.outcome } : {}),
  }));

  await persistSecurityAuditRecord(record);
}

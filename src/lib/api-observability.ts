import { randomUUID } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

export type ApiRequestContext = {
  requestId: string;
  route: string;
};

type SafeLogDetails = {
  errorName?: string;
  providerStatus?: number;
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

export function logApiError(
  context: ApiRequestContext,
  event: string,
  details: SafeLogDetails = {}
): void {
  const record = {
    level: 'error',
    event: safeLabel(event) || 'api.error',
    requestId: context.requestId,
    route: safeLabel(context.route) || 'unknown',
    ...(safeLabel(details.errorName) ? { errorName: details.errorName } : {}),
    ...(Number.isInteger(details.providerStatus)
      && details.providerStatus! >= 100
      && details.providerStatus! <= 599
      ? { providerStatus: details.providerStatus }
      : {}),
    ...(safeLabel(details.outcome) ? { outcome: details.outcome } : {}),
  };

  console.error(JSON.stringify(record));
}

import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  beginApiRequest,
  buildSecurityAuditRecord,
  logApiError,
} from '../src/lib/api-observability';

function responseRecorder(): {
  headers: Record<string, string>;
  response: NextApiResponse;
} {
  const headers: Record<string, string> = {};
  return {
    headers,
    response: {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name] = String(value);
        return this;
      },
    } as NextApiResponse,
  };
}

test('keeps a safe upstream request id and exposes it for support', () => {
  const { headers, response } = responseRecorder();
  const context = beginApiRequest(
    { headers: { 'x-request-id': 'request_12345678' } } as unknown as NextApiRequest,
    response,
    'api.chat'
  );

  assert.equal(context.requestId, 'request_12345678');
  assert.equal(headers['X-Request-Id'], 'request_12345678');
});

test('replaces unsafe request ids instead of reflecting control characters', () => {
  const { headers, response } = responseRecorder();
  const context = beginApiRequest(
    { headers: { 'x-request-id': 'bad\nheader' } } as unknown as NextApiRequest,
    response,
    'api.chat'
  );

  assert.match(context.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(headers['X-Request-Id'], context.requestId);
  assert.doesNotMatch(context.requestId, /bad|header/);
});

test('structured API error logs contain only allowlisted operational fields', async () => {
  const messages: string[] = [];
  const originalConsoleError = console.error;
  console.error = (message?: unknown) => messages.push(String(message));

  try {
    await logApiError(
      { requestId: 'request_12345678', route: 'api.chat' },
      'openai.request_failed',
      {
        errorName: 'TimeoutError',
        providerStatus: 429,
        outcome: 'retry_later',
      }
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0]), {
    level: 'error',
    event: 'openai.request_failed',
    requestId: 'request_12345678',
    route: 'api.chat',
    errorName: 'TimeoutError',
    providerStatus: 429,
    outcome: 'retry_later',
  });
});

test('persistent audit records use database field names and exclude user content', () => {
  assert.deepEqual(
    buildSecurityAuditRecord(
      { requestId: 'request_12345678', route: 'api.voice_clone' },
      'elevenlabs.voice_clone_failed',
      {
        errorName: 'TimeoutError',
        providerStatus: 502,
        outcome: 'retry_later',
      }
    ),
    {
      level: 'error',
      event: 'elevenlabs.voice_clone_failed',
      request_id: 'request_12345678',
      route: 'api.voice_clone',
      error_name: 'TimeoutError',
      provider_status: 502,
      outcome: 'retry_later',
    }
  );
});

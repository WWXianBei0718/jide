import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  consumeExternalApiQuota,
  interpretExternalApiQuota,
} from '../src/lib/external-api-quota';

test('accepts a valid external API quota grant', () => {
  assert.deepEqual(
    interpretExternalApiQuota([
      { allowed: true, limit_scope: null, retry_after_seconds: 0 },
    ]),
    { status: 'allowed' }
  );
});

test('returns bounded retry information for every external API limit scope', () => {
  for (const scope of ['burst', 'daily_requests', 'daily_units'] as const) {
    assert.deepEqual(
      interpretExternalApiQuota([
        { allowed: false, limit_scope: scope, retry_after_seconds: 4.2 },
      ]),
      { status: 'limited', scope, retryAfterSeconds: 5 }
    );
  }
});

test('external API quota fails closed for malformed results and invalid units', async () => {
  assert.deepEqual(interpretExternalApiQuota(null), { status: 'unavailable' });
  assert.deepEqual(
    interpretExternalApiQuota([
      { allowed: true, limit_scope: null, retry_after_seconds: 0 },
    ], true),
    { status: 'unavailable' }
  );

  const client = {
    rpc: async () => {
      throw new Error('RPC must not run for invalid units');
    },
  } as unknown as SupabaseClient;

  assert.deepEqual(
    await consumeExternalApiQuota(client, 'tts', 5001),
    { status: 'unavailable' }
  );
});


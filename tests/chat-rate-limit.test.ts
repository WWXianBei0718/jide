import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consumeChatQuota, interpretChatQuota } from '../src/lib/chat-rate-limit';

test('accepts a valid quota grant', () => {
  assert.deepEqual(
    interpretChatQuota([{ allowed: true, limit_scope: null, retry_after_seconds: 0 }]),
    { status: 'allowed' }
  );
});

test('returns a safe retry window when the minute or daily limit is reached', () => {
  assert.deepEqual(
    interpretChatQuota([{ allowed: false, limit_scope: 'minute', retry_after_seconds: 12.2 }]),
    { status: 'limited', scope: 'minute', retryAfterSeconds: 13 }
  );
  assert.deepEqual(
    interpretChatQuota([{ allowed: false, limit_scope: 'day', retry_after_seconds: 0 }]),
    { status: 'limited', scope: 'day', retryAfterSeconds: 1 }
  );
});

test('fails closed when the database response is missing, malformed, or reports an error', () => {
  assert.deepEqual(interpretChatQuota(null), { status: 'unavailable' });
  assert.deepEqual(interpretChatQuota([{ allowed: true }]), { status: 'unavailable' });
  assert.deepEqual(
    interpretChatQuota([{ allowed: true, limit_scope: null, retry_after_seconds: 0 }], true),
    { status: 'unavailable' }
  );
});

test('fails closed when the database request throws', async () => {
  const client = {
    rpc: async () => {
      throw new Error('network unavailable');
    },
  } as unknown as SupabaseClient;

  assert.deepEqual(await consumeChatQuota(client), { status: 'unavailable' });
});

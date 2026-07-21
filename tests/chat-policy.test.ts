import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_MODEL,
  DEFAULT_CHAT_MAX_TOKENS,
  DEFAULT_CHAT_TEMPERATURE,
  resolveChatOptions,
} from '../src/lib/chat-policy';

test('uses the verified low-cost chat defaults', () => {
  const result = resolveChatOptions({});

  assert.deepEqual(result, {
    ok: true,
    options: {
      model: CHAT_MODEL,
      temperature: DEFAULT_CHAT_TEMPERATURE,
      maxTokens: DEFAULT_CHAT_MAX_TOKENS,
    },
  });
});

test('rejects misleading or unapproved model names', () => {
  assert.equal(resolveChatOptions({ model: 'gpt-5.5' }).ok, false);
  assert.equal(resolveChatOptions({ model: 'gpt-4o' }).ok, false);
});

test('accepts safe parameter values and rejects values outside the cost boundary', () => {
  assert.equal(
    resolveChatOptions({ model: CHAT_MODEL, temperature: 0.2, maxTokens: 1000 }).ok,
    true
  );
  assert.equal(resolveChatOptions({ temperature: 1.1 }).ok, false);
  assert.equal(resolveChatOptions({ maxTokens: 1001 }).ok, false);
  assert.equal(resolveChatOptions({ maxTokens: 12.5 }).ok, false);
});

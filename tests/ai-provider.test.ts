import assert from 'node:assert/strict';
import test from 'node:test';
import { aiProviderLabels, getChatProvider, getEmbeddingProvider } from '../src/lib/ai-provider';

function withEnvironment<T>(values: Record<string, string | undefined>, callback: () => T): T {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('defaults to OpenAI for both chat and embeddings', () => {
  withEnvironment({ AI_PROVIDER: undefined, AI_EMBEDDING_PROVIDER: undefined }, () => {
    assert.equal(getChatProvider().name, 'openai');
    assert.equal(getEmbeddingProvider().name, 'openai');
  });
});

test('keeps embeddings on OpenAI until Qwen embedding is explicitly selected', () => {
  withEnvironment({
    AI_PROVIDER: 'qwen',
    AI_EMBEDDING_PROVIDER: undefined,
    DASHSCOPE_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
  }, () => {
    const chat = getChatProvider();
    const embedding = getEmbeddingProvider();
    assert.equal(chat.name, 'qwen');
    assert.equal(chat.chatModel, 'qwen-plus');
    assert.equal(chat.baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    assert.equal(embedding.name, 'openai');
    assert.deepEqual(aiProviderLabels(), ['阿里云百炼·通义千问', 'OpenAI']);
  });
});

test('selects Qwen 1536-dimensional embeddings only when explicitly configured', () => {
  withEnvironment({
    AI_PROVIDER: 'qwen',
    AI_EMBEDDING_PROVIDER: 'qwen',
  }, () => {
    const embedding = getEmbeddingProvider();
    assert.equal(embedding.name, 'qwen');
    assert.equal(embedding.embeddingModel, 'qwen3.7-text-embedding');
    assert.deepEqual(aiProviderLabels(), ['阿里云百炼·通义千问']);
  });
});

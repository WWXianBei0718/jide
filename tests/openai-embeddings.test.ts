import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmbeddings,
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_BATCH_SIZE,
} from '../src/lib/openai-embeddings';

const validVector = () => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01);

test('orders and validates embedding vectors returned by OpenAI', async () => {
  const embeddings = await createEmbeddings(['first', 'second'], async () => ({
    ok: true,
    status: 200,
    data: {
      data: [
        { index: 1, embedding: validVector().map(() => 0.02) },
        { index: 0, embedding: validVector() },
      ],
    },
  }));

  assert.equal(embeddings.length, 2);
  assert.equal(embeddings[0][0], 0.01);
  assert.equal(embeddings[1][0], 0.02);
});

test('rejects empty, oversized, and malformed embedding requests', async () => {
  await assert.rejects(() => createEmbeddings([], async () => ({ ok: true, status: 200, data: {} })));
  await assert.rejects(() => createEmbeddings(
    Array.from({ length: MAX_EMBEDDING_BATCH_SIZE + 1 }, () => 'text'),
    async () => ({ ok: true, status: 200, data: {} })
  ));
  await assert.rejects(() => createEmbeddings(['text'], async () => ({
    ok: true,
    status: 200,
    data: { data: [{ index: 0, embedding: [0.1] }] },
  })));
});

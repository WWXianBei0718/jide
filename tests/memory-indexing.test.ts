import assert from 'node:assert/strict';
import test from 'node:test';
import { contentHash, vectorLiteral } from '../src/lib/memory-indexing';

test('serializes embeddings as pgvector literals', () => {
  assert.equal(vectorLiteral([0.1, -0.2, 0]), '[0.1,-0.2,0]');
});

test('creates stable content hashes and distinguishes changed memory text', () => {
  const first = contentHash('他喜欢在雨天散步。');
  const same = contentHash('他喜欢在雨天散步。');
  const changed = contentHash('他喜欢在晴天散步。');

  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATERIAL_CHUNK_CHARACTERS,
  MAX_RETRIEVAL_CHARACTERS,
  chunkMaterialContent,
  mergeRetrievedMaterialChunks,
  retrieveRelevantMaterialChunks,
} from '../src/lib/memory-retrieval';

const materials = [
  { id: 'recent', title: '天气记录', type: 'text', content: '今天是晴天，下午整理了房间。' },
  { id: 'tea', title: '喝茶习惯', type: 'text', content: '她爱喝淡茉莉花茶，不加糖，也不爱喝浓茶。' },
  { id: 'school', title: '教学经历', type: 'text', content: '她在青石镇小学做了三十二年语文老师。' },
];

test('ranks material chunks by relevance instead of creation order', () => {
  const result = retrieveRelevantMaterialChunks(materials, '外婆平时喜欢喝哪种茶？');
  assert.equal(result[0].id, 'tea');
  assert.ok(result[0].relevanceScore > result[1].relevanceScore);
});

test('splits long material into bounded overlapping chunks', () => {
  const content = `${'甲'.repeat(700)}。${'茉莉花茶'.repeat(180)}。${'乙'.repeat(700)}`;
  const result = retrieveRelevantMaterialChunks([
    { id: 'long', title: '长篇回忆', type: 'text', content },
  ], '茉莉花茶');

  assert.ok(result.length > 1);
  assert.ok(result.every((chunk) => (chunk.content?.length || 0) <= MATERIAL_CHUNK_CHARACTERS));
  assert.ok(result.reduce((sum, chunk) => sum + (chunk.content?.length || 0), 0) <= MAX_RETRIEVAL_CHARACTERS);
  assert.match(result[0].content || '', /茉莉花茶/);
  assert.ok(result[0].relevanceScore >= result[result.length - 1].relevanceScore);
});

test('falls back deterministically to recent material when there is no lexical match', () => {
  const result = retrieveRelevantMaterialChunks(materials, 'XYZ completely unrelated');
  assert.deepEqual(result.map((chunk) => chunk.id), ['recent', 'tea', 'school']);
});

test('uses the same deterministic chunks for persistence and lexical retrieval', () => {
  const content = `${'甲'.repeat(880)}。${'乙'.repeat(500)}`;
  const chunks = chunkMaterialContent(content);
  const retrieved = retrieveRelevantMaterialChunks([
    { id: 'same', title: '材料', type: 'text', content },
  ], '甲乙');

  assert.ok(chunks.length > 1);
  assert.ok(retrieved.every((item) => chunks.includes(item.content || '')));
});

test('weighted hybrid merge keeps strong vector evidence and removes duplicate chunks', () => {
  const vector = [{
    id: 'tea', title: '喝茶习惯', type: 'text', content: '爱喝淡茉莉花茶。',
    chunkIndex: 0, totalChunks: 1, relevanceScore: 0.91,
  }];
  const lexical = [
    ...vector,
    {
      id: 'school', title: '教学经历', type: 'text', content: '做了三十二年语文老师。',
      chunkIndex: 0, totalChunks: 1, relevanceScore: 2,
    },
  ];

  const merged = mergeRetrievedMaterialChunks(vector, lexical);
  assert.deepEqual(merged.map((chunk) => chunk.id), ['tea', 'school']);
});

test('weighted hybrid merge can promote strong lexical evidence within semantic candidates', () => {
  const vector = [
    { id: 'a', title: '甲', type: 'text', content: '甲', chunkIndex: 0, totalChunks: 1, relevanceScore: 1 },
    { id: 'b', title: '乙', type: 'text', content: '乙', chunkIndex: 0, totalChunks: 1, relevanceScore: 0.95 },
    { id: 'c', title: '丙', type: 'text', content: '丙', chunkIndex: 0, totalChunks: 1, relevanceScore: 0.1 },
  ];
  const lexical = [
    { ...vector[1], relevanceScore: 10 },
    { ...vector[0], relevanceScore: 0 },
    { ...vector[2], relevanceScore: 0 },
  ];

  const merged = mergeRetrievedMaterialChunks(vector, lexical);
  assert.equal(merged[0].id, 'b');
});

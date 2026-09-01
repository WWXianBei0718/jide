import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlindEvalCandidates } from '../src/lib/blind-eval';

test('blind evaluation removes whitespace-equivalent duplicate answers', () => {
  const candidates = createBlindEvalCandidates('style-06', [
    '小满，慢慢来。',
    '  小满，慢慢来。  ',
    '替你高兴。',
  ]);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((item) => item.id), ['A', 'B']);
  assert.deepEqual(
    new Set(candidates.map((item) => item.answer)),
    new Set(['小满，慢慢来。', '替你高兴。'])
  );
});

test('blind candidate ordering is deterministic without exposing run numbers', () => {
  const answers = ['第一种回答', '第二种回答', '第三种回答'];
  assert.deepEqual(
    createBlindEvalCandidates('continuity-01', answers),
    createBlindEvalCandidates('continuity-01', answers)
  );
  assert.ok(createBlindEvalCandidates('continuity-01', answers).every(
    (item) => !item.id.includes('run') && !item.id.includes('model')
  ));
});

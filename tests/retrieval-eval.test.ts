import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreRetrieval, type RetrievalEvalDataset } from '../src/lib/retrieval-eval';

const dataset: RetrievalEvalDataset = {
  version: 'test',
  fictional: true,
  materials: [],
  cases: [
    { id: 'hit-first', query: 'first', expectedMaterialIds: ['a'] },
    { id: 'hit-second', query: 'second', expectedMaterialIds: ['b'] },
    { id: 'miss', query: 'miss', expectedMaterialIds: ['c'] },
  ],
};

test('scores retrieval hit rate and relevant rank without counting duplicate chunks', () => {
  const score = scoreRetrieval(dataset, (query) => {
    const ids = query === 'first' ? ['a', 'a'] : query === 'second' ? ['x', 'b'] : ['x'];
    return ids.map((id, index) => ({
      id,
      title: id,
      type: 'text',
      content: id,
      chunkIndex: index,
      totalChunks: 1,
      relevanceScore: 1,
    }));
  }, 2);

  assert.equal(score.caseCount, 3);
  assert.equal(score.topK, 2);
  assert.equal(score.top1Accuracy, 1 / 3);
  assert.equal(score.hitRateAtK, 2 / 3);
  assert.equal(score.meanReciprocalRank, 0.5);
  assert.deepEqual(score.cases.map((item) => item.firstRelevantRank), [1, 2, null]);
});

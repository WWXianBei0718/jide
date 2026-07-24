import assert from 'node:assert/strict';
import test from 'node:test';
import { fictionalRetrievalV2 } from '../evals/fictional-retrieval-v2';
import { retrieveRelevantMaterialChunks } from '../src/lib/memory-retrieval';
import { scoreRetrieval } from '../src/lib/retrieval-eval';

test('retrieval v2 uses a large fictional dataset with an untouched-expression holdout split', () => {
  assert.equal(fictionalRetrievalV2.fictional, true);
  assert.ok(fictionalRetrievalV2.cases.length >= 50);
  assert.ok(
    fictionalRetrievalV2.cases.filter((item) => item.split === 'holdout').length >= 10
  );
  assert.equal(
    new Set(fictionalRetrievalV2.cases.map((item) => item.id)).size,
    fictionalRetrievalV2.cases.length
  );
});

test('offline lexical fallback clears the development gate without overstating holdout quality', () => {
  const score = scoreRetrieval(
    fictionalRetrievalV2,
    (query) => retrieveRelevantMaterialChunks(fictionalRetrievalV2.materials, query),
    3
  );

  assert.ok(score.top1Accuracy >= 0.9);
  assert.ok(score.hitRateAtK >= 0.95);
  assert.equal(score.splits.development.top1Accuracy, 1);
  assert.ok(score.splits.holdout.top1Accuracy < 1);
});

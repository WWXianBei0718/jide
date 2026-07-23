import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryBackfillPlan, type BackfillMaterial } from '../src/lib/memory-backfill';
import { EMBEDDING_MODEL } from '../src/lib/openai-embeddings';

function material(overrides: Partial<BackfillMaterial>): BackfillMaterial {
  return {
    id: 'material-id',
    memory_profile_id: 'profile-id',
    type: 'text',
    content: '一段真实资料',
    metadata: null,
    created_at: '2026-07-23T00:00:00.000Z',
    ...overrides,
  };
}

test('selects missing, failed, and outdated indexes while skipping current material', () => {
  const plan = createMemoryBackfillPlan([
    material({ id: 'missing' }),
    material({ id: 'failed', metadata: { indexing_status: 'failed' } }),
    material({ id: 'outdated', metadata: { indexing_status: 'ready', embedding_model: 'old-model' } }),
    material({ id: 'current', metadata: { indexing_status: 'ready', embedding_model: EMBEDDING_MODEL } }),
    material({ id: 'empty', content: '  ' }),
    material({ id: 'image', type: 'image' }),
  ], 10);

  assert.deepEqual(plan.candidates.map((item) => [item.id, item.reason]), [
    ['missing', 'not_indexed'],
    ['failed', 'failed'],
    ['outdated', 'outdated_model'],
  ]);
  assert.deepEqual(plan.skipped, { ready: 1, noText: 1, unsupported: 1 });
});

test('limits each backfill run and reports deferred work', () => {
  const plan = createMemoryBackfillPlan([
    material({ id: 'one' }),
    material({ id: 'two' }),
    material({ id: 'three' }),
  ], 2);

  assert.deepEqual(plan.candidates.map((item) => item.id), ['one', 'two']);
  assert.equal(plan.eligibleCount, 3);
  assert.equal(plan.deferredCount, 1);
});

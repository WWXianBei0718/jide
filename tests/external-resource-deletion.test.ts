import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteElevenLabsVoices,
  deleteStorageTargets,
  groupStorageDeletionTargets,
} from '../src/lib/external-resource-deletion';

test('treats already missing voices as safely deleted and stops on provider rejection', async () => {
  const calls: string[] = [];
  const success = await deleteElevenLabsVoices(['one', 'one', 'two'], 'key', async (url) => {
    calls.push(url);
    return { ok: url.endsWith('/one'), status: url.endsWith('/two') ? 404 : 200 };
  });
  assert.deepEqual(success, { ok: true, deletedCount: 2 });
  assert.equal(calls.length, 2);

  const failure = await deleteElevenLabsVoices(['one'], 'key', async () => ({
    ok: false,
    status: 422,
  }));
  assert.deepEqual(failure, {
    ok: false,
    deletedCount: 0,
    reason: 'provider_rejected',
  });
});

test('groups and removes storage targets in bounded batches', async () => {
  const targets = Array.from({ length: 101 }, (_, index) => ({
    bucket: 'memory-assets',
    path: `path-${index}`,
  }));
  const grouped = groupStorageDeletionTargets([...targets, targets[0]]);
  assert.equal(grouped.get('memory-assets')?.length, 101);

  const batchSizes: number[] = [];
  const result = await deleteStorageTargets(targets, async (_bucket, paths) => {
    batchSizes.push(paths.length);
    return { error: null };
  });
  assert.deepEqual(batchSizes, [100, 1]);
  assert.deepEqual(result, { ok: true, deletedCount: 101 });
});

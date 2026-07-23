import assert from 'node:assert/strict';
import test from 'node:test';
import { collectUniqueQuarantinePaths } from '../src/lib/expired-upload-cleanup';

test('expired upload cleanup removes duplicate and missing quarantine paths', () => {
  assert.deepEqual(
    collectUniqueQuarantinePaths([
      { id: 'one', quarantine_path: 'user/profile/one.pdf' },
      { id: 'two', quarantine_path: null },
      { id: 'three', quarantine_path: 'user/profile/one.pdf' },
      { id: 'four', quarantine_path: 'user/profile/four.mp3' },
    ]),
    ['user/profile/one.pdf', 'user/profile/four.mp3']
  );
});

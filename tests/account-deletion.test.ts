import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessTokenIssuedAt,
  hasRecentAuthentication,
  storageDeletionTargets,
} from '../src/lib/account-deletion';

function token(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test('requires a recently issued access token for destructive account deletion', () => {
  const now = 2_000_000_000;
  assert.equal(accessTokenIssuedAt(token({ iat: now - 10 })), now - 10);
  assert.equal(hasRecentAuthentication(token({ iat: now - 10 }), now), true);
  assert.equal(hasRecentAuthentication(token({ iat: now - 301 }), now), false);
  assert.equal(hasRecentAuthentication('invalid', now), false);
});

test('collects unique active storage paths across asset and quarantine buckets', () => {
  const targets = storageDeletionTargets([
    {
      storage_bucket: 'memory-assets',
      file_path: 'user/profile/file.pdf',
      quarantine_path: 'user/profile/file.pdf',
      status: 'ready',
    },
    {
      storage_bucket: 'memory-quarantine',
      file_path: 'user/profile/pending.wav',
      quarantine_path: 'user/profile/pending.wav',
      status: 'quarantined',
    },
    {
      storage_bucket: 'memory-assets',
      file_path: 'deleted.pdf',
      quarantine_path: null,
      status: 'deleted',
    },
  ]);

  assert.deepEqual(targets, [
    { bucket: 'memory-assets', path: 'user/profile/file.pdf' },
    { bucket: 'memory-quarantine', path: 'user/profile/file.pdf' },
    { bucket: 'memory-quarantine', path: 'user/profile/pending.wav' },
  ]);
});

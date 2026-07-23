import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessTokenAuthenticationMethods,
  hasRecentPasswordAuthentication,
  storageDeletionTargets,
} from '../src/lib/account-deletion';

function token(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test('requires a recent password authentication method for destructive deletion', () => {
  const now = 2_000_000_000;
  const methods = [
    { method: 'password', timestamp: now - 10 },
    { method: 'token_refresh', timestamp: now - 2 },
  ];
  assert.deepEqual(accessTokenAuthenticationMethods(token({ amr: methods })), methods);
  assert.equal(hasRecentPasswordAuthentication(token({ amr: methods }), now), true);
  assert.equal(
    hasRecentPasswordAuthentication(
      token({ amr: [{ method: 'password', timestamp: now - 301 }] }),
      now
    ),
    false
  );
  assert.equal(
    hasRecentPasswordAuthentication(
      token({ amr: [{ method: 'token_refresh', timestamp: now - 1 }], iat: now - 1 }),
      now
    ),
    false
  );
  assert.equal(hasRecentPasswordAuthentication(token({ iat: now - 1 }), now), false);
  assert.equal(hasRecentPasswordAuthentication('invalid', now), false);
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

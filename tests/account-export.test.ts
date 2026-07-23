import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_EXPORT_VERSION,
  accountExportFileName,
  buildAccountExportArchive,
} from '../src/lib/account-export';

test('builds a versioned portable export without changing supplied records', () => {
  const profiles = [{ id: 'profile-1', name: '测试人物' }];
  const archive = buildAccountExportArchive({
    user: { id: 'user-1', email: 'owner@example.com' },
    profiles,
    materials: [],
    memoryChunks: [],
    conversations: [],
    messages: [],
    uploadedFiles: [],
    consents: [],
    voiceCloningJobs: [],
    chatUsageEvents: [],
  }, '2026-07-23T12:00:00.000Z');

  assert.equal(archive.exportVersion, ACCOUNT_EXPORT_VERSION);
  assert.equal(archive.exportedAt, '2026-07-23T12:00:00.000Z');
  assert.equal(archive.profiles, profiles);
  assert.match(archive.notice.fileContent, /不包含/);
  assert.match(archive.notice.derivedVectors, /Embedding/);
});

test('uses a stable date-only JSON export filename', () => {
  assert.equal(
    accountExportFileName(new Date('2026-07-23T23:59:59.000Z')),
    'remember-account-export-2026-07-23.json'
  );
});

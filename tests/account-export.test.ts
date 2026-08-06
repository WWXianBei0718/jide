import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ACCOUNT_EXPORT_VERSION,
  accountExportFileName,
  buildAccountExportArchive,
  sanitizeExportProfiles,
  sanitizeVoiceCloningJobs,
} from '../src/lib/account-export';

test('builds a versioned portable export without changing supplied records', () => {
  const profiles = [{ id: 'profile-1', name: '测试人物' }];
  const archive = buildAccountExportArchive({
    user: { id: 'user-1', email: 'owner@example.com' },
    profiles,
    materials: [],
    materialProcessingJobs: [],
    memoryChunks: [],
    conversations: [],
    messages: [],
    messageFeedback: [{ message_id: 'message-1', verdict: 'unlike' }],
    uploadedFiles: [],
    consents: [],
    voiceCloningJobs: [],
    chatUsageEvents: [],
    externalApiUsageEvents: [{ operation: 'tts', units: 12 }],
  }, '2026-07-23T12:00:00.000Z');

  assert.equal(archive.exportVersion, ACCOUNT_EXPORT_VERSION);
  assert.equal(archive.exportedAt, '2026-07-23T12:00:00.000Z');
  assert.equal(archive.profiles, profiles);
  assert.deepEqual(archive.materialProcessingJobs, []);
  assert.deepEqual(archive.messageFeedback, [{ message_id: 'message-1', verdict: 'unlike' }]);
  assert.deepEqual(archive.externalApiUsageEvents, [{ operation: 'tts', units: 12 }]);
  assert.match(archive.notice.fileContent, /不包含/);
  assert.match(archive.notice.derivedVectors, /Embedding/);
  assert.match(archive.notice.providerResources, /供应商/);
});

test('uses a stable date-only JSON export filename', () => {
  assert.equal(
    accountExportFileName(new Date('2026-07-23T23:59:59.000Z')),
    'remember-account-export-2026-07-23.json'
  );
});

test('removes provider voice ids and internal errors from portable account data', () => {
  assert.deepEqual(
    sanitizeExportProfiles([
      { id: 'profile-1', name: '测试人物', voice_id: 'provider-voice-secret' },
      { id: 'profile-2', name: '无声音', voice_id: null },
    ]),
    [
      { id: 'profile-1', name: '测试人物', voice_ready: true },
      { id: 'profile-2', name: '无声音', voice_ready: false },
    ]
  );

  assert.deepEqual(
    sanitizeVoiceCloningJobs([
      {
        id: 'job-1',
        status: 'failed',
        voice_id: 'provider-voice-secret',
        error_message: 'raw provider diagnostics',
      },
    ]),
    [{ id: 'job-1', status: 'failed' }]
  );
});

test('account collection applies provider-field sanitizers before building the archive', () => {
  const collector = readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'account-export-data.ts'),
    'utf8'
  );

  assert.match(collector, /profiles: sanitizeExportProfiles\(profiles\)/);
  assert.match(
    collector,
    /voiceCloningJobs: sanitizeVoiceCloningJobs\(voiceCloningJobs\)/
  );
});

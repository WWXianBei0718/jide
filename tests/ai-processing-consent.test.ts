import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_DATA_PROCESSING_CONSENT_VERSION,
  AI_DATA_PROCESSING_NOTICE,
  AI_DATA_PROCESSING_NOTICE_HASH,
  isActiveVersionedConsent,
} from '../src/lib/ai-processing-consent';

test('AI processing notice discloses provider transfer, withdrawal, and simulation boundaries', () => {
  assert.match(AI_DATA_PROCESSING_NOTICE, /OpenAI/);
  assert.match(AI_DATA_PROCESSING_NOTICE, /相关的少量/);
  assert.match(AI_DATA_PROCESSING_NOTICE, /国家或地区之外/);
  assert.match(AI_DATA_PROCESSING_NOTICE, /撤回/);
  assert.match(AI_DATA_PROCESSING_NOTICE, /AI 模拟/);
  assert.equal(AI_DATA_PROCESSING_NOTICE_HASH.length, 64);
});

test('only the exact current, unwithdrawn consent version is active', () => {
  const current = {
    consented: true,
    policy_version: AI_DATA_PROCESSING_CONSENT_VERSION,
    notice_hash: AI_DATA_PROCESSING_NOTICE_HASH,
    withdrawn_at: null,
  };

  assert.equal(
    isActiveVersionedConsent(
      current,
      AI_DATA_PROCESSING_CONSENT_VERSION,
      AI_DATA_PROCESSING_NOTICE_HASH
    ),
    true
  );
  assert.equal(
    isActiveVersionedConsent(
      { ...current, policy_version: 'old-version' },
      AI_DATA_PROCESSING_CONSENT_VERSION,
      AI_DATA_PROCESSING_NOTICE_HASH
    ),
    false
  );
  assert.equal(
    isActiveVersionedConsent(
      { ...current, withdrawn_at: '2026-07-24T00:00:00.000Z' },
      AI_DATA_PROCESSING_CONSENT_VERSION,
      AI_DATA_PROCESSING_NOTICE_HASH
    ),
    false
  );
});

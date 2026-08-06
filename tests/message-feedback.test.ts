import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  MAX_MESSAGE_FEEDBACK_NOTE_CHARACTERS,
  validateMessageFeedback,
} from '../src/lib/message-feedback';

test('accepts bounded structured feedback and normalizes duplicate reasons', () => {
  assert.deepEqual(validateMessageFeedback({
    verdict: 'unlike',
    reasons: ['tone_wrong', 'tone_wrong', 'too_generic'],
    note: '  称呼和她平时不一样。  ',
  }), {
    verdict: 'unlike',
    reasons: ['tone_wrong', 'too_generic'],
    note: '称呼和她平时不一样。',
  });

  assert.deepEqual(validateMessageFeedback({
    verdict: 'like',
    reasons: [],
    note: '',
  }), {
    verdict: 'like',
    reasons: [],
    note: null,
  });
});

test('rejects unknown reasons, reasons on positive feedback, and oversized notes', () => {
  assert.equal(validateMessageFeedback({
    verdict: 'unlike',
    reasons: ['rewrite_persona'],
    note: '',
  }), null);
  assert.equal(validateMessageFeedback({
    verdict: 'like',
    reasons: ['tone_wrong'],
    note: '',
  }), null);
  assert.equal(validateMessageFeedback({
    verdict: 'unlike',
    reasons: [],
    note: 'x'.repeat(MAX_MESSAGE_FEEDBACK_NOTE_CHARACTERS + 1),
  }), null);
});

test('feedback API verifies ownership and only accepts assistant messages', () => {
  const api = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'message-feedback.ts'),
    'utf8'
  );

  assert.match(api, /verifyProfileOwnership/);
  assert.match(api, /\.eq\('memory_profile_id', profileId\)/);
  assert.match(api, /\.eq\('user_id', user\.id\)/);
  assert.match(api, /message\.role !== 'assistant'/);
  assert.match(api, /select\('message_id, verdict, reasons, note, updated_at'\)/);
  assert.doesNotMatch(api, /select\('\*'\)|select\(\s*\)/);
});

test('feedback stays separate from source materials and semantic memory', () => {
  const api = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'message-feedback.ts'),
    'utf8'
  );

  assert.doesNotMatch(api, /memory_materials|memory_chunks|embedding|persona/i);
});

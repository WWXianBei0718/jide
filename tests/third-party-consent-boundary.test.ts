import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (...segments: string[]) => readFileSync(
  path.join(process.cwd(), ...segments),
  'utf8'
);

test('chat refuses configured AI-provider processing before current consent and before quota or message writes', () => {
  const chat = read('src', 'pages', 'api', 'chat.ts');
  const consentCheck = chat.indexOf('if (!await hasActiveAiDataProcessingConsent');
  const quota = chat.indexOf('consumeChatQuota(user.client)');
  const messageInsert = chat.indexOf(".from('messages')");
  const providerCall = chat.indexOf('postOpenAiJson<{');

  assert.ok(consentCheck >= 0);
  assert.ok(consentCheck < quota);
  assert.ok(consentCheck < messageInsert);
  assert.ok(consentCheck < providerCall);
  assert.match(chat, /code: 'ai_processing_consent_required'/);
});

test('semantic indexing and backfill require current AI processing consent', () => {
  const materials = read('src', 'pages', 'api', 'materials.ts');
  const backfill = read('scripts', 'run-memory-backfill.ts');

  assert.match(materials, /hasActiveAiDataProcessingConsent/);
  assert.match(materials, /indexing_status: 'blocked'/);
  assert.match(materials, /ai_processing_consent_required/);
  assert.match(backfill, /hasActiveAiDataProcessingConsent/);
  assert.match(backfill, /has no active AI data processing consent/);
});

test('TTS refuses supplier transfer without a current voice-processing consent', () => {
  const synthesize = read('src', 'pages', 'api', 'voice-synthesize.ts');
  const consentCheck = synthesize.indexOf('if (!await hasActiveVoiceProcessingConsent');
  const quota = synthesize.indexOf('const quota = await consumeExternalApiQuota');
  const providerCall = synthesize.indexOf('api.elevenlabs.io/v1/text-to-speech');

  assert.ok(consentCheck >= 0);
  assert.ok(consentCheck < quota);
  assert.ok(consentCheck < providerCall);
  assert.match(synthesize, /voice_processing_consent_required/);
});

test('consent API records versioned grants and withdrawals through the trusted server boundary', () => {
  const api = read('src', 'pages', 'api', 'ai-consent.ts');
  const page = read('src', 'pages', 'profile', '[id]', 'chat.tsx');

  assert.match(api, /verifyProfileOwnership/);
  assert.match(api, /adminSupabase\.from\('consents'\)\.insert/);
  assert.match(api, /AI_DATA_PROCESSING_NOTICE_HASH/);
  assert.match(api, /providers: currentAiProviders\(\)/);
  assert.doesNotMatch(api, /provider: 'openai'/);
  assert.match(api, /consented: false/);
  assert.match(api, /withdrawn_at: withdrawnAt/);
  assert.match(page, /同意并启用 AI 对话/);
  assert.match(page, /撤回授权/);
  assert.match(page, /AI 模拟而非真实人物本人/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readPage = (...segments: string[]) => readFileSync(
  path.join(process.cwd(), 'src', 'pages', ...segments),
  'utf8'
);

test('authenticated profile pages wait for auth initialization before redirecting', () => {
  const detail = readPage('profile', '[id].tsx');
  const chat = readPage('profile', '[id]', 'chat.tsx');

  for (const source of [detail, chat]) {
    assert.match(source, /if \(loading \|\| !id\) return;/);
    assert.match(source, /if \(!user\) \{\s*router\.push\('\/'\);/);
  }
});

test('dashboard profile cards use button semantics', () => {
  const dashboard = readPage('dashboard.tsx');

  assert.match(dashboard, /<button\s+type="button"\s+key=\{profile\.id\}/);
  assert.doesNotMatch(dashboard, /<div\s+key=\{profile\.id\}\s+onClick=/);
});

test('account export is authenticated and honestly labels excluded file bodies', () => {
  const dashboard = readPage('dashboard.tsx');
  const exportApi = readPage('api', 'account-export.ts');

  assert.match(exportApi, /const user = await authenticate\(req, res\)/);
  assert.match(exportApi, /Cache-Control', 'no-store'/);
  assert.match(dashboard, /导出结构化数据/);
  assert.match(dashboard, /导出完整压缩包/);
});

test('account deletion requires authentication, recent verification, and explicit confirmation', () => {
  const dashboard = readPage('dashboard.tsx');
  const accountApi = readPage('api', 'account.ts');

  assert.match(accountApi, /const user = await authenticate\(req, res\)/);
  assert.match(accountApi, /hasRecentPasswordAuthentication\(user\.accessToken\)/);
  assert.match(accountApi, /from\('external_api_usage_events'\)\.delete\(\)\.eq\('user_id', user\.id\)/);
  assert.match(accountApi, /confirmation !== ACCOUNT_DELETE_CONFIRMATION/);
  assert.match(dashboard, /supabase\.auth\.signInWithPassword/);
  assert.match(dashboard, /永久删除账号/);
});

test('profile deletion requires reauthentication and cleans external resources before database deletion', () => {
  const detail = readPage('profile', '[id].tsx');
  const profileApi = readPage('api', 'profile.ts');

  assert.match(detail, /supabase\.auth\.signInWithPassword/);
  assert.match(detail, /永久删除这个人物/);
  assert.match(profileApi, /deleteElevenLabsVoices/);
  assert.match(profileApi, /deleteStorageTargets/);
  assert.match(profileApi, /confirmation !== profile\.name/);
});

test('materials page hides controls when the profile is unavailable', () => {
  const materials = readPage('profile', '[id]', 'materials.tsx');

  assert.match(materials, /if \(loading \|\| !user \|\| isProfileLoading\)/);
  assert.match(materials, /if \(!profile\) \{/);
  assert.match(materials, /记忆体不存在或你无权访问/);
});

test('chat page hides the composer when the profile is unavailable', () => {
  const chat = readPage('profile', '[id]', 'chat.tsx');

  assert.match(chat, /if \(loading \|\| !user \|\| isProfileLoading\)/);
  assert.match(chat, /if \(!profile\) \{/);
  assert.match(chat, /记忆体不存在或你无权访问/);
});

test('chat API saves provider replies through the trusted server boundary', () => {
  const chatApi = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'chat.ts'),
    'utf8'
  );

  assert.match(chatApi, /const isOwner = await verifyProfileOwnership/);
  assert.match(
    chatApi,
    /const \{ data: assistantMessage, error: assistantMessageError \} = await adminSupabase/
  );
  assert.match(chatApi, /role: 'assistant'/);
});

test('billable voice endpoints enforce persistent quota and safe provider boundaries', () => {
  const cloneApi = readPage('api', 'voice-clone.ts');
  const synthesizeApi = readPage('api', 'voice-synthesize.ts');

  for (const source of [cloneApi, synthesizeApi]) {
    assert.match(source, /consumeExternalApiQuota/);
    assert.match(source, /Retry-After/);
    assert.match(source, /status\(429\)/);
    assert.match(source, /status\(503\)/);
  }

  assert.match(cloneApi, /if \(profile\.voice_id\)/);
  assert.match(cloneApi, /deleteElevenLabsVoices/);
  assert.doesNotMatch(cloneApi, /data\.detail/);
  assert.match(synthesizeApi, /AbortSignal\.timeout\(30_000\)/);
  assert.match(synthesizeApi, /audioBuffer\.byteLength > MAX_AUDIO_BYTES/);
  assert.match(synthesizeApi, /Cache-Control', 'private, no-store'/);
  assert.doesNotMatch(synthesizeApi, /errorData\.detail/);
});

test('signed upload requests reserve persistent byte quota and clean expired grants', () => {
  const uploadRequestApi = readPage('api', 'uploads', 'request.ts');

  assert.match(uploadRequestApi, /consumeExternalApiQuota/);
  assert.match(uploadRequestApi, /'upload',\s*upload\.fileSize/);
  assert.match(uploadRequestApi, /cleanupExpiredUploadsForUser\(user\.id\)/);
  assert.match(uploadRequestApi, /Retry-After/);
  assert.match(uploadRequestApi, /status\(429\)/);
  assert.match(uploadRequestApi, /status\(503\)/);
});

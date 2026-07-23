import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = readFileSync(
  path.join(process.cwd(), 'src', 'pages', 'api', 'voices.ts'),
  'utf8'
);
const profileApi = readFileSync(
  path.join(process.cwd(), 'src', 'pages', 'api', 'profile.ts'),
  'utf8'
);
const voiceCloneApi = readFileSync(
  path.join(process.cwd(), 'src', 'pages', 'api', 'voice-clone.ts'),
  'utf8'
);

test('voice status stays user-scoped without listing the provider workspace', () => {
  assert.match(source, /\.eq\('user_id', user\.id\)/);
  assert.match(source, /\.not\('voice_id', 'is', null\)/);
  assert.doesNotMatch(source, /api\.elevenlabs\.io/);
  assert.doesNotMatch(source, /ELEVENLABS_API_KEY/);
});

test('voice status response does not expose biometric provider resource ids', () => {
  assert.match(source, /profileId: profile\.id/);
  assert.match(source, /profileName: profile\.name/);
  assert.match(source, /ready: true/);
  assert.doesNotMatch(source, /voiceId:|id: v\.voice_id|voices: filteredVoices/);
  assert.match(source, /Cache-Control', 'private, no-store'/);
});

test('profile and clone responses expose readiness instead of provider resource ids', () => {
  assert.match(profileApi, /const voiceId = safeProfile\.voice_id/);
  assert.match(profileApi, /delete safeProfile\.user_id/);
  assert.match(profileApi, /delete safeProfile\.voice_id/);
  assert.match(profileApi, /voice_ready: typeof voiceId === 'string'/);
  assert.match(profileApi, /return res\.status\(200\)\.json\(publicProfile\(profile\)\)/);
  assert.match(voiceCloneApi, /return res\.status\(200\)\.json\(\{\s*voice_ready: true,/);

  const browserFiles = [
    'src/pages/chat.tsx',
    'src/pages/train-voice.tsx',
    'src/pages/profile/[id].tsx',
    'src/pages/profile/[id]/chat.tsx',
  ];
  for (const file of browserFiles) {
    assert.doesNotMatch(readFileSync(path.join(process.cwd(), file), 'utf8'), /voice_id/);
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = readFileSync(
  path.join(process.cwd(), 'src', 'pages', 'api', 'voices.ts'),
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

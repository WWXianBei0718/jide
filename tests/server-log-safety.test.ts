import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readApi = (name: string) => readFileSync(
  path.join(process.cwd(), 'src', 'pages', 'api', name),
  'utf8'
);

test('AI and voice APIs do not log raw provider responses or exception objects', () => {
  const chat = readApi('chat.ts');
  const voiceClone = readApi('voice-clone.ts');
  const voiceSynthesize = readApi('voice-synthesize.ts');

  assert.doesNotMatch(chat, /console\.error\('OpenAI API error:', data\)/);
  assert.doesNotMatch(chat, /console\.error\('Error calling OpenAI:', error\)/);
  assert.doesNotMatch(chat, /error:\s*data\.error\?\.message/);
  assert.doesNotMatch(voiceClone, /console\.error\('Voice clone error:', error\)/);
  assert.doesNotMatch(voiceSynthesize, /console\.error\('Voice synthesis error:', error\)/);
});

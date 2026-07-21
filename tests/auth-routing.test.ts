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

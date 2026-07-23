import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('public API responses do not expose raw database error messages', () => {
  const profileApi = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'profile.ts'),
    'utf8'
  );

  assert.doesNotMatch(profileApi, /json\(\{\s*error:\s*error\.message\s*\}\)/);
  assert.match(profileApi, /error: 'Failed to fetch profiles'/);
  assert.match(profileApi, /error: 'Failed to create profile'/);
  assert.match(profileApi, /error: 'Failed to update profile'/);
});

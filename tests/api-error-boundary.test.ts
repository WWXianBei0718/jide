import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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

test('API database queries use explicit column allowlists', () => {
  const apiRoot = path.join(process.cwd(), 'src', 'pages', 'api');
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith('.ts')) files.push(target);
    }
  };
  visit(apiRoot);

  const violations = files
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /\.select\(\s*\)/.test(source) || /\.select\(\s*['"]\*['"]\s*\)/.test(source);
    })
    .map((file) => path.relative(process.cwd(), file));

  assert.deepEqual(violations, []);
});

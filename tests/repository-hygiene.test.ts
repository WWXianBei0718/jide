import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
}

test('local secrets and generated environment files are not tracked', () => {
  const files = trackedFiles();
  assert.equal(files.includes('.env.local'), false);
  assert.equal(files.some((file) => /^\.env\..+/.test(file) && file !== '.env.example'), false);
  assert.match(readFileSync('.gitignore', 'utf8'), /^\.env\.local$/m);
});

test('tracked text files do not contain recognizable live service secrets', () => {
  const suspiciousSecret = /(?:sk-proj-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|sk_[0-9a-f]{32,})/;
  const textExtensions = new Set([
    '.js', '.json', '.md', '.sql', '.ts', '.tsx', '.txt', '.yml', '.yaml',
  ]);
  const violations: string[] = [];

  for (const file of trackedFiles()) {
    if (!textExtensions.has(path.extname(file))) continue;
    const content = readFileSync(file, 'utf8');
    if (suspiciousSecret.test(content)) violations.push(file);
  }

  assert.deepEqual(violations, []);
});

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), 'utf8');
}

test('current-state and deployment docs list every versioned migration', () => {
  const migrations = readdirSync(path.join(root, 'supabase', 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const currentState = read('CURRENT_STATE.md');
  const deploymentGuide = read('supabase/README.md');

  for (const migration of migrations) {
    assert.match(currentState, new RegExp(migration.replaceAll('.', '\\.')));
    assert.match(deploymentGuide, new RegExp(migration.replaceAll('.', '\\.')));
  }
});

test('active security documentation does not reintroduce superseded architecture claims', () => {
  const security = read('SECURITY_ARCHITECTURE.md');

  assert.doesNotMatch(security, /src\/lib\/server-supabase\.ts/);
  assert.doesNotMatch(security, /声音以 base64 JSON 直接送第三方/);
  assert.doesNotMatch(security, /RLS 仅存在于 SQL 文件/);
  assert.doesNotMatch(security, /浏览器直接访问核心表/);
});

test('historical audit documents identify themselves as non-current snapshots', () => {
  const historicalDocuments = [
    'CODE_REVIEW_REPORT.md',
    'EVALUATION_GUIDE.md',
    'PROJECT_ASSESSMENT.md',
    'PROJECT_FILE_INDEX.md',
    'PROJECT_REVIEW_PACKAGE.md',
  ];

  for (const file of historicalDocuments) {
    const introduction = read(file).slice(0, 500);
    assert.match(introduction, /历史/);
    assert.match(introduction, /CURRENT_STATE\.md/);
  }
});

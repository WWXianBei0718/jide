import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

test('service-role client imports stay inside the reviewed server allowlist', () => {
  const sourceRoot = path.join(process.cwd(), 'src');
  const importers = sourceFiles(sourceRoot)
    .filter((file) => file !== path.join(sourceRoot, 'lib', 'admin-supabase.ts'))
    .filter((file) => /(?:adminSupabase|admin-supabase)/.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(process.cwd(), file))
    .sort();

  assert.deepEqual(importers, [
    'src/lib/account-export-data.ts',
    'src/lib/api-observability.ts',
    'src/lib/expired-upload-cleanup.ts',
    'src/lib/memory-indexing.ts',
    'src/lib/security-audit-retention.ts',
    'src/pages/api/account-export-archive.ts',
    'src/pages/api/account.ts',
    'src/pages/api/ai-consent.ts',
    'src/pages/api/chat.ts',
    'src/pages/api/health.ts',
    'src/pages/api/materials.ts',
    'src/pages/api/profile.ts',
    'src/pages/api/uploads/complete.ts',
    'src/pages/api/uploads/download.ts',
    'src/pages/api/uploads/request.ts',
    'src/pages/api/voice-clone.ts',
  ]);
  assert.ok(importers.every((file) => file.startsWith('src/lib/') || file.startsWith('src/pages/api/')));
});

test('browser-delivered source cannot import the service-role client', () => {
  const browserFiles = [
    ...sourceFiles(path.join(process.cwd(), 'src', 'pages'))
      .filter((file) => !file.includes(`${path.sep}pages${path.sep}api${path.sep}`)),
    ...sourceFiles(path.join(process.cwd(), 'src', 'hooks')),
  ];

  const violations = browserFiles
    .filter((file) => /(?:adminSupabase|admin-supabase)/.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(process.cwd(), file));

  assert.deepEqual(violations, []);
});

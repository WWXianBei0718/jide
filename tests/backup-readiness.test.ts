import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  inspectMigrationIntegrity,
  parseMigrationManifest,
} from '../src/lib/backup-readiness';

test('tracked migration manifest matches every migration checksum and execution order', () => {
  const result = inspectMigrationIntegrity(
    path.join(process.cwd(), 'supabase', 'migrations')
  );

  assert.deepEqual(result, {
    ready: true,
    migrationCount: 15,
    errors: [],
  });
});

test('migration integrity check rejects modified backup inputs', () => {
  const directory = path.join(
    tmpdir(),
    `remember-backup-readiness-${process.pid}-${Date.now()}`
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, '202607230000_example.sql'), 'select 1;\n');
  writeFileSync(
    path.join(directory, 'MANIFEST.sha256'),
    `${'0'.repeat(64)}  202607230000_example.sql\n`
  );

  const result = inspectMigrationIntegrity(directory);
  assert.equal(result.ready, false);
  assert.deepEqual(result.errors, [
    '迁移文件校验失败：202607230000_example.sql',
  ]);
});

test('migration manifest contains only checksums and migration filenames', () => {
  const manifest = parseMigrationManifest(
    readFileSync(
      path.join(process.cwd(), 'supabase', 'migrations', 'MANIFEST.sha256'),
      'utf8'
    )
  );

  assert.equal(manifest.length, 15);
  assert.ok(manifest.every(({ checksum }) => checksum.length === 64));
});

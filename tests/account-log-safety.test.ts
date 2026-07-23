import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) => readFileSync(
  path.join(process.cwd(), 'src', relativePath),
  'utf8'
);

test('account export and deletion use request ids without logging exception messages', () => {
  for (const filename of [
    'pages/api/account-export.ts',
    'pages/api/account-export-archive.ts',
    'pages/api/account.ts',
  ]) {
    const source = readSource(filename);
    assert.match(source, /beginApiRequest\(req, res,/);
    assert.match(source, /logApiError\(/);
    assert.doesNotMatch(source, /console\.(error|warn)/);
    assert.doesNotMatch(
      source,
      /logApiError\([^)]*error instanceof Error \? error\.message/s
    );
  }
});

test('memory indexing logs only a stable event and error type', () => {
  const source = readSource('lib/memory-indexing.ts');

  assert.match(source, /event: 'memory_indexing\.failed'/);
  assert.match(source, /error instanceof Error \? error\.name/);
  assert.doesNotMatch(source, /error instanceof Error \? error\.message/);
});

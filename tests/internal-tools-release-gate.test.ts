import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readPage = (filename: string) => readFileSync(
  path.join(process.cwd(), 'src', 'pages', filename),
  'utf8'
);

test('internal browser test tools return 404 in production', () => {
  for (const filename of ['self-test.tsx', 'test-chat.tsx', 'test-eval.tsx']) {
    const source = readPage(filename);

    assert.match(source, /export const getServerSideProps/);
    assert.match(source, /process\.env\.NODE_ENV === 'production'/);
    assert.match(source, /return \{ notFound: true \}/);
  }
});

test('project assessment metadata is unavailable and uncached in production', () => {
  const source = readPage(path.join('api', 'assessment.ts'));

  assert.match(source, /Cache-Control', 'no-store'/);
  assert.match(source, /process\.env\.NODE_ENV === 'production'/);
  assert.match(source, /status\(404\)\.json\(\{ error: 'Not found' \}\)/);
});

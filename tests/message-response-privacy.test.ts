import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const publicMessageFields = 'id, role, content, created_at';

test('message APIs retain audit metadata in the database but return a minimal browser shape', () => {
  const chatApi = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'chat.ts'),
    'utf8'
  );
  const messagesApi = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'messages.ts'),
    'utf8'
  );

  assert.match(chatApi, /retrieved_context: JSON\.stringify/);
  assert.equal(
    [...chatApi.matchAll(/\.select\('id, role, content, created_at'\)/g)].length,
    2
  );
  assert.match(messagesApi, new RegExp(`\\.select\\('${publicMessageFields}'\\)`));
  assert.doesNotMatch(messagesApi, /\.select\('\*'\)/);
});

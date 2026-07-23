import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('private files stream through the authenticated API without exposing signed URLs', () => {
  const downloadApi = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'uploads', 'download.ts'),
    'utf8'
  );
  const materialsPage = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'profile', '[id]', 'materials.tsx'),
    'utf8'
  );

  assert.match(downloadApi, /const user = await authenticate\(req, res\)/);
  assert.match(downloadApi, /\.eq\('user_id', user\.id\)/);
  assert.match(downloadApi, /\.eq\('status', 'ready'\)/);
  assert.match(downloadApi, /\.download\(file\.file_path\)/);
  assert.match(downloadApi, /fileBlob\.size !== file\.file_size/);
  assert.match(downloadApi, /'Content-Disposition'/);
  assert.match(downloadApi, /res\.status\(200\)\.send\(buffer\)/);
  assert.doesNotMatch(downloadApi, /createSignedUrl|signedUrl|expiresIn/);

  assert.match(materialsPage, /URL\.createObjectURL\(await response\.blob\(\)\)/);
  assert.match(materialsPage, /URL\.revokeObjectURL/);
  assert.doesNotMatch(materialsPage, /window\.location\.assign\(data\.url\)/);
});

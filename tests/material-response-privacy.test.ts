import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('material APIs return display fields without internal ownership or storage columns', () => {
  const materialsApi = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'materials.ts'),
    'utf8'
  );
  const uploadCompleteApi = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'uploads', 'complete.ts'),
    'utf8'
  );

  assert.match(
    materialsApi,
    /\.select\('id, type, title, content, metadata, created_at, uploaded_files\(id, file_name, file_type, file_size, status\), material_processing_jobs\(job_type, status, attempt_count, error_code, processor_version, queued_at, started_at, completed_at, updated_at\)'\)/
  );
  assert.doesNotMatch(materialsApi, /\.select\('\*, uploaded_files/);
  assert.doesNotMatch(materialsApi, /material_processing_jobs\(id,/);
  assert.doesNotMatch(uploadCompleteApi, /\.select\('\*'\)/);
  assert.match(
    uploadCompleteApi,
    /json\(\{ status: 'ready', materialId: material\.id, uploadId: upload\.id \}\)/
  );
  assert.match(
    uploadCompleteApi,
    /json\(\{ status: 'ready', materialId, uploadId: upload\.id \}\)/
  );
});

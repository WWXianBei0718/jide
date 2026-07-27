import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const worker = readFileSync(
  path.join(process.cwd(), 'scripts', 'run-local-pdf-processing.ts'),
  'utf8'
);

test('local PDF worker is dry-run by default and only claims document jobs', () => {
  assert.match(worker, /process\.argv\.includes\('--execute'\)/);
  assert.match(worker, /databaseWrites: false/);
  assert.match(worker, /p_job_types: \['document_text'\]/);
  assert.match(worker, /file\.file_type !== 'application\/pdf'/);
  assert.doesNotMatch(worker, /openai|elevenlabs|createEmbeddings|indexMemoryMaterial/i);
});

test('local PDF worker persists only bounded extracted text and safe error codes', () => {
  assert.match(worker, /prepareExtractionCompletion/);
  assert.match(worker, /complete_material_processing_job/);
  assert.match(worker, /normalizeProcessingErrorCode/);
  assert.doesNotMatch(worker, /console\.(log|error)\([^)]*(file_path|extracted\.text|error\.message)/);
});

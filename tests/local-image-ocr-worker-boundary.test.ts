import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const worker = readFileSync(
  path.join(process.cwd(), 'scripts', 'run-local-image-ocr.ts'),
  'utf8'
);

test('local OCR worker is inert by default and only claims image OCR jobs', () => {
  assert.match(worker, /process\.argv\.includes\('--execute'\)/);
  assert.match(worker, /databaseReads: false/);
  assert.match(worker, /databaseWrites: false/);
  assert.match(worker, /storageReads: false/);
  assert.match(worker, /p_job_types: \['image_ocr'\]/);
  assert.doesNotMatch(worker, /openai|elevenlabs|createEmbeddings|indexMemoryMaterial/i);
});

test('local OCR worker verifies source bytes and writes bounded provenance', () => {
  assert.match(worker, /validateFileSignature/);
  assert.match(worker, /prepareExtractionCompletion/);
  assert.match(worker, /complete_material_processing_job/);
  assert.match(worker, /normalizeProcessingErrorCode/);
  assert.doesNotMatch(worker, /console\.(log|error)\([^)]*(file_path|extracted\.text|error\.message)/);
});

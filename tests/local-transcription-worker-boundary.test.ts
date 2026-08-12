import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const worker = readFileSync(
  path.join(process.cwd(), 'scripts', 'run-local-transcription.ts'),
  'utf8'
);

test('local transcription worker is inert by default and claims only audio/video jobs', () => {
  assert.match(worker, /process\.argv\.includes\('--execute'\)/);
  assert.match(worker, /databaseReads: false/);
  assert.match(worker, /databaseWrites: false/);
  assert.match(worker, /storageReads: false/);
  assert.match(
    worker,
    /p_job_types: \['audio_transcription', 'video_transcription'\]/
  );
  assert.doesNotMatch(worker, /openai|elevenlabs|createEmbeddings|indexMemoryMaterial/i);
});

test('local transcription worker binds job type to media type and verifies source bytes', () => {
  assert.match(worker, /sourceMatchesJob/);
  assert.match(worker, /validateFileSignature/);
  assert.match(worker, /prepareExtractionCompletion/);
  assert.match(worker, /complete_material_processing_job/);
  assert.match(worker, /normalizeProcessingErrorCode/);
  assert.doesNotMatch(
    worker,
    /console\.(log|error)\([^)]*(file_path|extracted\.text|error\.message)/
  );
});

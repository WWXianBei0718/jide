import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync('scripts/run-semantic-retrieval-eval.ts', 'utf8');

test('semantic retrieval evaluation is explicitly executed and uses only the fictional dataset', () => {
  assert.match(script, /process\.argv\.includes\('--execute'\)/);
  assert.match(script, /fictionalRetrievalV2/);
  assert.match(script, /fictional: true/);
  assert.doesNotMatch(script, /adminSupabase|memory_profiles|memory_materials/);
});

test('semantic retrieval evaluation compares lexical, vector, and deployed hybrid rankings', () => {
  assert.match(script, /const lexical = scoreRetrieval/);
  assert.match(script, /const vector = scoreRetrieval/);
  assert.match(script, /const hybrid = scoreRetrieval/);
  assert.match(script, /mergeRetrievedMaterialChunks/);
  assert.match(script, /deployed: true/);
});

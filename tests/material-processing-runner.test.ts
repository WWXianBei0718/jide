import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  normalizeProcessingErrorCode,
  prepareExtractionCompletion,
  retryDelaySeconds,
  validateProcessorVersion,
  validateWorkerId,
} from '../src/lib/material-processing-runner';

test('accepts bounded worker and processor identifiers', () => {
  assert.equal(validateWorkerId('material-worker:dev-01'), true);
  assert.equal(validateWorkerId('../unsafe worker'), false);
  assert.equal(validateProcessorVersion('pdf-local-v1.2'), true);
  assert.equal(validateProcessorVersion('provider/version'), false);
});

test('normalizes provider failures without retaining raw error text', () => {
  assert.equal(normalizeProcessingErrorCode('  Provider Timeout (504)  '), 'provider_timeout_504');
  assert.equal(normalizeProcessingErrorCode('***'), 'processing_failed');
  assert.ok(normalizeProcessingErrorCode('x'.repeat(200)).length <= 80);
});

test('uses bounded exponential retry delays', () => {
  assert.equal(retryDelaySeconds(1), 60);
  assert.equal(retryDelaySeconds(2), 120);
  assert.equal(retryDelaySeconds(20), 86_400);
  assert.equal(retryDelaySeconds(Number.POSITIVE_INFINITY), 86_400);
});

test('trims extracted text and creates stable provenance hashes', () => {
  const first = prepareExtractionCompletion({
    text: '  这是一段提取后的文字。  ',
    processorVersion: 'local-test-v1',
  });
  const second = prepareExtractionCompletion({
    text: '这是一段提取后的文字。',
    processorVersion: 'local-test-v1',
  });

  assert.equal(first.text, '这是一段提取后的文字。');
  assert.equal(first.contentSha256, second.contentSha256);
  assert.match(first.contentSha256, /^[a-f0-9]{64}$/);
});

test('rejects empty, oversized, and unversioned extraction output', () => {
  assert.throws(() => prepareExtractionCompletion({
    text: '   ',
    processorVersion: 'local-test-v1',
  }));
  assert.throws(() => prepareExtractionCompletion({
    text: 'x'.repeat(MAX_EXTRACTED_TEXT_CHARACTERS + 1),
    processorVersion: 'local-test-v1',
  }));
  assert.throws(() => prepareExtractionCompletion({
    text: 'valid text',
    processorVersion: 'bad version',
  }));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractTextWithLocalOcr,
  LocalOcrError,
  MAX_OCR_IMAGE_BYTES,
  validatePrivateOcrEndpoint,
} from '../src/lib/local-ocr';

const validImage = new Uint8Array(12).fill(1);

test('allows only private OCR service endpoints without embedded credentials', () => {
  assert.equal(validatePrivateOcrEndpoint('http://127.0.0.1:8868/ocr')?.hostname, '127.0.0.1');
  assert.equal(validatePrivateOcrEndpoint('http://paddleocr:8868/ocr')?.hostname, 'paddleocr');
  assert.equal(validatePrivateOcrEndpoint('https://192.168.1.10/ocr')?.hostname, '192.168.1.10');
  assert.equal(validatePrivateOcrEndpoint('https://example.com/ocr'), null);
  assert.equal(validatePrivateOcrEndpoint('http://user:pass@127.0.0.1/ocr'), null);
});

test('normalizes bounded OCR text from the private service contract', async () => {
  const result = await extractTextWithLocalOcr(validImage, {
    endpoint: 'http://127.0.0.1:8868/ocr',
    mimeType: 'image/png',
    processorVersion: 'paddleocr-3.7-ppocrv6-v1',
    fetchImpl: async () => new Response(JSON.stringify({
      text: '  妈妈说   别着急\r\n\r\n\r\n慢慢来  ',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  assert.equal(result.text, '妈妈说 别着急\n\n慢慢来');
  assert.equal(result.processorVersion, 'paddleocr-3.7-ppocrv6-v1');
});

test('rejects unsupported, oversized, empty, and malformed OCR results', async () => {
  await assert.rejects(
    () => extractTextWithLocalOcr(validImage, {
      endpoint: 'http://127.0.0.1:8868/ocr',
      mimeType: 'image/gif',
      processorVersion: 'local-v1',
    }),
    (error: unknown) => error instanceof LocalOcrError && error.code === 'invalid_ocr_input'
  );

  await assert.rejects(
    () => extractTextWithLocalOcr(new Uint8Array(MAX_OCR_IMAGE_BYTES + 1), {
      endpoint: 'http://127.0.0.1:8868/ocr',
      mimeType: 'image/jpeg',
      processorVersion: 'local-v1',
    }),
    (error: unknown) => error instanceof LocalOcrError && error.code === 'invalid_ocr_input'
  );

  await assert.rejects(
    () => extractTextWithLocalOcr(validImage, {
      endpoint: 'http://127.0.0.1:8868/ocr',
      mimeType: 'image/webp',
      processorVersion: 'local-v1',
      fetchImpl: async () => new Response(JSON.stringify({ text: '   ' })),
    }),
    (error: unknown) => error instanceof LocalOcrError && error.code === 'empty_ocr_text'
  );

  await assert.rejects(
    () => extractTextWithLocalOcr(validImage, {
      endpoint: 'http://127.0.0.1:8868/ocr',
      mimeType: 'image/png',
      processorVersion: 'local-v1',
      fetchImpl: async () => new Response('not-json'),
    }),
    (error: unknown) => error instanceof LocalOcrError && error.code === 'invalid_ocr_response'
  );
});

test('maps private service failures to stable retry-safe codes', async () => {
  await assert.rejects(
    () => extractTextWithLocalOcr(validImage, {
      endpoint: 'http://127.0.0.1:8868/ocr',
      mimeType: 'image/png',
      processorVersion: 'local-v1',
      fetchImpl: async () => { throw new Error('private service detail'); },
    }),
    (error: unknown) => error instanceof LocalOcrError && error.code === 'ocr_service_unavailable'
  );
});

test('stops reading chunked OCR responses after the response limit', async () => {
  const oversized = new Uint8Array(MAX_OCR_IMAGE_BYTES);
  await assert.rejects(
    () => extractTextWithLocalOcr(validImage, {
      endpoint: 'http://127.0.0.1:8868/ocr',
      mimeType: 'image/png',
      processorVersion: 'local-v1',
      fetchImpl: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(oversized);
          controller.close();
        },
      })),
    }),
    (error: unknown) => error instanceof LocalOcrError && error.code === 'ocr_output_too_large'
  );
});

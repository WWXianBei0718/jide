import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LocalTranscriptionError,
  MAX_TRANSCRIPTION_MEDIA_BYTES,
  MAX_TRANSCRIPTION_RESPONSE_BYTES,
  transcribeWithPrivateService,
  validatePrivateTranscriptionEndpoint,
} from '../src/lib/local-transcription';

const validMedia = new Uint8Array(12).fill(1);

test('allows only private transcription endpoints without embedded credentials', () => {
  assert.equal(
    validatePrivateTranscriptionEndpoint('http://127.0.0.1:9000/transcribe')?.hostname,
    '127.0.0.1'
  );
  assert.equal(
    validatePrivateTranscriptionEndpoint('http://whisper:9000/transcribe')?.hostname,
    'whisper'
  );
  assert.equal(validatePrivateTranscriptionEndpoint('https://example.com/transcribe'), null);
  assert.equal(
    validatePrivateTranscriptionEndpoint('http://user:pass@127.0.0.1/transcribe'),
    null
  );
});

test('normalizes bounded transcript text and sends explicit media metadata', async () => {
  let receivedHeaders: Headers | null = null;
  const result = await transcribeWithPrivateService(validMedia, {
    endpoint: 'http://whisper:9000/transcribe',
    mimeType: 'audio/mpeg',
    processorVersion: 'faster-whisper-large-v3-v1',
    fetchImpl: async (_input, init) => {
      receivedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        text: '  妈妈说   别着急\r\n\r\n\r\n慢慢来  ',
      }));
    },
  });

  assert.equal(result.text, '妈妈说 别着急\n\n慢慢来');
  assert.equal(result.processorVersion, 'faster-whisper-large-v3-v1');
  const headers = receivedHeaders as Headers | null;
  assert.ok(headers);
  assert.equal(headers.get('content-type'), 'audio/mpeg');
  assert.equal(headers.get('x-media-kind'), 'audio');
  assert.equal(headers.get('x-transcription-language'), 'zh');
});

test('rejects unsupported, oversized, empty, and malformed transcription results', async () => {
  await assert.rejects(
    () => transcribeWithPrivateService(validMedia, {
      endpoint: 'http://whisper:9000/transcribe',
      mimeType: 'application/octet-stream',
      processorVersion: 'local-v1',
    }),
    (error: unknown) => error instanceof LocalTranscriptionError
      && error.code === 'invalid_transcription_input'
  );

  await assert.rejects(
    () => transcribeWithPrivateService(new Uint8Array(MAX_TRANSCRIPTION_MEDIA_BYTES + 1), {
      endpoint: 'http://whisper:9000/transcribe',
      mimeType: 'video/mp4',
      processorVersion: 'local-v1',
    }),
    (error: unknown) => error instanceof LocalTranscriptionError
      && error.code === 'invalid_transcription_input'
  );

  await assert.rejects(
    () => transcribeWithPrivateService(validMedia, {
      endpoint: 'http://whisper:9000/transcribe',
      mimeType: 'audio/wav',
      processorVersion: 'local-v1',
      fetchImpl: async () => new Response(JSON.stringify({ text: '   ' })),
    }),
    (error: unknown) => error instanceof LocalTranscriptionError
      && error.code === 'empty_transcription_text'
  );

  await assert.rejects(
    () => transcribeWithPrivateService(validMedia, {
      endpoint: 'http://whisper:9000/transcribe',
      mimeType: 'video/webm',
      processorVersion: 'local-v1',
      fetchImpl: async () => new Response('not-json'),
    }),
    (error: unknown) => error instanceof LocalTranscriptionError
      && error.code === 'invalid_transcription_response'
  );
});

test('maps private transcription failures to stable retry-safe codes', async () => {
  await assert.rejects(
    () => transcribeWithPrivateService(validMedia, {
      endpoint: 'http://whisper:9000/transcribe',
      mimeType: 'audio/ogg',
      processorVersion: 'local-v1',
      fetchImpl: async () => { throw new Error('private service detail'); },
    }),
    (error: unknown) => error instanceof LocalTranscriptionError
      && error.code === 'transcription_service_unavailable'
  );
});

test('stops reading chunked transcription responses after the response limit', async () => {
  const oversized = new Uint8Array(MAX_TRANSCRIPTION_RESPONSE_BYTES + 1);
  await assert.rejects(
    () => transcribeWithPrivateService(validMedia, {
      endpoint: 'http://whisper:9000/transcribe',
      mimeType: 'audio/mp4',
      processorVersion: 'local-v1',
      fetchImpl: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(oversized);
          controller.close();
        },
      })),
    }),
    (error: unknown) => error instanceof LocalTranscriptionError
      && error.code === 'transcription_output_too_large'
  );
});

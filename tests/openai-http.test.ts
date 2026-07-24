import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_OPENAI_JSON_RESPONSE_BYTES,
  OPENAI_REQUEST_TIMEOUT_MS,
  postOpenAiJson,
} from '../src/lib/openai-http';

function withoutProxy() {
  const upper = process.env.HTTPS_PROXY;
  const lower = process.env.https_proxy;
  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  return () => {
    if (upper === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = upper;
    if (lower === undefined) delete process.env.https_proxy;
    else process.env.https_proxy = lower;
  };
}

test('OpenAI requests use a bounded timeout and parse a normal JSON response', async () => {
  const originalFetch = globalThis.fetch;
  const restoreProxy = withoutProxy();
  let capturedSignal: AbortSignal | null | undefined;

  globalThis.fetch = (async (_input, init) => {
    capturedSignal = init?.signal;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await postOpenAiJson<{ ok: boolean }>(
      'https://api.openai.com/v1/test',
      { Authorization: 'Bearer test-only' },
      { input: 'safe' }
    );

    assert.deepEqual(result, { ok: true, status: 200, data: { ok: true } });
    assert.ok(capturedSignal instanceof AbortSignal);
    assert.equal(OPENAI_REQUEST_TIMEOUT_MS, 60_000);
  } finally {
    globalThis.fetch = originalFetch;
    restoreProxy();
  }
});

test('OpenAI requests reject declared responses above the memory boundary', async () => {
  const originalFetch = globalThis.fetch;
  const restoreProxy = withoutProxy();

  globalThis.fetch = (async () => new Response('{}', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(MAX_OPENAI_JSON_RESPONSE_BYTES + 1),
    },
  })) as typeof fetch;

  try {
    await assert.rejects(
      postOpenAiJson(
        'https://api.openai.com/v1/test',
        { Authorization: 'Bearer test-only' },
        { input: 'safe' }
      ),
      /response exceeded the size limit/
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreProxy();
  }
});

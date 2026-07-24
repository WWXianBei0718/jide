import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';

interface JsonHttpResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export const OPENAI_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_OPENAI_JSON_RESPONSE_BYTES = 10 * 1024 * 1024;

function parseJsonBuffer<T>(buffer: Buffer): T {
  return (buffer.length ? JSON.parse(buffer.toString('utf8')) : {}) as T;
}

async function readBoundedFetchBody(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_OPENAI_JSON_RESPONSE_BYTES
  ) {
    throw new Error('OpenAI response exceeded the size limit');
  }

  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_OPENAI_JSON_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('OpenAI response exceeded the size limit');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

export async function postOpenAiJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<JsonHttpResult<T>> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxyUrl) {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
    });
    return {
      ok: response.ok,
      status: response.status,
      data: parseJsonBuffer<T>(await readBoundedFetchBody(response)),
    };
  }

  const require = createRequire(import.meta.url);
  const { HttpsProxyAgent } = require('next/dist/compiled/https-proxy-agent') as {
    HttpsProxyAgent: new (proxy: string) => HttpsAgent;
  };
  const serializedBody = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: 'POST',
      agent: new HttpsProxyAgent(proxyUrl),
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(serializedBody).toString(),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on('data', (chunk: Buffer) => {
        totalBytes += chunk.byteLength;
        if (totalBytes > MAX_OPENAI_JSON_RESPONSE_BYTES) {
          request.destroy(new Error('OpenAI response exceeded the size limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          resolve({
            ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
            status: response.statusCode || 0,
            data: parseJsonBuffer<T>(Buffer.concat(chunks, totalBytes)),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(
      OPENAI_REQUEST_TIMEOUT_MS,
      () => request.destroy(new Error('OpenAI request timed out'))
    );
    request.on('error', reject);
    request.write(serializedBody);
    request.end();
  });
}

import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';

interface JsonHttpResult<T> {
  ok: boolean;
  status: number;
  data: T;
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
    });
    return { ok: response.ok, status: response.status, data: await response.json() as T };
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
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const content = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
            status: response.statusCode || 0,
            data: (content ? JSON.parse(content) : {}) as T,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(60_000, () => request.destroy(new Error('OpenAI request timed out')));
    request.on('error', reject);
    request.write(serializedBody);
    request.end();
  });
}


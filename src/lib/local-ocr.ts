import { MAX_EXTRACTED_TEXT_CHARACTERS } from './material-processing-runner';

export const MAX_OCR_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_OCR_RESPONSE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_OCR_TIMEOUT_MS = 60_000;

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type LocalOcrErrorCode =
  | 'empty_ocr_text'
  | 'invalid_ocr_configuration'
  | 'invalid_ocr_input'
  | 'invalid_ocr_response'
  | 'ocr_output_too_large'
  | 'ocr_service_unavailable';

export class LocalOcrError extends Error {
  constructor(public readonly code: LocalOcrErrorCode) {
    super(code);
    this.name = 'LocalOcrError';
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function validatePrivateOcrEndpoint(value: string): URL | null {
  try {
    const endpoint = new URL(value);
    const hostname = endpoint.hostname.toLowerCase();
    const privateHostname = hostname === 'localhost'
      || hostname === '::1'
      || hostname.endsWith('.local')
      || (!hostname.includes('.') && !hostname.includes(':'))
      || isPrivateIpv4(hostname)
      || hostname.startsWith('fc')
      || hostname.startsWith('fd');

    if (
      !['http:', 'https:'].includes(endpoint.protocol)
      || endpoint.username
      || endpoint.password
      || endpoint.search
      || endpoint.hash
      || !privateHostname
    ) {
      return null;
    }

    return endpoint;
  } catch {
    return null;
  }
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readBoundedResponse(response: Response): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_OCR_RESPONSE_BYTES) {
        await reader.cancel();
        throw new LocalOcrError('ocr_output_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

export async function extractTextWithLocalOcr(
  input: Uint8Array,
  options: {
    endpoint: string;
    mimeType: string;
    processorVersion: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<{ text: string; processorVersion: string }> {
  if (
    input.byteLength < 12
    || input.byteLength > MAX_OCR_IMAGE_BYTES
    || !SUPPORTED_IMAGE_TYPES.has(options.mimeType)
  ) {
    throw new LocalOcrError('invalid_ocr_input');
  }

  const endpoint = validatePrivateOcrEndpoint(options.endpoint);
  if (!endpoint || !/^[a-zA-Z0-9._-]{1,80}$/.test(options.processorVersion)) {
    throw new LocalOcrError('invalid_ocr_configuration');
  }

  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? DEFAULT_OCR_TIMEOUT_MS, 1_000),
    120_000
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': options.mimeType,
        'x-ocr-language': 'ch',
      },
      body: new Blob([new Uint8Array(input)], { type: options.mimeType }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new LocalOcrError('ocr_service_unavailable');
  }

  if (!response.ok) {
    throw new LocalOcrError(
      response.status >= 500 ? 'ocr_service_unavailable' : 'invalid_ocr_response'
    );
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_OCR_RESPONSE_BYTES) {
    throw new LocalOcrError('ocr_output_too_large');
  }

  const responseBytes = await readBoundedResponse(response);

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(responseBytes));
  } catch {
    throw new LocalOcrError('invalid_ocr_response');
  }

  const rawText = payload && typeof payload === 'object' && 'text' in payload
    ? (payload as { text?: unknown }).text
    : null;
  if (typeof rawText !== 'string') {
    throw new LocalOcrError('invalid_ocr_response');
  }

  const text = normalizeOcrText(rawText);
  if (!text) {
    throw new LocalOcrError('empty_ocr_text');
  }
  if (text.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    throw new LocalOcrError('ocr_output_too_large');
  }

  return { text, processorVersion: options.processorVersion };
}

import { MAX_EXTRACTED_TEXT_CHARACTERS } from './material-processing-runner';
import { validatePrivateServiceEndpoint } from './private-service-endpoint';

export const MAX_TRANSCRIPTION_MEDIA_BYTES = 25 * 1024 * 1024;
export const MAX_TRANSCRIPTION_RESPONSE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 10 * 60_000;

const SUPPORTED_MEDIA_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'video/mp4',
  'video/webm',
]);

export type LocalTranscriptionErrorCode =
  | 'empty_transcription_text'
  | 'invalid_transcription_configuration'
  | 'invalid_transcription_input'
  | 'invalid_transcription_response'
  | 'transcription_output_too_large'
  | 'transcription_service_unavailable';

export class LocalTranscriptionError extends Error {
  constructor(public readonly code: LocalTranscriptionErrorCode) {
    super(code);
    this.name = 'LocalTranscriptionError';
  }
}

export function validatePrivateTranscriptionEndpoint(value: string): URL | null {
  return validatePrivateServiceEndpoint(value);
}

function normalizeTranscriptionText(text: string): string {
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
      if (totalBytes > MAX_TRANSCRIPTION_RESPONSE_BYTES) {
        await reader.cancel();
        throw new LocalTranscriptionError('transcription_output_too_large');
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

export async function transcribeWithPrivateService(
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
    || input.byteLength > MAX_TRANSCRIPTION_MEDIA_BYTES
    || !SUPPORTED_MEDIA_TYPES.has(options.mimeType)
  ) {
    throw new LocalTranscriptionError('invalid_transcription_input');
  }

  const endpoint = validatePrivateTranscriptionEndpoint(options.endpoint);
  if (!endpoint || !/^[a-zA-Z0-9._-]{1,80}$/.test(options.processorVersion)) {
    throw new LocalTranscriptionError('invalid_transcription_configuration');
  }

  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? DEFAULT_TRANSCRIPTION_TIMEOUT_MS, 30_000),
    15 * 60_000
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': options.mimeType,
        'x-transcription-language': 'zh',
        'x-media-kind': options.mimeType.startsWith('video/') ? 'video' : 'audio',
      },
      body: new Blob([new Uint8Array(input)], { type: options.mimeType }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new LocalTranscriptionError('transcription_service_unavailable');
  }

  if (!response.ok) {
    throw new LocalTranscriptionError(
      response.status >= 500
        ? 'transcription_service_unavailable'
        : 'invalid_transcription_response'
    );
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_TRANSCRIPTION_RESPONSE_BYTES
  ) {
    throw new LocalTranscriptionError('transcription_output_too_large');
  }

  const responseBytes = await readBoundedResponse(response);

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(responseBytes));
  } catch {
    throw new LocalTranscriptionError('invalid_transcription_response');
  }

  const rawText = payload && typeof payload === 'object' && 'text' in payload
    ? (payload as { text?: unknown }).text
    : null;
  if (typeof rawText !== 'string') {
    throw new LocalTranscriptionError('invalid_transcription_response');
  }

  const text = normalizeTranscriptionText(rawText);
  if (!text) {
    throw new LocalTranscriptionError('empty_transcription_text');
  }
  if (text.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    throw new LocalTranscriptionError('transcription_output_too_large');
  }

  return { text, processorVersion: options.processorVersion };
}

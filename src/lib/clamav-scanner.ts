import net from 'node:net';

export const MAX_MALWARE_SCAN_BYTES = 25 * 1024 * 1024;
export const MAX_CLAMAV_RESPONSE_BYTES = 4096;
export const DEFAULT_CLAMAV_TIMEOUT_MS = 30_000;

export type MalwareScanResult =
  | { status: 'clean' }
  | { status: 'infected' }
  | { status: 'error'; code: 'scanner_protocol_error' | 'scanner_unavailable' };

export function parseClamAvResponse(response: string): MalwareScanResult {
  const normalized = response.replace(/\0+$/g, '').trim();
  if (/^(stream|stdin): OK$/i.test(normalized)) {
    return { status: 'clean' };
  }
  if (/^(stream|stdin): .+ FOUND$/i.test(normalized)) {
    return { status: 'infected' };
  }
  return { status: 'error', code: 'scanner_protocol_error' };
}

export function encodeClamAvChunk(chunk: Uint8Array): Buffer {
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(chunk.byteLength, 0);
  return Buffer.concat([header, Buffer.from(chunk)]);
}

export async function scanBufferWithClamAv(
  input: Uint8Array,
  options: {
    host: string;
    port: number;
    timeoutMs?: number;
  }
): Promise<MalwareScanResult> {
  if (input.byteLength < 1 || input.byteLength > MAX_MALWARE_SCAN_BYTES) {
    return { status: 'error', code: 'scanner_protocol_error' };
  }

  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? DEFAULT_CLAMAV_TIMEOUT_MS, 1_000),
    120_000
  );

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: options.host,
      port: options.port,
    });
    let settled = false;
    let response = Buffer.alloc(0);

    const finish = (result: MalwareScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish({ status: 'error', code: 'scanner_unavailable' }));
    socket.once('error', () => finish({ status: 'error', code: 'scanner_unavailable' }));
    socket.on('data', (chunk: Buffer) => {
      if (response.byteLength + chunk.byteLength > MAX_CLAMAV_RESPONSE_BYTES) {
        finish({ status: 'error', code: 'scanner_protocol_error' });
        return;
      }
      response = Buffer.concat([response, chunk]);
      if (response.includes(0)) {
        finish(parseClamAvResponse(response.toString('utf8')));
      }
    });
    socket.once('end', () => {
      finish(parseClamAvResponse(response.toString('utf8')));
    });
    socket.once('close', () => {
      if (!settled) {
        finish({ status: 'error', code: 'scanner_unavailable' });
      }
    });
    socket.once('connect', () => {
      socket.write('zINSTREAM\0');
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < input.byteLength; offset += chunkSize) {
        socket.write(encodeClamAvChunk(input.subarray(offset, offset + chunkSize)));
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

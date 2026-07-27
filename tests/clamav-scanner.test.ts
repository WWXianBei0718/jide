import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeClamAvChunk,
  MAX_MALWARE_SCAN_BYTES,
  parseClamAvResponse,
  scanBufferWithClamAv,
} from '../src/lib/clamav-scanner';

test('accepts only canonical ClamAV clean and infected responses', () => {
  assert.deepEqual(parseClamAvResponse('stream: OK\0'), { status: 'clean' });
  assert.deepEqual(parseClamAvResponse('stream: Eicar-Test-Signature FOUND\0'), {
    status: 'infected',
  });
  assert.deepEqual(parseClamAvResponse('stream: permission denied ERROR\0'), {
    status: 'error',
    code: 'scanner_protocol_error',
  });
  assert.deepEqual(parseClamAvResponse('untrusted response'), {
    status: 'error',
    code: 'scanner_protocol_error',
  });
});

test('encodes INSTREAM chunks with an unsigned network-order length', () => {
  const frame = encodeClamAvChunk(Buffer.from('remember', 'utf8'));
  assert.equal(frame.readUInt32BE(0), 8);
  assert.equal(frame.subarray(4).toString('utf8'), 'remember');
});

test('rejects empty and oversized inputs before opening a scanner connection', async () => {
  assert.deepEqual(
    await scanBufferWithClamAv(new Uint8Array(), { host: '127.0.0.1', port: 3310 }),
    { status: 'error', code: 'scanner_protocol_error' }
  );
  assert.deepEqual(
    await scanBufferWithClamAv(new Uint8Array(MAX_MALWARE_SCAN_BYTES + 1), {
      host: '127.0.0.1',
      port: 3310,
    }),
    { status: 'error', code: 'scanner_protocol_error' }
  );
});

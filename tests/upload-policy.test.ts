import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFileSignature, validateUploadRequest } from '../src/lib/upload-policy';

test('accepts supported media with matching extension and size', () => {
  const image = validateUploadRequest('家庭照片.jpg', 'image/jpeg', 1024);
  const audio = validateUploadRequest('自然对话.mp3', 'audio/mpeg', 2048);
  const video = validateUploadRequest('生日录像.mp4', 'video/mp4', 4096);
  const document = validateUploadRequest('回忆录.pdf', 'application/pdf', 8192);

  assert.equal(image?.materialType, 'image');
  assert.equal(audio?.materialType, 'audio');
  assert.equal(video?.materialType, 'video');
  assert.equal(document?.materialType, 'document');
});

test('rejects unsupported, mismatched, empty, and oversized files', () => {
  assert.equal(validateUploadRequest('payload.exe', 'application/octet-stream', 100), null);
  assert.equal(validateUploadRequest('renamed.png', 'image/jpeg', 100), null);
  assert.equal(validateUploadRequest('empty.jpg', 'image/jpeg', 0), null);
  assert.equal(validateUploadRequest('huge.mp4', 'video/mp4', 26 * 1024 * 1024), null);
});

test('removes path traversal and control characters from display names', () => {
  const upload = validateUploadRequest('../../家人\u0000照片.jpg', 'image/jpeg', 100);
  assert.equal(upload?.fileName, '家人照片.jpg');
});

test('validates common file signatures instead of trusting MIME alone', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
  const mp4 = Buffer.from('0000ftyp0000', 'ascii');
  const fakePdf = Buffer.from('not-a-pdf-file', 'ascii');

  assert.equal(validateFileSignature(jpeg, 'image/jpeg'), true);
  assert.equal(validateFileSignature(png, 'image/png'), true);
  assert.equal(validateFileSignature(mp4, 'video/mp4'), true);
  assert.equal(validateFileSignature(fakePdf, 'application/pdf'), false);
  assert.equal(validateFileSignature(jpeg, 'image/png'), false);
});

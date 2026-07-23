import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPrivateFileManifest,
  MAX_PRIVATE_EXPORT_BYTES,
  privateFileArchivePath,
  safeArchiveFileName,
  validatePrivateExportSize,
} from '../src/lib/account-export-archive';
import type { PrivateExportFile } from '../src/lib/account-export-data';

function file(overrides: Partial<PrivateExportFile> = {}): PrivateExportFile {
  return {
    id: 'file-id',
    fileName: '家书.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    storageBucket: 'memory-assets',
    storagePath: 'private/path',
    sha256: 'abc123',
    ...overrides,
  };
}

test('removes traversal and control characters from archive file names', () => {
  assert.equal(safeArchiveFileName('../秘密/\u0000录音.mp3'), '秘密-录音.mp3');
  assert.equal(privateFileArchivePath(file()), 'files/file-id-家书.pdf');
});

test('builds a checksum manifest without storage paths', () => {
  const manifest = buildPrivateFileManifest([file()]);
  assert.equal(manifest.fileCount, 1);
  assert.equal(manifest.totalBytes, 1024);
  assert.equal(manifest.files[0].sha256, 'abc123');
  assert.equal('storagePath' in manifest.files[0], false);
});

test('rejects archives above the bounded synchronous export size', () => {
  assert.throws(
    () => validatePrivateExportSize([file({ fileSize: MAX_PRIVATE_EXPORT_BYTES + 1 })]),
    /private_export_too_large/
  );
});

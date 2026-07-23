import type { PrivateExportFile } from './account-export-data';

export const MAX_PRIVATE_EXPORT_FILES = 100;
export const MAX_PRIVATE_EXPORT_BYTES = 100 * 1024 * 1024;

export function safeArchiveFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '-')
    .replace(/^[-.]+/, '')
    .trim()
    .slice(0, 160);
  return normalized || 'unnamed-file';
}

export function privateFileArchivePath(file: PrivateExportFile): string {
  return `files/${file.id}-${safeArchiveFileName(file.fileName)}`;
}

export function validatePrivateExportSize(files: PrivateExportFile[]): {
  fileCount: number;
  totalBytes: number;
} {
  const totalBytes = files.reduce((sum, file) => sum + file.fileSize, 0);
  if (files.length > MAX_PRIVATE_EXPORT_FILES || totalBytes > MAX_PRIVATE_EXPORT_BYTES) {
    throw new Error('private_export_too_large');
  }
  return { fileCount: files.length, totalBytes };
}

export function buildPrivateFileManifest(files: PrivateExportFile[]) {
  const { fileCount, totalBytes } = validatePrivateExportSize(files);
  return {
    version: 'remember-private-file-manifest-v1',
    fileCount,
    totalBytes,
    files: files.map((file) => ({
      id: file.id,
      archivePath: privateFileArchivePath(file),
      originalFileName: file.fileName,
      mimeType: file.fileType,
      size: file.fileSize,
      sha256: file.sha256,
    })),
  };
}

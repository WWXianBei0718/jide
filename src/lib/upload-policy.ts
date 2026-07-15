import path from 'node:path';

export type UploadMaterialType = 'image' | 'audio' | 'video' | 'document';

interface UploadPolicy {
  materialType: UploadMaterialType;
  extensions: string[];
  maxBytes: number;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const POLICIES: Record<string, UploadPolicy> = {
  'image/jpeg': { materialType: 'image', extensions: ['.jpg', '.jpeg'], maxBytes: 15 * 1024 * 1024 },
  'image/png': { materialType: 'image', extensions: ['.png'], maxBytes: 15 * 1024 * 1024 },
  'image/webp': { materialType: 'image', extensions: ['.webp'], maxBytes: 15 * 1024 * 1024 },
  'audio/mpeg': { materialType: 'audio', extensions: ['.mp3'], maxBytes: MAX_UPLOAD_BYTES },
  'audio/wav': { materialType: 'audio', extensions: ['.wav'], maxBytes: MAX_UPLOAD_BYTES },
  'audio/x-wav': { materialType: 'audio', extensions: ['.wav'], maxBytes: MAX_UPLOAD_BYTES },
  'audio/ogg': { materialType: 'audio', extensions: ['.ogg', '.oga'], maxBytes: MAX_UPLOAD_BYTES },
  'audio/mp4': { materialType: 'audio', extensions: ['.m4a'], maxBytes: MAX_UPLOAD_BYTES },
  'video/mp4': { materialType: 'video', extensions: ['.mp4', '.m4v'], maxBytes: MAX_UPLOAD_BYTES },
  'video/webm': { materialType: 'video', extensions: ['.webm'], maxBytes: MAX_UPLOAD_BYTES },
  'application/pdf': { materialType: 'document', extensions: ['.pdf'], maxBytes: 20 * 1024 * 1024 },
};

export interface ValidatedUploadRequest {
  fileName: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  materialType: UploadMaterialType;
}

export function uploadsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_FILE_UPLOADS === 'true';
}

export function basicValidationCanPublish(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_UNSCANNED_UPLOADS === 'true';
}

export function voiceCloningEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_VOICE_CLONING === 'true';
}

export function validateUploadRequest(
  originalName: unknown,
  mimeType: unknown,
  fileSize: unknown
): ValidatedUploadRequest | null {
  if (typeof originalName !== 'string' || typeof mimeType !== 'string' || typeof fileSize !== 'number') {
    return null;
  }

  const policy = POLICIES[mimeType.toLowerCase()];
  if (!policy || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > policy.maxBytes) {
    return null;
  }

  const safeName = sanitizeFileName(originalName);
  const extension = path.extname(safeName).toLowerCase();
  if (!policy.extensions.includes(extension)) return null;

  return {
    fileName: safeName,
    extension,
    mimeType: mimeType.toLowerCase(),
    fileSize,
    materialType: policy.materialType,
  };
}

export function validateFileSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;

  const startsWith = (...bytes: number[]) => bytes.every((value, index) => buffer[index] === value);
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString('ascii');

  switch (mimeType) {
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'application/pdf':
      return ascii(0, 5) === '%PDF-';
    case 'audio/mpeg':
      return ascii(0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case 'audio/wav':
    case 'audio/x-wav':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    case 'audio/ogg':
      return ascii(0, 4) === 'OggS';
    case 'audio/mp4':
    case 'video/mp4':
      return ascii(4, 8) === 'ftyp';
    case 'video/webm':
      return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    default:
      return false;
  }
}

function sanitizeFileName(originalName: string): string {
  const baseName = path.basename(originalName).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const normalized = baseName.replace(/[^\p{L}\p{N}._()\- ]/gu, '_');
  return normalized.slice(0, 120) || 'upload';
}

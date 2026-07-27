import { createHash } from 'node:crypto';
import type { MaterialProcessingJobType } from './material-processing';

export const MAX_EXTRACTED_TEXT_CHARACTERS = 2_000_000;
export const MAX_PROCESSING_ATTEMPTS = 20;
export const MIN_RETRY_DELAY_SECONDS = 60;
export const MAX_RETRY_DELAY_SECONDS = 86_400;

export interface ClaimedMaterialProcessingJob {
  id: string;
  material_id: string;
  memory_profile_id: string;
  job_type: MaterialProcessingJobType;
  attempt_count: number;
  lease_expires_at: string;
}

export interface MaterialExtractionResult {
  text: string;
  processorVersion: string;
}

export function validateWorkerId(workerId: string): boolean {
  return /^[a-zA-Z0-9._:-]{1,120}$/.test(workerId);
}

export function validateProcessorVersion(version: string): boolean {
  return /^[a-zA-Z0-9._-]{1,80}$/.test(version);
}

export function normalizeProcessingErrorCode(errorCode: string): string {
  const normalized = errorCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  return normalized || 'processing_failed';
}

export function retryDelaySeconds(attemptCount: number): number {
  const finiteAttempt = Number.isFinite(attemptCount) ? attemptCount : MAX_PROCESSING_ATTEMPTS;
  const safeAttempt = Math.max(1, Math.min(MAX_PROCESSING_ATTEMPTS, Math.floor(finiteAttempt)));
  return Math.min(
    MAX_RETRY_DELAY_SECONDS,
    MIN_RETRY_DELAY_SECONDS * (2 ** (safeAttempt - 1))
  );
}

export function prepareExtractionCompletion(result: MaterialExtractionResult): {
  text: string;
  processorVersion: string;
  contentSha256: string;
} {
  const text = result.text.trim();
  if (!text || text.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    throw new Error('Invalid extracted text');
  }

  if (!validateProcessorVersion(result.processorVersion)) {
    throw new Error('Invalid processor version');
  }

  return {
    text,
    processorVersion: result.processorVersion,
    contentSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

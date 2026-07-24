import type { MemoryMaterial } from '@/types';

export const MATERIAL_PROCESSING_JOB_TYPES = [
  'image_ocr',
  'audio_transcription',
  'video_transcription',
  'document_text',
] as const;

export const MATERIAL_PROCESSING_STATUSES = [
  'pending',
  'processing',
  'extracted',
  'failed',
  'blocked',
] as const;

export type MaterialProcessingJobType = typeof MATERIAL_PROCESSING_JOB_TYPES[number];
export type MaterialProcessingStatus = typeof MATERIAL_PROCESSING_STATUSES[number];

export interface MaterialProcessingSummary {
  job_type: MaterialProcessingJobType;
  status: MaterialProcessingStatus;
  attempt_count: number;
  error_code: string | null;
  processor_version: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export function processingJobTypeForMaterial(
  type: MemoryMaterial['type']
): MaterialProcessingJobType | null {
  switch (type) {
    case 'image':
      return 'image_ocr';
    case 'audio':
      return 'audio_transcription';
    case 'video':
      return 'video_transcription';
    case 'document':
      return 'document_text';
    case 'text':
      return null;
  }
}

export function materialProcessingMessage(
  status: MaterialProcessingStatus | null
): string {
  switch (status) {
    case 'pending':
      return '文件已安全保存，等待提取可检索内容';
    case 'processing':
      return '正在提取可检索内容';
    case 'extracted':
      return '内容已提取，等待建立语义记忆';
    case 'failed':
      return '内容提取失败，原始文件仍安全保留';
    case 'blocked':
      return '内容处理暂未开放，原始文件仍安全保留';
    default:
      return '文件已安全保存，尚未建立内容处理任务';
  }
}

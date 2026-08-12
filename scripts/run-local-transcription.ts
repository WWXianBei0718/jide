import { adminSupabase } from '../src/lib/admin-supabase';
import {
  LocalTranscriptionError,
  MAX_TRANSCRIPTION_MEDIA_BYTES,
  transcribeWithPrivateService,
} from '../src/lib/local-transcription';
import {
  normalizeProcessingErrorCode,
  prepareExtractionCompletion,
  retryDelaySeconds,
  validateProcessorVersion,
  validateWorkerId,
  type ClaimedMaterialProcessingJob,
} from '../src/lib/material-processing-runner';
import { validateFileSignature } from '../src/lib/upload-policy';

const execute = process.argv.includes('--execute');
const workerId = process.env.MATERIAL_PROCESSING_WORKER_ID || 'local-transcription-worker:dev';
const endpoint = process.env.LOCAL_TRANSCRIPTION_ENDPOINT || '';
const processorVersion = process.env.LOCAL_TRANSCRIPTION_PROCESSOR_VERSION || '';
const claimLimit = 2;
const leaseSeconds = 900;

const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
]);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

interface SourceRecord {
  id: string;
  memory_profile_id: string;
  uploaded_files: {
    storage_bucket: string;
    file_path: string;
    file_type: string;
    file_size: number;
    status: string;
  } | null;
}

interface RunSummary {
  claimed: number;
  extracted: number;
  failed: number;
  leaseLost: number;
}

function sourceMatchesJob(job: ClaimedMaterialProcessingJob, mimeType: string): boolean {
  return (job.job_type === 'audio_transcription' && AUDIO_TYPES.has(mimeType))
    || (job.job_type === 'video_transcription' && VIDEO_TYPES.has(mimeType));
}

async function failJob(
  job: ClaimedMaterialProcessingJob,
  errorCode: string,
  retryable: boolean
): Promise<'failed' | 'blocked' | 'lease_lost'> {
  const { data, error } = await adminSupabase.rpc('fail_material_processing_job', {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_error_code: normalizeProcessingErrorCode(errorCode),
    p_retryable: retryable,
    p_retry_after_seconds: retryDelaySeconds(job.attempt_count),
  });

  if (error || !['failed', 'blocked', 'lease_lost'].includes(data)) {
    return 'lease_lost';
  }
  return data as 'failed' | 'blocked' | 'lease_lost';
}

async function processJob(
  job: ClaimedMaterialProcessingJob
): Promise<'extracted' | 'failed' | 'lease_lost'> {
  const { data, error } = await adminSupabase
    .from('memory_materials')
    .select('id, memory_profile_id, uploaded_files(storage_bucket, file_path, file_type, file_size, status)')
    .eq('id', job.material_id)
    .eq('memory_profile_id', job.memory_profile_id)
    .single();

  const source = data as SourceRecord | null;
  const file = source?.uploaded_files;
  if (
    error
    || !source
    || !file
    || file.storage_bucket !== 'memory-assets'
    || file.status !== 'ready'
    || !sourceMatchesJob(job, file.file_type)
    || file.file_size < 12
    || file.file_size > MAX_TRANSCRIPTION_MEDIA_BYTES
  ) {
    const failed = await failJob(job, 'invalid_transcription_source', false);
    return failed === 'lease_lost' ? 'lease_lost' : 'failed';
  }

  const { data: blob, error: downloadError } = await adminSupabase.storage
    .from('memory-assets')
    .download(file.file_path);
  if (downloadError || !blob) {
    const failed = await failJob(job, 'source_download_failed', true);
    return failed === 'lease_lost' ? 'lease_lost' : 'failed';
  }

  const media = new Uint8Array(await blob.arrayBuffer());
  if (
    media.byteLength !== file.file_size
    || !validateFileSignature(Buffer.from(media), file.file_type)
  ) {
    const failed = await failJob(job, 'transcription_signature_or_size_mismatch', false);
    return failed === 'lease_lost' ? 'lease_lost' : 'failed';
  }

  try {
    const extracted = await transcribeWithPrivateService(media, {
      endpoint,
      mimeType: file.file_type,
      processorVersion,
    });
    const completion = prepareExtractionCompletion(extracted);
    const { data: completed, error: completionError } = await adminSupabase.rpc(
      'complete_material_processing_job',
      {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_processor_version: completion.processorVersion,
        p_extracted_text: completion.text,
        p_content_sha256: completion.contentSha256,
      }
    );

    return !completionError && completed === true ? 'extracted' : 'lease_lost';
  } catch (error) {
    const code = error instanceof LocalTranscriptionError
      ? error.code
      : 'unexpected_transcription_processing_failure';
    const retryable = !(error instanceof LocalTranscriptionError)
      || error.code === 'transcription_service_unavailable';
    const failed = await failJob(job, code, retryable);
    return failed === 'lease_lost' ? 'lease_lost' : 'failed';
  }
}

async function main() {
  if (!execute) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      externalCalls: false,
      databaseReads: false,
      databaseWrites: false,
      storageReads: false,
      supportedJobTypes: ['audio_transcription', 'video_transcription'],
      message: 'Use --execute only with an approved private transcription service.',
    }));
    return;
  }

  if (
    !validateWorkerId(workerId)
    || !endpoint
    || !validateProcessorVersion(processorVersion)
  ) {
    throw new Error('Invalid local transcription worker configuration');
  }

  const { data, error } = await adminSupabase.rpc('claim_material_processing_jobs', {
    p_worker_id: workerId,
    p_job_types: ['audio_transcription', 'video_transcription'],
    p_limit: claimLimit,
    p_lease_seconds: leaseSeconds,
  });
  if (error || !Array.isArray(data)) {
    throw new Error('Unable to claim transcription jobs');
  }

  const jobs = data as ClaimedMaterialProcessingJob[];
  const summary: RunSummary = {
    claimed: jobs.length,
    extracted: 0,
    failed: 0,
    leaseLost: 0,
  };

  for (const job of jobs) {
    const outcome = await processJob(job);
    if (outcome === 'extracted') summary.extracted += 1;
    else if (outcome === 'failed') summary.failed += 1;
    else summary.leaseLost += 1;
  }

  console.log(JSON.stringify({
    event: 'material_processing.transcription_batch_completed',
    ...summary,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'material_processing.transcription_batch_failed',
    errorName: error instanceof Error ? error.name : 'unknown',
  }));
  process.exitCode = 1;
});

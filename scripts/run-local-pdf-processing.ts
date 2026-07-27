import { adminSupabase } from '../src/lib/admin-supabase';
import {
  extractLocalPdfText,
  LocalPdfExtractionError,
  MAX_PDF_BYTES,
} from '../src/lib/local-pdf-extraction';
import {
  normalizeProcessingErrorCode,
  prepareExtractionCompletion,
  retryDelaySeconds,
  validateWorkerId,
  type ClaimedMaterialProcessingJob,
} from '../src/lib/material-processing-runner';

const execute = process.argv.includes('--execute');
const workerId = process.env.MATERIAL_PROCESSING_WORKER_ID || 'local-pdf-worker:dev';
const claimLimit = 3;
const leaseSeconds = 600;

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
    error ||
    !source ||
    !file ||
    file.storage_bucket !== 'memory-assets' ||
    file.status !== 'ready' ||
    file.file_type !== 'application/pdf' ||
    file.file_size < 5 ||
    file.file_size > MAX_PDF_BYTES
  ) {
    const failed = await failJob(job, 'invalid_pdf_source', false);
    return failed === 'lease_lost' ? 'lease_lost' : 'failed';
  }

  const { data: blob, error: downloadError } = await adminSupabase.storage
    .from('memory-assets')
    .download(file.file_path);
  if (downloadError || !blob) {
    const failed = await failJob(job, 'source_download_failed', true);
    return failed === 'lease_lost' ? 'lease_lost' : 'failed';
  }

  try {
    const extracted = await extractLocalPdfText(
      new Uint8Array(await blob.arrayBuffer())
    );
    const completion = prepareExtractionCompletion({
      text: extracted.text,
      processorVersion: extracted.processorVersion,
    });
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
    const code = error instanceof LocalPdfExtractionError
      ? error.code
      : 'unexpected_pdf_processing_failure';
    const retryable = !(error instanceof LocalPdfExtractionError);
    const failed = await failJob(job, code, retryable);
    return failed === 'lease_lost' ? 'lease_lost' : 'failed';
  }
}

async function main() {
  if (!execute) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      externalCalls: false,
      databaseWrites: false,
      supportedJobTypes: ['document_text'],
      message: 'Use --execute only in an approved worker environment.',
    }));
    return;
  }

  if (!validateWorkerId(workerId)) {
    throw new Error('Invalid material processing worker id');
  }

  const { data, error } = await adminSupabase.rpc('claim_material_processing_jobs', {
    p_worker_id: workerId,
    p_job_types: ['document_text'],
    p_limit: claimLimit,
    p_lease_seconds: leaseSeconds,
  });
  if (error || !Array.isArray(data)) {
    throw new Error('Unable to claim material processing jobs');
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
    event: 'material_processing.pdf_batch_completed',
    ...summary,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'material_processing.pdf_batch_failed',
    errorName: error instanceof Error ? error.name : 'unknown',
  }));
  process.exitCode = 1;
});

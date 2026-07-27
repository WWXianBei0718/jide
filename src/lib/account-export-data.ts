import { adminSupabase } from './admin-supabase';
import {
  buildAccountExportArchive,
  sanitizeExportProfiles,
  sanitizeVoiceCloningJobs,
  type AccountExportArchive,
} from './account-export';

const PAGE_SIZE = 500;

type PageReader = (
  from: number,
  to: number
) => PromiseLike<{ data: unknown[] | null; error: unknown }>;

async function readAllPages(readPage: PageReader): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await readPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error('Account export query failed');
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export interface PrivateExportFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageBucket: string;
  storagePath: string;
  sha256: string | null;
}

export interface CollectedAccountExport {
  archive: AccountExportArchive;
  privateFiles: PrivateExportFile[];
}

interface UploadedFileRow {
  id: string;
  memory_profile_id: string | null;
  file_name: string;
  file_path: string;
  storage_bucket: string;
  file_type: string;
  file_size: number;
  purpose: string;
  detected_mime: string | null;
  sha256: string | null;
  status: string;
  processing_error: string | null;
  scan_details: unknown;
  available_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function collectAccountExport(
  userId: string,
  email: string | null
): Promise<CollectedAccountExport> {
  const profiles = await readAllPages((from, to) =>
    adminSupabase
      .from('memory_profiles')
      .select('id, name, relation, gender, birth_date, avatar_url, short_description, voice_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
  const profileIds = profiles
    .map((profile) => (profile as { id?: unknown }).id)
    .filter((id): id is string => typeof id === 'string');

  const byProfile = (
    table: string,
    columns: string,
    from: number,
    to: number
  ) => profileIds.length
    ? adminSupabase
        .from(table)
        .select(columns)
        .in('memory_profile_id', profileIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    : Promise.resolve({ data: [], error: null });

  const [
    materials,
    materialProcessingJobs,
    memoryChunks,
    conversations,
    messages,
    uploadedFiles,
    consents,
    voiceCloningJobs,
    chatUsageEvents,
    externalApiUsageEvents,
  ] = await Promise.all([
    readAllPages((from, to) => byProfile(
      'memory_materials',
      'id, memory_profile_id, type, title, content, uploaded_file_id, metadata, created_at',
      from,
      to
    )),
    readAllPages((from, to) => byProfile(
      'material_processing_jobs',
      'id, memory_profile_id, material_id, job_type, status, attempt_count, processor_version, queued_at, started_at, completed_at, next_attempt_at, created_at, updated_at',
      from,
      to
    )),
    readAllPages((from, to) => byProfile(
      'memory_chunks',
      'id, memory_profile_id, material_id, chunk_text, source_type, chunk_index, embedding_model, content_hash, created_at, updated_at',
      from,
      to
    )),
    readAllPages((from, to) =>
      adminSupabase
        .from('conversations')
        .select('id, memory_profile_id, title, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAllPages((from, to) =>
      adminSupabase
        .from('messages')
        .select('id, conversation_id, memory_profile_id, role, content, retrieved_context, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAllPages((from, to) =>
      adminSupabase
        .from('uploaded_files')
        .select('id, memory_profile_id, file_name, file_path, storage_bucket, file_type, file_size, purpose, detected_mime, sha256, status, processing_error, scan_details, available_at, deleted_at, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAllPages((from, to) =>
      adminSupabase
        .from('consents')
        .select('id, memory_profile_id, consent_type, consented, consented_at, policy_version, notice_hash, withdrawn_at, evidence, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAllPages((from, to) => byProfile(
      'voice_cloning_jobs',
      'id, memory_profile_id, status, voice_id, error_message, created_at, updated_at',
      from,
      to
    )),
    readAllPages((from, to) =>
      adminSupabase
        .from('chat_usage_events')
        .select('id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAllPages((from, to) =>
      adminSupabase
        .from('external_api_usage_events')
        .select('id, operation, units, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const safeUploadedFiles = (uploadedFiles as UploadedFileRow[]).map((file) => ({
    id: file.id,
    memory_profile_id: file.memory_profile_id,
    file_name: file.file_name,
    file_type: file.file_type,
    file_size: file.file_size,
    purpose: file.purpose,
    detected_mime: file.detected_mime,
    sha256: file.sha256,
    status: file.status,
    processing_error: file.processing_error,
    scan_details: file.scan_details,
    available_at: file.available_at,
    deleted_at: file.deleted_at,
    created_at: file.created_at,
    updated_at: file.updated_at,
  }));
  const privateFiles = (uploadedFiles as UploadedFileRow[])
    .filter((file) => file.status === 'ready' && !file.deleted_at)
    .map((file) => ({
      id: file.id,
      fileName: file.file_name,
      fileType: file.file_type,
      fileSize: file.file_size,
      storageBucket: file.storage_bucket,
      storagePath: file.file_path,
      sha256: file.sha256,
    }));

  return {
    archive: buildAccountExportArchive({
      user: { id: userId, email },
      profiles: sanitizeExportProfiles(profiles),
      materials,
      materialProcessingJobs,
      memoryChunks,
      conversations,
      messages,
      uploadedFiles: safeUploadedFiles,
      consents,
      voiceCloningJobs: sanitizeVoiceCloningJobs(voiceCloningJobs),
      chatUsageEvents,
      externalApiUsageEvents,
    }),
    privateFiles,
  };
}

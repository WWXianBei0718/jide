import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import {
  accountExportFileName,
  buildAccountExportArchive,
} from '@/lib/account-export';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  try {
    const profiles = await readAllPages((from, to) =>
      adminSupabase
        .from('memory_profiles')
        .select('id, name, relation, gender, birth_date, avatar_url, short_description, voice_id, created_at, updated_at')
        .eq('user_id', user.id)
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
      memoryChunks,
      conversations,
      messages,
      uploadedFiles,
      consents,
      voiceCloningJobs,
      chatUsageEvents,
    ] = await Promise.all([
      readAllPages((from, to) => byProfile(
        'memory_materials',
        'id, memory_profile_id, type, title, content, uploaded_file_id, metadata, created_at',
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
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      readAllPages((from, to) =>
        adminSupabase
          .from('messages')
          .select('id, conversation_id, memory_profile_id, role, content, retrieved_context, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      readAllPages((from, to) =>
        adminSupabase
          .from('uploaded_files')
          .select('id, memory_profile_id, file_name, file_type, file_size, purpose, detected_mime, sha256, status, processing_error, scan_details, available_at, deleted_at, created_at, updated_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      readAllPages((from, to) =>
        adminSupabase
          .from('consents')
          .select('id, memory_profile_id, consent_type, consented, consented_at, policy_version, notice_hash, withdrawn_at, evidence, created_at')
          .eq('user_id', user.id)
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
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

    const archive = buildAccountExportArchive({
      user: { id: user.id, email: user.email },
      profiles,
      materials,
      memoryChunks,
      conversations,
      messages,
      uploadedFiles,
      consents,
      voiceCloningJobs,
      chatUsageEvents,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${accountExportFileName()}"`
    );
    return res.status(200).send(JSON.stringify(archive, null, 2));
  } catch (error) {
    console.error('Account export failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(500).json({ error: '无法完整导出数据，请稍后重试' });
  }
}

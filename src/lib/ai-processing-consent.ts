import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  VOICE_CONSENT_NOTICE_TEXT,
  VOICE_CONSENT_VERSION,
} from './consent-policy';

export const AI_DATA_PROCESSING_CONSENT_VERSION = 'ai-data-processing-v1';

export const AI_DATA_PROCESSING_NOTICE =
  '为生成记忆体对话和建立语义记忆，“记得”会把当前问题及与问题相关的少量人物资料片段发送给 OpenAI 处理，不会默认发送全部档案。相关数据可能在你所在国家或地区之外处理。你可以随时撤回授权；撤回后将停止新的 OpenAI 对话和语义索引，已保存在“记得”中的原始资料不会因此自动删除。数字人物和回复始终是 AI 模拟，不是真实人物本人。';

export const AI_DATA_PROCESSING_NOTICE_HASH = createHash('sha256')
  .update(AI_DATA_PROCESSING_NOTICE)
  .digest('hex');

export const VOICE_PROCESSING_NOTICE_HASH = createHash('sha256')
  .update(VOICE_CONSENT_NOTICE_TEXT)
  .digest('hex');

export interface ConsentRecord {
  consented: boolean;
  policy_version: string | null;
  notice_hash: string | null;
  withdrawn_at: string | null;
}

export function isActiveVersionedConsent(
  record: ConsentRecord | null | undefined,
  policyVersion: string,
  noticeHash: string
): boolean {
  return Boolean(
    record?.consented === true
    && record.policy_version === policyVersion
    && record.notice_hash === noticeHash
    && !record.withdrawn_at
  );
}

async function readLatestConsent(
  client: SupabaseClient,
  profileId: string,
  consentType: 'data_usage' | 'voice_cloning'
): Promise<ConsentRecord | null> {
  const { data, error } = await client
    .from('consents')
    .select('consented, policy_version, notice_hash, withdrawn_at')
    .eq('memory_profile_id', profileId)
    .eq('consent_type', consentType)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as ConsentRecord;
}

export async function hasActiveAiDataProcessingConsent(
  client: SupabaseClient,
  profileId: string
): Promise<boolean> {
  return isActiveVersionedConsent(
    await readLatestConsent(client, profileId, 'data_usage'),
    AI_DATA_PROCESSING_CONSENT_VERSION,
    AI_DATA_PROCESSING_NOTICE_HASH
  );
}

export async function hasActiveVoiceProcessingConsent(
  client: SupabaseClient,
  profileId: string
): Promise<boolean> {
  return isActiveVersionedConsent(
    await readLatestConsent(client, profileId, 'voice_cloning'),
    VOICE_CONSENT_VERSION,
    VOICE_PROCESSING_NOTICE_HASH
  );
}

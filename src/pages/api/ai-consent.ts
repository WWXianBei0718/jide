import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import {
  AI_DATA_PROCESSING_CONSENT_VERSION,
  AI_DATA_PROCESSING_NOTICE,
  AI_DATA_PROCESSING_NOTICE_HASH,
  hasActiveAiDataProcessingConsent,
} from '@/lib/ai-processing-consent';
import { getChatProvider, getEmbeddingProvider } from '@/lib/ai-provider';

function currentAiProviders(): string[] {
  return [...new Set([getChatProvider().name, getEmbeddingProvider().name])];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await authenticate(req, res);
  if (!user) return;

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const profileId = req.method === 'GET' ? req.query.profileId : body.profileId;
  if (typeof profileId !== 'string') {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      consented: await hasActiveAiDataProcessingConsent(user.client, profileId),
      policyVersion: AI_DATA_PROCESSING_CONSENT_VERSION,
      notice: AI_DATA_PROCESSING_NOTICE,
    });
  }

  if (req.method === 'POST') {
    if (
      body.accepted !== true
      || body.policyVersion !== AI_DATA_PROCESSING_CONSENT_VERSION
    ) {
      return res.status(400).json({ error: 'Current AI data processing notice must be accepted' });
    }

    const consentedAt = new Date().toISOString();
    const { error } = await adminSupabase.from('consents').insert({
      user_id: user.id,
      memory_profile_id: profileId,
      consent_type: 'data_usage',
      consented: true,
      consented_at: consentedAt,
      policy_version: AI_DATA_PROCESSING_CONSENT_VERSION,
      notice_hash: AI_DATA_PROCESSING_NOTICE_HASH,
      withdrawn_at: null,
      evidence: {
        providers: currentAiProviders(),
        purposes: ['persona_chat', 'semantic_memory'],
        interface: 'profile_chat',
        recorded_at: consentedAt,
      },
    });

    if (error) return res.status(500).json({ error: '无法保存 AI 数据处理授权' });
    return res.status(201).json({
      consented: true,
      policyVersion: AI_DATA_PROCESSING_CONSENT_VERSION,
    });
  }

  if (req.method === 'DELETE') {
    const withdrawnAt = new Date().toISOString();
    const { error } = await adminSupabase.from('consents').insert({
      user_id: user.id,
      memory_profile_id: profileId,
      consent_type: 'data_usage',
      consented: false,
      consented_at: null,
      policy_version: AI_DATA_PROCESSING_CONSENT_VERSION,
      notice_hash: AI_DATA_PROCESSING_NOTICE_HASH,
      withdrawn_at: withdrawnAt,
      evidence: {
        providers: currentAiProviders(),
        purposes: ['persona_chat', 'semantic_memory'],
        interface: 'profile_chat',
        recorded_at: withdrawnAt,
      },
    });

    if (error) return res.status(500).json({ error: '无法撤回 AI 数据处理授权' });
    return res.status(200).json({ consented: false });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

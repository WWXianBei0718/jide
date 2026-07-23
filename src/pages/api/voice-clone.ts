import { createHash } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { beginApiRequest, logApiError } from '@/lib/api-observability';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import { VOICE_CONSENT_NOTICE_TEXT, VOICE_CONSENT_VERSION } from '@/lib/consent-policy';
import { deleteElevenLabsVoices } from '@/lib/external-resource-deletion';
import { consumeExternalApiQuota } from '@/lib/external-api-quota';
import { voiceCloningEnabled } from '@/lib/upload-policy';

interface VoiceUpload {
  id: string;
  file_name: string;
  file_path: string;
  storage_bucket: string;
  file_type: string;
  file_size: number;
  scan_details: {
    voice_consent_confirmed?: boolean;
    declaration_version?: string;
  };
}

const MAX_VOICE_SAMPLE_BYTES = 50 * 1024 * 1024;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const requestContext = beginApiRequest(req, res, 'api.voice_clone');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  if (!voiceCloningEnabled()) {
    return res.status(503).json({ error: '声音克隆尚未通过生产环境安全与合规审核' });
  }

  const { profileId, uploadIds } = req.body;

  if (typeof profileId !== 'string' || !Array.isArray(uploadIds) || uploadIds.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: profileId and uploadIds' });
  }

  if (uploadIds.length > 10 || !uploadIds.every((id) => typeof id === 'string')) {
    return res.status(400).json({ error: 'Invalid voice upload IDs' });
  }
  const uniqueUploadIds = [...new Set(uploadIds as string[])];
  if (uniqueUploadIds.length !== uploadIds.length) {
    return res.status(400).json({ error: 'Duplicate voice upload IDs are not allowed' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    const { data: profile, error: profileError } = await user.client
      .from('memory_profiles')
      .select('name, voice_id')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.voice_id) {
      return res.status(409).json({ error: '该人物已经拥有声音模型，请勿重复创建' });
    }

    const { data: uploadRows, error: uploadsError } = await adminSupabase
      .from('uploaded_files')
      .select('id, file_name, file_path, storage_bucket, file_type, file_size, scan_details')
      .in('id', uniqueUploadIds)
      .eq('user_id', user.id)
      .eq('memory_profile_id', profileId)
      .eq('purpose', 'voice_cloning')
      .eq('status', 'ready');

    if (uploadsError || !uploadRows || uploadRows.length !== uniqueUploadIds.length) {
      return res.status(400).json({ error: 'One or more voice samples are unavailable or unauthorized' });
    }

    const voiceUploads = uploadRows as VoiceUpload[];
    const totalBytes = voiceUploads.reduce((sum, upload) => sum + upload.file_size, 0);
    if (totalBytes > MAX_VOICE_SAMPLE_BYTES) {
      return res.status(400).json({ error: '声音样本总大小不能超过 50MB' });
    }
    if (!voiceUploads.every((upload) => upload.scan_details?.voice_consent_confirmed === true)) {
      return res.status(400).json({ error: '所有声音样本都必须包含明确的声纹同意证明' });
    }

    const formData = new FormData();
    formData.append('name', `${profile.name} 的声音`);

    for (const [index, file] of voiceUploads.entries()) {
      const { data: blob, error: downloadError } = await adminSupabase.storage
        .from(file.storage_bucket)
        .download(file.file_path);
      if (downloadError || !blob) {
        return res.status(500).json({ error: 'Failed to read a validated voice sample' });
      }
      formData.append(`files[${index}]`, blob, file.file_name);
    }

    const quota = await consumeExternalApiQuota(user.client, 'voice_clone');
    if (quota.status === 'unavailable') {
      return res.status(503).json({ error: '声音克隆配额服务暂时不可用，请稍后重试' });
    }
    if (quota.status === 'limited') {
      res.setHeader('Retry-After', String(quota.retryAfterSeconds));
      return res.status(429).json({ error: '声音克隆请求过于频繁，请稍后重试' });
    }

    const consentedAt = new Date().toISOString();
    const { error: consentError } = await adminSupabase.from('consents').insert({
      user_id: user.id,
      memory_profile_id: profileId,
      consent_type: 'voice_cloning',
      consented: true,
      consented_at: consentedAt,
      policy_version: VOICE_CONSENT_VERSION,
      notice_hash: createHash('sha256').update(VOICE_CONSENT_NOTICE_TEXT).digest('hex'),
      evidence: {
        upload_ids: uniqueUploadIds,
        provider: 'elevenlabs',
        requested_at: consentedAt,
      },
    });
    if (consentError) {
      return res.status(500).json({ error: '无法保存声纹同意证明，已中止声音克隆' });
    }

    const response = await fetch('https://api.elevenlabs.io/v1/voices/ivc/create', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      body: formData as unknown as BodyInit,
      signal: AbortSignal.timeout(60_000),
    });

    const data = await response.json();

    if (!response.ok) {
      logApiError(requestContext, 'elevenlabs.voice_clone_failed', {
        providerStatus: response.status,
      });
      return res.status(502).json({ error: '声音供应商暂时无法创建声音模型' });
    }

    if (typeof data.voice_id !== 'string' || !data.voice_id) {
      return res.status(502).json({ error: '声音供应商未返回有效的声音模型' });
    }

    const { error: updateError } = await user.client
      .from('memory_profiles')
      .update({ voice_id: data.voice_id })
      .eq('id', profileId)
      .eq('user_id', user.id);

    if (updateError) {
      const rollback = await deleteElevenLabsVoices(
        [data.voice_id],
        process.env.ELEVENLABS_API_KEY
      );
      logApiError(requestContext, 'voice_clone.persistence_failed', {
        outcome: rollback.ok ? 'provider_copy_removed' : 'manual_cleanup_required',
      });
      return res.status(502).json({
        error: rollback.ok
          ? '声音模型保存失败，供应商副本已安全撤销，可以稍后重试'
          : '声音模型保存失败且供应商删除未确认，请联系支持后再重试',
      });
    }

    const cleanupResults = await Promise.all(
      voiceUploads.map((upload) =>
        adminSupabase.storage.from(upload.storage_bucket).remove([upload.file_path])
      )
    );
    const cleanupFailed = cleanupResults.some((result) => result.error);
    await adminSupabase.from('uploaded_files').update({
      status: cleanupFailed ? 'deleting' : 'deleted',
      deleted_at: cleanupFailed ? null : new Date().toISOString(),
      processing_error: cleanupFailed ? 'voice_sample_cleanup_pending' : null,
    }).in('id', uniqueUploadIds).eq('user_id', user.id);

    return res.status(200).json({
      voice_ready: true,
      name: data.name,
      message: cleanupFailed ? '语音克隆创建成功，原始样本已封锁并等待后台重试清理' : '语音克隆创建成功',
    });
  } catch (error) {
    logApiError(requestContext, 'voice_clone.request_failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return res.status(500).json({ error: 'Failed to create voice clone' });
  }
}

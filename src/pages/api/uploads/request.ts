import { randomUUID } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import { VOICE_CONSENT_VERSION } from '@/lib/consent-policy';
import { cleanupExpiredUploadsForUser } from '@/lib/expired-upload-cleanup';
import { consumeExternalApiQuota } from '@/lib/external-api-quota';
import { uploadsEnabled, validateUploadRequest, voiceCloningEnabled } from '@/lib/upload-policy';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  if (!uploadsEnabled()) {
    return res.status(503).json({ error: 'File uploads are not enabled in this environment' });
  }

  const { profileId, fileName, mimeType, fileSize, rightsConfirmed, purpose = 'material', voiceConsentConfirmed } = req.body;
  if (typeof profileId !== 'string' || rightsConfirmed !== true) {
    return res.status(400).json({ error: 'Profile and rights confirmation are required' });
  }

  if (!['material', 'voice_cloning'].includes(purpose)) {
    return res.status(400).json({ error: 'Invalid upload purpose' });
  }

  if (purpose === 'voice_cloning' && !voiceCloningEnabled()) {
    return res.status(503).json({ error: '声音克隆尚未通过生产环境安全与合规审核' });
  }

  const upload = validateUploadRequest(fileName, mimeType, fileSize);
  if (!upload) {
    return res.status(400).json({ error: 'Unsupported file type, extension, or file size' });
  }

  if (purpose === 'voice_cloning' && (upload.materialType !== 'audio' || voiceConsentConfirmed !== true)) {
    return res.status(400).json({ error: 'Voice uploads require audio and explicit voice consent confirmation' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  await cleanupExpiredUploadsForUser(user.id);

  const quota = await consumeExternalApiQuota(
    user.client,
    'upload',
    upload.fileSize
  );
  if (quota.status === 'unavailable') {
    return res.status(503).json({ error: '上传额度服务暂时不可用，请稍后重试' });
  }
  if (quota.status === 'limited') {
    res.setHeader('Retry-After', String(quota.retryAfterSeconds));
    return res.status(429).json({ error: '上传请求已达到当前测试额度，请稍后重试' });
  }

  const uploadId = randomUUID();
  const storagePath = `${user.id}/${profileId}/${uploadId}${upload.extension}`;

  const { error: recordError } = await adminSupabase.from('uploaded_files').insert({
    id: uploadId,
    memory_profile_id: profileId,
    user_id: user.id,
    file_name: upload.fileName,
    file_path: storagePath,
    quarantine_path: storagePath,
    storage_bucket: 'memory-quarantine',
    file_type: upload.mimeType,
    file_size: upload.fileSize,
    purpose,
    status: 'requested',
    upload_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    scan_details: {
      rights_confirmed: true,
      voice_consent_confirmed: purpose === 'voice_cloning',
      declaration_version: purpose === 'voice_cloning' ? VOICE_CONSENT_VERSION : 'material-upload-v1',
    },
  });

  if (recordError) {
    return res.status(500).json({ error: 'Failed to create upload record' });
  }

  const { data: signedUpload, error: signedError } = await adminSupabase.storage
    .from('memory-quarantine')
    .createSignedUploadUrl(storagePath);

  if (signedError || !signedUpload) {
    await adminSupabase.from('uploaded_files').delete().eq('id', uploadId);
    return res.status(500).json({ error: 'Failed to create upload authorization' });
  }

  return res.status(201).json({
    uploadId,
    bucket: 'memory-quarantine',
    path: signedUpload.path,
    token: signedUpload.token,
    materialType: upload.materialType,
    purpose,
  });
}

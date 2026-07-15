import { createHash } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import {
  basicValidationCanPublish,
  uploadsEnabled,
  validateFileSignature,
  validateUploadRequest,
  voiceCloningEnabled,
} from '@/lib/upload-policy';

interface UploadRecord {
  id: string;
  user_id: string;
  memory_profile_id: string;
  file_name: string;
  file_path: string;
  quarantine_path: string;
  file_type: string;
  file_size: number;
  purpose: 'material' | 'voice_cloning';
  scan_details: Record<string, unknown>;
  upload_expires_at: string;
  status: string;
}

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

  const { uploadId } = req.body;
  if (typeof uploadId !== 'string') {
    return res.status(400).json({ error: 'Upload ID is required' });
  }

  const { data, error } = await adminSupabase
    .from('uploaded_files')
    .select('id, user_id, memory_profile_id, file_name, file_path, quarantine_path, file_type, file_size, purpose, scan_details, upload_expires_at, status')
    .eq('id', uploadId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Upload not found' });
  const upload = data as UploadRecord;

  if (upload.status === 'ready') {
    if (upload.purpose === 'voice_cloning') {
      return res.status(200).json({ status: 'ready', uploadId: upload.id });
    }
    const { data: material, error: materialError } = await user.client
      .from('memory_materials')
      .select('*')
      .eq('uploaded_file_id', upload.id)
      .single();
    if (materialError || !material) {
      return res.status(409).json({ error: 'Upload is ready but its material record is unavailable' });
    }
    return res.status(200).json({ status: 'ready', material });
  }

  if (upload.purpose === 'voice_cloning' && !voiceCloningEnabled()) {
    await rejectUpload(upload, 'voice_cloning_release_gate_closed');
    return res.status(503).json({ error: '声音克隆尚未通过生产环境安全与合规审核' });
  }

  if (new Date(upload.upload_expires_at).getTime() < Date.now()) {
    await rejectUpload(upload, 'upload_authorization_expired');
    return res.status(410).json({ error: 'Upload authorization expired' });
  }

  if (!['requested', 'quarantined'].includes(upload.status)) {
    return res.status(409).json({ error: 'Upload cannot be completed from its current state' });
  }

  const validatedRequest = validateUploadRequest(upload.file_name, upload.file_type, upload.file_size);
  if (!validatedRequest || !upload.quarantine_path) {
    await rejectUpload(upload, 'invalid_upload_record');
    return res.status(400).json({ error: 'Invalid upload record' });
  }

  const { data: claimed, error: claimError } = await adminSupabase
    .from('uploaded_files')
    .update({ status: 'validating' })
    .eq('id', upload.id)
    .eq('status', upload.status)
    .select('id')
    .maybeSingle();

  if (claimError || !claimed) {
    return res.status(409).json({ error: 'Upload is already being completed' });
  }

  const { data: fileBlob, error: downloadError } = await adminSupabase.storage
    .from('memory-quarantine')
    .download(upload.quarantine_path);

  if (downloadError || !fileBlob) {
    await rejectUpload(upload, 'quarantine_object_missing');
    return res.status(400).json({ error: 'Uploaded file was not found' });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  if (buffer.length !== upload.file_size || !validateFileSignature(buffer, upload.file_type)) {
    await rejectUpload(upload, 'signature_or_size_mismatch');
    return res.status(400).json({ error: 'File content does not match its declared type or size' });
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  if (!basicValidationCanPublish()) {
    await adminSupabase.from('uploaded_files').update({
      status: 'quarantined',
      detected_mime: upload.file_type,
      sha256,
      scan_details: {
        ...upload.scan_details,
        signature_validated: true,
        malware_scan: 'pending',
      },
    }).eq('id', upload.id);

    return res.status(202).json({ status: 'quarantined', message: 'Waiting for malware scanning' });
  }

  const assetPath = upload.file_path;
  const { error: assetError } = await adminSupabase.storage.from('memory-assets').upload(assetPath, buffer, {
    contentType: upload.file_type,
    cacheControl: '0',
    upsert: false,
  });

  if (assetError) {
    await rejectUpload(upload, 'asset_storage_failed');
    return res.status(500).json({ error: 'Failed to store validated file' });
  }

  const scanDetails = {
    ...upload.scan_details,
    signature_validated: true,
    malware_scan: 'not_configured',
    release_scope: 'development_only',
  };

  let material = null;
  if (upload.purpose === 'material') {
    const { data: materialId, error: finalizeError } = await adminSupabase.rpc(
      'finalize_material_upload',
      {
        p_upload_id: upload.id,
        p_material_type: validatedRequest.materialType,
        p_sha256: sha256,
        p_scan_details: scanDetails,
      }
    );

    if (finalizeError || !materialId) {
      await adminSupabase.storage.from('memory-assets').remove([assetPath]);
      await rejectUpload(upload, 'material_finalize_failed');
      return res.status(500).json({ error: 'Failed to finalize material upload' });
    }

    const { data: createdMaterial, error: materialError } = await user.client
      .from('memory_materials')
      .select('*')
      .eq('id', materialId)
      .single();
    if (materialError || !createdMaterial) {
      return res.status(500).json({ error: 'Material was finalized but could not be returned' });
    }
    material = createdMaterial;
  } else {
    const { data: readyUpload, error: readyError } = await adminSupabase
      .from('uploaded_files')
      .update({
        storage_bucket: 'memory-assets',
        status: 'ready',
        detected_mime: upload.file_type,
        sha256,
        available_at: new Date().toISOString(),
        processing_error: null,
        scan_details: scanDetails,
      })
      .eq('id', upload.id)
      .eq('status', 'validating')
      .select('id')
      .maybeSingle();

    if (readyError || !readyUpload) {
      await adminSupabase.storage.from('memory-assets').remove([assetPath]);
      await rejectUpload(upload, 'ready_state_failed');
      return res.status(500).json({ error: 'Failed to finalize upload' });
    }
  }

  await adminSupabase.storage.from('memory-quarantine').remove([upload.quarantine_path]);
  return res.status(201).json({ status: 'ready', material, uploadId: upload.id });
}

async function rejectUpload(upload: UploadRecord, reason: string) {
  await adminSupabase.from('uploaded_files').update({
    status: 'rejected',
    processing_error: reason,
  }).eq('id', upload.id);

  if (upload.quarantine_path) {
    await adminSupabase.storage.from('memory-quarantine').remove([upload.quarantine_path]);
  }
}

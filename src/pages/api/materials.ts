import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import { indexMemoryMaterial } from '@/lib/memory-indexing';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await authenticate(req, res);
  if (!user) return;

  switch (req.method) {
    case 'GET':
      return getMaterials(req, res, user);
    case 'POST':
      return createTextMaterial(req, res, user);
    case 'PATCH':
      return retryMaterialIndexing(req, res, user);
    case 'DELETE':
      return deleteMaterial(req, res, user);
    default:
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function retryMaterialIndexing(req: NextApiRequest, res: NextApiResponse, user: User) {
  const { id } = req.body;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Material ID is required' });

  const { data: material, error } = await user.client
    .from('memory_materials')
    .select('id, memory_profile_id, type, content, metadata')
    .eq('id', id)
    .single();

  if (error || !material) return res.status(404).json({ error: 'Material not found' });

  const isOwner = await verifyProfileOwnership(material.memory_profile_id, user.id, user.client, res);
  if (!isOwner) return;

  if (material.type !== 'text' || typeof material.content !== 'string' || !material.content.trim()) {
    return res.status(400).json({ error: 'This material does not have indexable text yet' });
  }

  const indexing = await indexMemoryMaterial({
    materialId: material.id,
    profileId: material.memory_profile_id,
    sourceType: material.type,
    content: material.content,
    metadata: material.metadata,
  });

  return res.status(indexing.status === 'ready' ? 200 : 503).json({ indexing });
}

type User = NonNullable<Awaited<ReturnType<typeof authenticate>>>;

async function getMaterials(req: NextApiRequest, res: NextApiResponse, user: User) {
  const { profileId } = req.query;
  if (typeof profileId !== 'string') {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  const { data, error } = await user.client
    .from('memory_materials')
    .select('*, uploaded_files(id, file_name, file_type, file_size, status)')
    .eq('memory_profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch materials' });
  return res.status(200).json(data || []);
}

async function createTextMaterial(req: NextApiRequest, res: NextApiResponse, user: User) {
  const { profileId, title, content } = req.body;
  if (
    typeof profileId !== 'string' ||
    typeof title !== 'string' ||
    !title.trim() ||
    typeof content !== 'string' ||
    !content.trim()
  ) {
    return res.status(400).json({ error: 'Profile, title, and content are required' });
  }

  if (title.length > 200 || content.length > 20000) {
    return res.status(400).json({ error: 'Material fields exceed the allowed length' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  const { data, error } = await user.client
    .from('memory_materials')
    .insert({
      memory_profile_id: profileId,
      type: 'text',
      title: title.trim(),
      content: content.trim(),
    })
    .select()
    .single();

  if (error || !data) return res.status(500).json({ error: 'Failed to create material' });

  const indexing = await indexMemoryMaterial({
    materialId: data.id,
    profileId,
    sourceType: 'text',
    content: data.content,
    metadata: data.metadata,
  });

  return res.status(201).json({ ...data, indexing });
}

async function deleteMaterial(req: NextApiRequest, res: NextApiResponse, user: User) {
  const { id } = req.body;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Material ID is required' });

  const { data: material, error } = await user.client
    .from('memory_materials')
    .select('id, memory_profile_id, uploaded_file_id')
    .eq('id', id)
    .single();

  if (error || !material) return res.status(404).json({ error: 'Material not found' });

  const isOwner = await verifyProfileOwnership(material.memory_profile_id, user.id, user.client, res);
  if (!isOwner) return;

  let file: {
    id: string;
    storage_bucket: string;
    file_path: string;
    quarantine_path: string | null;
  } | null = null;

  if (material.uploaded_file_id) {
    const { data } = await adminSupabase
      .from('uploaded_files')
      .select('id, storage_bucket, file_path, quarantine_path')
      .eq('id', material.uploaded_file_id)
      .eq('user_id', user.id)
      .single();
    file = data;

    if (file) {
      await adminSupabase.from('uploaded_files').update({
        status: 'deleting',
        processing_error: null,
      }).eq('id', file.id);
    }
  }

  const { error: deleteError } = await user.client.from('memory_materials').delete().eq('id', id);
  if (deleteError) {
    if (file) {
      await adminSupabase.from('uploaded_files').update({ status: 'ready' }).eq('id', file.id);
    }
    return res.status(500).json({ error: 'Failed to delete material' });
  }

  if (!file) return res.status(200).json({ message: 'Material deleted' });

  const removals = [];
  if (file.file_path) {
    removals.push(adminSupabase.storage.from(file.storage_bucket).remove([file.file_path]));
  }
  if (file.quarantine_path && file.storage_bucket !== 'memory-quarantine') {
    removals.push(adminSupabase.storage.from('memory-quarantine').remove([file.quarantine_path]));
  }

  const results = await Promise.all(removals);
  const cleanupFailed = results.some((result) => result.error);
  await adminSupabase.from('uploaded_files').update({
    status: cleanupFailed ? 'deleting' : 'deleted',
    deleted_at: cleanupFailed ? null : new Date().toISOString(),
    processing_error: cleanupFailed ? 'storage_cleanup_pending' : null,
  }).eq('id', file.id);

  return res.status(cleanupFailed ? 202 : 200).json({
    message: cleanupFailed ? 'Material deleted; secure file cleanup is pending' : 'Material deleted',
  });
}

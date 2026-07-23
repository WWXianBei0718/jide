import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership, type AuthenticatedUser } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import { hasRecentAuthentication, storageDeletionTargets, type DeletableUpload } from '@/lib/account-deletion';
import { deleteElevenLabsVoices, deleteStorageTargets } from '@/lib/external-resource-deletion';

const PUBLIC_PROFILE_FIELDS =
  'id, user_id, name, relation, gender, birth_date, avatar_url, short_description, voice_id, created_at, updated_at';

function publicProfile<T extends { user_id?: unknown; voice_id?: unknown }>(profile: T) {
  const safeProfile = { ...profile };
  const voiceId = safeProfile.voice_id;
  delete safeProfile.user_id;
  delete safeProfile.voice_id;
  return {
    ...safeProfile,
    voice_ready: typeof voiceId === 'string' && Boolean(voiceId),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await authenticate(req, res);
  if (!user) return;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, user);
    case 'POST':
      return handlePost(req, res, user);
    case 'PUT':
      return handlePut(req, res, user);
    case 'DELETE':
      return handleDelete(req, res, user);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, user: AuthenticatedUser) {
  const { id } = req.query;

  try {
    if (id) {
      if (typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid profile ID' });
      }
      const { data: profile, error } = await user.client
        .from('memory_profiles')
        .select(PUBLIC_PROFILE_FIELDS)
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error || !profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      return res.status(200).json(publicProfile(profile));
    } else {
      const { data: profiles, error } = await user.client
        .from('memory_profiles')
        .select(PUBLIC_PROFILE_FIELDS)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch profiles' });
      }

      return res.status(200).json((profiles || []).map(publicProfile));
    }
  } catch {
    return res.status(500).json({ error: 'Failed to fetch profiles' });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, user: AuthenticatedUser) {
  const { name, relation, gender, birth_date, short_description } = req.body;

  if (typeof name !== 'string' || !name.trim() || typeof relation !== 'string' || !relation.trim()) {
    return res.status(400).json({ error: 'Name and relation are required' });
  }

  if (name.length > 100 || relation.length > 100 || (typeof short_description === 'string' && short_description.length > 5000)) {
    return res.status(400).json({ error: 'Profile fields exceed the allowed length' });
  }

  try {
    const { data: profile, error } = await user.client
      .from('memory_profiles')
      .insert({
        user_id: user.id,
        name: name.trim(),
        relation: relation.trim(),
        gender: gender || null,
        birth_date: birth_date || null,
        short_description: short_description || null,
      })
      .select(PUBLIC_PROFILE_FIELDS)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create profile' });
    }

    return res.status(201).json(publicProfile(profile));
  } catch {
    return res.status(500).json({ error: 'Failed to create profile' });
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse, user: AuthenticatedUser) {
  const { id, name, relation, gender, birth_date, short_description } = req.body;

  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(id, user.id, user.client, res);
  if (!isOwner) return;

  const updates: Record<string, string | null> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > 100) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    updates.name = name.trim();
  }
  if (relation !== undefined) {
    if (typeof relation !== 'string' || !relation.trim() || relation.length > 100) {
      return res.status(400).json({ error: 'Invalid relation' });
    }
    updates.relation = relation.trim();
  }
  if (gender !== undefined) updates.gender = typeof gender === 'string' && gender ? gender : null;
  if (birth_date !== undefined) updates.birth_date = typeof birth_date === 'string' && birth_date ? birth_date : null;
  if (short_description !== undefined) {
    if (typeof short_description !== 'string' || short_description.length > 5000) {
      return res.status(400).json({ error: 'Invalid short description' });
    }
    updates.short_description = short_description || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No supported fields to update' });
  }

  try {
    const { data: profile, error } = await user.client
      .from('memory_profiles')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select(PUBLIC_PROFILE_FIELDS)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    return res.status(200).json(publicProfile(profile));
  } catch {
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, user: AuthenticatedUser) {
  const { id, confirmation } = req.body;

  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(id, user.id, user.client, res);
  if (!isOwner) return;

  try {
    const { data: profile, error: profileError } = await user.client
      .from('memory_profiles')
      .select('id, name, voice_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    if (confirmation !== profile.name) {
      return res.status(400).json({ error: '请输入人物姓名确认删除' });
    }
    if (!hasRecentAuthentication(user.accessToken)) {
      return res.status(401).json({ error: '请重新输入密码验证身份后再删除人物' });
    }

    const { data: uploads, error: uploadsError } = await adminSupabase
      .from('uploaded_files')
      .select('storage_bucket, file_path, quarantine_path, status')
      .eq('user_id', user.id)
      .eq('memory_profile_id', id);
    if (uploadsError) {
      return res.status(500).json({ error: '无法盘点人物私有文件，删除已中止' });
    }

    const voiceDeletion = await deleteElevenLabsVoices(
      typeof profile.voice_id === 'string' ? [profile.voice_id] : [],
      process.env.ELEVENLABS_API_KEY
    );
    if (!voiceDeletion.ok) {
      return res.status(voiceDeletion.reason === 'not_configured' ? 503 : 502).json({
        error: voiceDeletion.reason === 'not_configured'
          ? '声音供应商删除服务未配置，人物删除已中止'
          : '声音供应商尚未确认删除声音模型，人物删除已中止',
      });
    }

    const storageDeletion = await deleteStorageTargets(
      storageDeletionTargets((uploads || []) as DeletableUpload[]),
      (bucket, paths) => adminSupabase.storage.from(bucket).remove(paths)
    );
    if (!storageDeletion.ok) {
      return res.status(502).json({
        error: '人物私有文件尚未全部删除，人物删除已中止，可稍后安全重试',
      });
    }

    const { error } = await user.client
      .from('memory_profiles')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return res.status(500).json({
        error: '外部资源已清理，但人物数据库删除失败，请稍后重试',
      });
    }

    return res.status(200).json({
      message: '人物、私有资料和声音模型已删除',
      deletedVoiceCount: voiceDeletion.deletedCount,
      deletedFileCount: storageDeletion.deletedCount,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to delete profile' });
  }
}

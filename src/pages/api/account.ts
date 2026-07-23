import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import {
  ACCOUNT_DELETE_CONFIRMATION,
  hasRecentAuthentication,
  storageDeletionTargets,
  type DeletableUpload,
} from '@/lib/account-deletion';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  const { confirmation, email } = req.body;
  if (confirmation !== ACCOUNT_DELETE_CONFIRMATION || email !== user.email) {
    return res.status(400).json({ error: '删除确认文本或邮箱不匹配' });
  }
  if (!hasRecentAuthentication(user.accessToken)) {
    return res.status(401).json({ error: '请重新输入密码验证身份后再删除账号' });
  }

  try {
    const { data: profiles, error: profilesError } = await adminSupabase
      .from('memory_profiles')
      .select('id, voice_id')
      .eq('user_id', user.id);
    const { data: uploads, error: uploadsError } = await adminSupabase
      .from('uploaded_files')
      .select('storage_bucket, file_path, quarantine_path, status')
      .eq('user_id', user.id);
    if (profilesError || uploadsError) {
      return res.status(500).json({ error: '无法盘点账号数据，删除已中止' });
    }

    const voiceIds = [...new Set(
      (profiles || [])
        .map((profile) => profile.voice_id)
        .filter((voiceId): voiceId is string => typeof voiceId === 'string' && Boolean(voiceId))
    )];
    if (voiceIds.length > 0 && !process.env.ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: '声音供应商删除服务未配置，账号删除已中止' });
    }

    for (const voiceId of voiceIds) {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
        {
          method: 'DELETE',
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '' },
          signal: AbortSignal.timeout(30_000),
        }
      );
      if (!response.ok && response.status !== 404) {
        return res.status(502).json({
          error: '声音供应商尚未确认删除全部声音模型，账号删除已中止',
        });
      }
    }

    const storageTargets = storageDeletionTargets((uploads || []) as DeletableUpload[]);
    const targetsByBucket = new Map<string, string[]>();
    for (const target of storageTargets) {
      const paths = targetsByBucket.get(target.bucket) || [];
      paths.push(target.path);
      targetsByBucket.set(target.bucket, paths);
    }
    for (const [bucket, paths] of targetsByBucket) {
      for (let index = 0; index < paths.length; index += 100) {
        const { error } = await adminSupabase.storage
          .from(bucket)
          .remove(paths.slice(index, index + 100));
        if (error) {
          return res.status(502).json({
            error: '私有文件尚未全部删除，账号删除已中止，可稍后安全重试',
          });
        }
      }
    }

    const tableDeletes = [
      adminSupabase.from('messages').delete().eq('user_id', user.id),
      adminSupabase.from('conversations').delete().eq('user_id', user.id),
      adminSupabase.from('memory_profiles').delete().eq('user_id', user.id),
      adminSupabase.from('uploaded_files').delete().eq('user_id', user.id),
      adminSupabase.from('consents').delete().eq('user_id', user.id),
      adminSupabase.from('chat_usage_events').delete().eq('user_id', user.id),
    ];
    for (const deletion of tableDeletes) {
      const { error } = await deletion;
      if (error) {
        return res.status(500).json({
          error: '部分数据清理失败，账号尚未删除，请联系支持或稍后重试',
        });
      }
    }

    const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      return res.status(500).json({
        error: '数据已清理，但登录账号删除失败，请联系支持完成最终处理',
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      message: '账号、私有资料和供应商声音资源已删除',
      deletedVoiceCount: voiceIds.length,
      deletedFileCount: storageTargets.length,
    });
  } catch (error) {
    console.error('Account deletion failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(500).json({ error: '账号删除未完成，请稍后重试' });
  }
}

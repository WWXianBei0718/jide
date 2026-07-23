import type { NextApiRequest, NextApiResponse } from 'next';
import { beginApiRequest, logApiError } from '@/lib/api-observability';
import { authenticate } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import {
  ACCOUNT_DELETE_CONFIRMATION,
  hasRecentAuthentication,
  storageDeletionTargets,
  type DeletableUpload,
} from '@/lib/account-deletion';
import {
  deleteElevenLabsVoices,
  deleteStorageTargets,
} from '@/lib/external-resource-deletion';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestContext = beginApiRequest(req, res, 'api.account');
  res.setHeader('Cache-Control', 'no-store');

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
    const voiceDeletion = await deleteElevenLabsVoices(
      voiceIds,
      process.env.ELEVENLABS_API_KEY
    );
    if (!voiceDeletion.ok) {
      return res.status(voiceDeletion.reason === 'not_configured' ? 503 : 502).json({
        error: voiceDeletion.reason === 'not_configured'
          ? '声音供应商删除服务未配置，账号删除已中止'
          : '声音供应商尚未确认删除全部声音模型，账号删除已中止',
      });
    }

    const storageTargets = storageDeletionTargets((uploads || []) as DeletableUpload[]);
    const storageDeletion = await deleteStorageTargets(
      storageTargets,
      (bucket, paths) => adminSupabase.storage.from(bucket).remove(paths)
    );
    if (!storageDeletion.ok) {
      return res.status(502).json({
        error: '私有文件尚未全部删除，账号删除已中止，可稍后安全重试',
      });
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

    return res.status(200).json({
      message: '账号、私有资料和供应商声音资源已删除',
      deletedVoiceCount: voiceDeletion.deletedCount,
      deletedFileCount: storageDeletion.deletedCount,
    });
  } catch (error) {
    logApiError(requestContext, 'account_deletion.request_failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return res.status(500).json({ error: '账号删除未完成，请稍后重试' });
  }
}

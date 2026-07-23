import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import type { MemoryProfile } from '@/types';

export default function ProfileDetailPage() {
  const { user, loading, getToken } = useAuth();
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { id } = router.query;

  const fetchProfile = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const token = await getToken();
    const response = await fetch(`/api/profile?id=${encodeURIComponent(String(id))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setProfile(await response.json());
    } else {
      setProfile(null);
    }
    setIsLoading(false);
  }, [getToken, id]);

  useEffect(() => {
    if (loading || !id) return;

    if (!user) {
      router.push('/');
      return;
    }

    fetchProfile();
  }, [user, loading, id, router, fetchProfile]);

  const handleDeleteProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const currentProfile = profile;
    const email = user?.email;
    if (!currentProfile || !email || deleteConfirmation !== currentProfile.name) return;
    if (!window.confirm(`确定永久删除“${currentProfile.name}”及其所有资料和声音模型吗？`)) {
      return;
    }

    setIsDeleting(true);
    setDeleteError('');
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: deletePassword,
      });
      if (reauthError) throw new Error('密码验证失败，人物没有被删除');
      const token = await getToken();
      if (!token) throw new Error('重新验证失败，人物没有被删除');

      const response = await fetch('/api/profile', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: currentProfile.id,
          confirmation: deleteConfirmation,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '人物删除未完成');
      await router.replace('/dashboard');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '人物删除未完成');
    } finally {
      setIsDeleting(false);
      setDeletePassword('');
    }
  };

  if (loading || !user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-warm-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <button onClick={() => router.back()} className="text-warm-600">← 返回</button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className="text-warm-500">记忆体不存在</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => router.back()} className="text-warm-600 hover:text-warm-900">
            ← 返回
          </button>
          <h1 className="text-xl font-semibold text-warm-900">记得</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-primary-100 to-primary-50 p-8 text-center">
            <div className="w-24 h-24 mx-auto mb-4 bg-white rounded-full flex items-center justify-center shadow-md">
              <span className="text-4xl text-primary-600">
                {profile.name?.charAt(0) || '?'}
              </span>
            </div>
            <h2 className="text-2xl font-semibold text-warm-900 mb-1">{profile.name}</h2>
            <p className="text-primary-600">{profile.relation}</p>
          </div>

          <div className="p-6">
            {profile.short_description && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-warm-500 uppercase tracking-wide mb-2">
                  关于
                </h3>
                <p className="text-warm-700">{profile.short_description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
              {profile.birth_date && (
                <div className="bg-warm-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-warm-500 mb-1">出生日期</h3>
                  <p className="text-warm-700">
                    {new Date(profile.birth_date).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                onClick={() => router.push(`/profile/${profile.id}/materials`)}
                className="flex-1 px-6 py-3 border border-primary-200 text-primary-600 rounded-lg hover:bg-primary-50 transition font-medium flex items-center justify-center gap-2"
              >
                <span>资料管理</span>
              </button>
              <button
                onClick={() => router.push(`/profile/${profile.id}/chat`)}
                className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium flex items-center justify-center gap-2"
              >
                <span>开始对话</span>
              </button>
              <button
                onClick={() => router.push(`/train-voice?profileId=${profile.id}`)}
                className="px-6 py-3 border border-primary-200 text-primary-600 rounded-lg hover:bg-primary-50 transition font-medium"
              >
                {profile.voice_id ? '更新声音' : '训练声音'}
              </button>
            </div>

            <div className="border-t border-red-100 mt-8 pt-6">
              <button
                type="button"
                onClick={() => setShowDelete((visible) => !visible)}
                className="text-sm text-red-600 hover:text-red-700"
              >
                {showDelete ? '取消删除人物' : '永久删除这个人物'}
              </button>
              {showDelete && (
                <form onSubmit={handleDeleteProfile} className="mt-4 space-y-3">
                  <p className="text-sm text-red-700">
                    将同时删除人物资料、聊天、私有文件和已绑定的声音模型，无法撤销。
                  </p>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    placeholder="重新输入登录密码"
                    autoComplete="current-password"
                    className="w-full px-3 py-2 border border-red-200 rounded-lg"
                    required
                  />
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    placeholder={`输入人物姓名“${profile.name}”`}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg"
                    required
                  />
                  <button
                    type="submit"
                    disabled={
                      isDeleting ||
                      !deletePassword ||
                      deleteConfirmation !== profile.name
                    }
                    className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {isDeleting ? '正在安全删除…' : '确认永久删除人物'}
                  </button>
                  {deleteError && <p className="text-sm text-red-700" role="alert">{deleteError}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

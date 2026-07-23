import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import { ACCOUNT_DELETE_CONFIRMATION } from '@/lib/account-deletion';
import type { MemoryProfile } from '@/types';

export default function DashboardPage() {
  const { user, loading, signOut, getToken } = useAuth();
  const [profiles, setProfiles] = useState<MemoryProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exportingMode, setExportingMode] = useState<'json' | 'zip' | null>(null);
  const [privacyMessage, setPrivacyMessage] = useState('');
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const router = useRouter();
  const redirectRef = useRef(false);

  const fetchProfiles = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch profiles');
      setProfiles(await response.json());
    } catch {
      console.error('Failed to fetch profiles');
    }
    setIsLoading(false);
  }, [getToken, user]);

  useEffect(() => {
    if (!loading && !user && !redirectRef.current) {
      redirectRef.current = true;
      router.push('/');
    }

    if (user) {
      fetchProfiles();
    }
  }, [user, loading, router, fetchProfiles]);

  const handleSignOut = async () => {
    await signOut();
    redirectRef.current = true;
    router.push('/');
  };

  const handleExport = async (format: 'json' | 'zip') => {
    setExportingMode(format);
    setPrivacyMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('登录已失效，请重新登录');
      const response = await fetch(
        format === 'zip' ? '/api/account-export-archive' : '/api/account-export',
        {
        headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) throw new Error('暂时无法导出，请稍后重试');

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ||
        `remember-account-export.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setPrivacyMessage(
        format === 'zip'
          ? '完整压缩包已导出，请妥善保管其中的私人资料。'
          : '结构化数据已导出。私有文件正文可通过完整压缩包导出。'
      );
    } catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExportingMode(null);
    }
  };

  const handleDeleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    const userEmail = user?.email;
    if (!userEmail || deleteConfirmation !== ACCOUNT_DELETE_CONFIRMATION) return;
    if (!window.confirm('这是不可撤销操作。确定永久删除账号、所有资料和声音模型吗？')) {
      return;
    }

    setIsDeletingAccount(true);
    setPrivacyMessage('');
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: deletePassword,
      });
      if (reauthError) throw new Error('密码验证失败，账号没有被删除');

      const token = await getToken();
      if (!token) throw new Error('重新验证失败，账号没有被删除');
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          confirmation: deleteConfirmation,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '账号删除未完成');

      await signOut();
      redirectRef.current = true;
      await router.replace('/');
    } catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : '账号删除未完成');
    } finally {
      setIsDeletingAccount(false);
      setDeletePassword('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <p className="text-warm-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-xl">?</span>
            </div>
            <h1 className="text-xl font-semibold text-warm-900">记得</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-warm-600">{user.email}</span>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-warm-600 hover:text-warm-900 transition"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-warm-900 mb-2">我的记忆体</h2>
          <p className="text-warm-600">在这里，你可以创建和管理亲人的记忆档案</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button
            onClick={() => router.push('/create-profile')}
            className="border-2 border-dashed border-primary-300 rounded-2xl p-8 text-center hover:border-primary-400 hover:bg-primary-50 transition group"
          >
            <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center group-hover:bg-primary-200 transition">
              <span className="text-2xl text-primary-600">+</span>
            </div>
            <h3 className="text-lg font-medium text-warm-900 mb-1">创建记忆体</h3>
            <p className="text-warm-500 text-sm">为亲人建立数字记忆档案</p>
          </button>

          {isLoading ? (
            <div className="col-span-full flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : profiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              onClick={() => router.push(`/profile/${profile.id}`)}
              className="bg-white rounded-2xl shadow-sm p-6 cursor-pointer hover:shadow-md transition text-left"
            >
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl text-primary-600">
                    {profile.name?.charAt(0) || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-warm-900 truncate">
                    {profile.name}
                  </h3>
                  <p className="text-warm-500 text-sm">{profile.relation}</p>
                  {profile.short_description && (
                    <p className="text-warm-600 text-sm mt-2 line-clamp-2">
                      {profile.short_description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-warm-100 flex items-center justify-between">
                <span className="text-warm-400 text-sm">
                  创建于 {new Date(profile.created_at).toLocaleDateString('zh-CN')}
                </span>
                <span className="text-primary-600 text-sm">查看详情 →</span>
              </div>
            </button>
          ))}

          {!isLoading && profiles.length === 0 && (
            <div className="col-span-full text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 bg-warm-100 rounded-full flex items-center justify-center">
                <span className="text-3xl text-warm-400">?</span>
              </div>
              <h3 className="text-lg font-medium text-warm-900 mb-2">还没有记忆体</h3>
              <p className="text-warm-500">点击上方按钮，开始创建第一个记忆档案</p>
            </div>
          )}
        </div>

        <section className="mt-12 bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-warm-900">隐私与数据</h2>
          <p className="text-sm text-warm-600 mt-2">
            导出人物档案、文字资料、聊天记录、记忆处理状态、同意记录和私有文件清单。
          </p>
          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exportingMode !== null}
            className="mt-4 px-4 py-2 border border-primary-300 text-primary-700 rounded-lg hover:bg-primary-50 disabled:opacity-50"
          >
            {exportingMode === 'json' ? '正在整理数据…' : '导出结构化数据'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('zip')}
            disabled={exportingMode !== null}
            className="mt-4 ml-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {exportingMode === 'zip' ? '正在打包私有文件…' : '导出完整压缩包'}
          </button>
          <p className="text-xs text-warm-500 mt-3">
            完整压缩包包含当前可用的图片、音频、视频和 PDF，单次上限为 100 个文件或 100MB。
          </p>
          {privacyMessage && (
            <p className="text-sm text-warm-700 mt-3" role="status">{privacyMessage}</p>
          )}

          <div className="border-t border-red-100 mt-6 pt-6">
            <button
              type="button"
              onClick={() => setShowDeleteAccount((visible) => !visible)}
              className="text-sm text-red-600 hover:text-red-700"
            >
              {showDeleteAccount ? '取消删除账号' : '永久删除账号'}
            </button>
            {showDeleteAccount && (
              <form onSubmit={handleDeleteAccount} className="mt-4 max-w-lg space-y-3">
                <p className="text-sm text-red-700">
                  此操作会删除账号、人物、聊天、私有文件和已绑定的 ElevenLabs 声音模型，无法撤销。
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
                  placeholder={`输入“${ACCOUNT_DELETE_CONFIRMATION}”`}
                  className="w-full px-3 py-2 border border-red-200 rounded-lg"
                  required
                />
                <button
                  type="submit"
                  disabled={
                    isDeletingAccount ||
                    !deletePassword ||
                    deleteConfirmation !== ACCOUNT_DELETE_CONFIRMATION
                  }
                  className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
                >
                  {isDeletingAccount ? '正在安全删除…' : '确认永久删除'}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

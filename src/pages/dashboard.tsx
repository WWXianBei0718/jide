import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import type { MemoryProfile } from '@/types';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const [profiles, setProfiles] = useState<MemoryProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const redirectRef = useRef(false);

  const fetchProfiles = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('memory_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching profiles:', error);
      } else {
        setProfiles(data || []);
      }
    } catch {
      console.error('Failed to fetch profiles');
    }
    setIsLoading(false);
  }, [user]);

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
            <div
              key={profile.id}
              onClick={() => router.push(`/profile/${profile.id}`)}
              className="bg-white rounded-2xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
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
            </div>
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
      </main>
    </div>
  );
}

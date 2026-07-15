import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import type { MemoryProfile } from '@/types';

export default function ProfileDetailPage() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { id } = router.query;

  const fetchProfile = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('memory_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setProfile(data || null);
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    if (!user || !id) {
      router.push('/');
      return;
    }

    fetchProfile();
  }, [user, id, router, fetchProfile]);

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

            <div className="flex flex-col sm:flex-row gap-4">
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
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

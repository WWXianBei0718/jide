import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import type { MemoryProfile, MemoryMaterial } from '@/types';

export default function MaterialsPage() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [materials, setMaterials] = useState<MemoryMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMaterial, setNewMaterial] = useState({
    title: '',
    content: '',
    type: 'text' as const,
  });
  const router = useRouter();
  const { id } = router.query;

  useEffect(() => {
    if (!user || !id) {
      router.push('/');
      return;
    }

    fetchProfile();
    fetchMaterials();
  }, [user, id, router]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('memory_profiles')
      .select('*')
      .eq('id', id)
      .single();
    setProfile(data || null);
  };

  const fetchMaterials = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('memory_materials')
      .select('*')
      .eq('memory_profile_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching materials:', error);
    } else {
      setMaterials(data || []);
    }
    setIsLoading(false);
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterial.title || !newMaterial.content) return;

    const { error } = await supabase.from('memory_materials').insert({
      memory_profile_id: id,
      type: newMaterial.type,
      title: newMaterial.title,
      content: newMaterial.content,
    });

    if (!error) {
      setNewMaterial({ title: '', content: '', type: 'text' });
      setShowAddForm(false);
      fetchMaterials();
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-warm-900">
            {profile?.name} 的记忆资料
          </h2>
          <p className="text-warm-600 text-sm mt-1">
            上传和管理关于 {profile?.name} 的照片、故事和其他资料
          </p>
        </div>

        {showAddForm && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <h3 className="text-lg font-medium text-warm-900 mb-4">添加新资料</h3>
            <form onSubmit={handleAddMaterial} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">标题</label>
                <input
                  type="text"
                  value={newMaterial.title}
                  onChange={(e) => setNewMaterial({ ...newMaterial, title: e.target.value })}
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="输入资料标题"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">内容</label>
                <textarea
                  value={newMaterial.content}
                  onChange={(e) => setNewMaterial({ ...newMaterial, content: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
                  placeholder="输入资料内容"
                />
              </div>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border border-warm-200 text-warm-700 rounded-lg hover:bg-warm-50 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                >
                  添加
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="border-2 border-dashed border-primary-300 rounded-xl p-6 text-center hover:border-primary-400 hover:bg-primary-50 transition"
          >
            <span className="text-primary-600 font-medium">+ 添加新资料</span>
          </button>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : materials.map((material) => (
            <div key={material.id} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-medium text-warm-900">{material.title}</h3>
                <span className="text-xs px-2 py-1 bg-warm-100 text-warm-600 rounded-full">
                  {material.type}
                </span>
              </div>
              {material.content && (
                <p className="text-warm-600 mb-4 whitespace-pre-wrap">{material.content}</p>
              )}
              <span className="text-warm-400 text-sm">
                {new Date(material.created_at).toLocaleString('zh-CN')}
              </span>
            </div>
          ))}

          {!isLoading && materials.length === 0 && !showAddForm && (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-warm-500">还没有添加任何资料</p>
              <p className="text-warm-400 text-sm mt-2">点击上方按钮开始添加</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

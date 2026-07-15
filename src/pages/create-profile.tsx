import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';

export default function CreateProfilePage() {
  const { user, loading } = useAuth();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !relation) {
      setError('请填写姓名和关系');
      return;
    }

    setIsSubmitting(true);

    const { error: insertError } = await supabase.from('memory_profiles').insert({
      user_id: user?.id,
      name,
      relation,
      gender: gender || null,
      birth_date: birthDate || null,
      short_description: description || null,
    });

    setIsSubmitting(false);

    if (insertError) {
      setError(insertError.message);
    } else {
      router.push('/dashboard');
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <p className="text-warm-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="text-warm-600 hover:text-warm-900 transition"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-semibold text-warm-900">记得</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-warm-900 mb-2">创建记忆体</h2>
          <p className="text-warm-600">为最重要的人建立数字记忆档案，让爱与回忆留存</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8">
          {error && (
            <div className="mb-6 px-4 py-2 bg-red-50 text-red-600 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                姓名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="请输入ta的姓名"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                与你的关系 <span className="text-red-500">*</span>
              </label>
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              >
                <option value="">请选择关系</option>
                <option value="父亲">父亲</option>
                <option value="母亲">母亲</option>
                <option value="丈夫">丈夫</option>
                <option value="妻子">妻子</option>
                <option value="儿子">儿子</option>
                <option value="女儿">女儿</option>
                <option value="祖父">祖父</option>
                <option value="祖母">祖母</option>
                <option value="外祖父">外祖父</option>
                <option value="外祖母">外祖母</option>
                <option value="兄弟姐妹">兄弟姐妹</option>
                <option value="朋友">朋友</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  性别
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                >
                  <option value="">请选择性别</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  出生日期
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                详细描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                maxLength={3000}
                className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition resize-none"
                placeholder="请详细描述ta的性格特点、爱好、人生经历、难忘的故事等。描述越细致，记忆体的人格就越立体。支持复制粘贴。"
              />
              <div className="text-right mt-2 text-sm text-warm-500">
                {description.length}/3000 字
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 px-6 py-3 border border-warm-200 text-warm-700 rounded-lg hover:bg-warm-50 transition font-medium"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '创建中...' : '创建记忆体'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

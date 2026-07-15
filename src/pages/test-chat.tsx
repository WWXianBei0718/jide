import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';

export default function TestChatPage() {
  const { user, loading, getToken } = useAuth();
  const [profileId, setProfileId] = useState('');
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId || !message || !user) return;

    setIsLoading(true);
    setResponse('');

    try {
      const token = await getToken();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ profileId, message }),
      });
      const data = await res.json();
      setResponse(data.content || '未收到响应');
    } catch (error) {
      setResponse('请求失败：' + error);
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
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
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-warm-600 hover:text-warm-900 transition"
            >
              ← 返回
            </button>
            <h1 className="text-xl font-semibold text-warm-900">记得</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-warm-900 mb-6">AI 聊天测试</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                记忆体 ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="请输入记忆体的 ID"
              />
              <p className="text-xs text-warm-500 mt-1">记忆体 ID 可在 Dashboard 页面查看</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                测试消息 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition resize-none"
                placeholder="输入你想测试的问题，例如：描述一下这个人的性格特点"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '发送中...' : '发送测试消息'}
            </button>
          </form>

          {response && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-warm-700 mb-3">AI 响应：</h3>
              <div className="bg-warm-50 rounded-lg p-4 text-warm-800 whitespace-pre-wrap">
                {response}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-4">测试评估清单</h3>
          <ul className="space-y-3 text-sm text-warm-700">
            <li className="flex items-start gap-2">
              <span className="text-primary-600">1.</span>
              <span><strong>人格一致性</strong>：AI 回答是否符合记忆体描述的性格特点？</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-600">2.</span>
              <span><strong>信息准确性</strong>：回答是否基于提供的资料，没有编造信息？</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-600">3.</span>
              <span><strong>语气自然度</strong>：回答是否自然、真实，不生硬？</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-600">4.</span>
              <span><strong>边界意识</strong>：是否明确表示自己是记忆助手，而非逝者本人？</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-600">5.</span>
              <span><strong>上下文理解</strong>：是否能理解问题的语境并给出相关回答？</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}

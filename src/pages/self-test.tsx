import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';

interface TestResult {
  id: string;
  name: string;
  category: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
  duration?: number;
}

export default function SelfTestPage() {
  const { user, loading, getToken } = useAuth();
  const router = useRouter();
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [overallStatus, setOverallStatus] = useState<'pending' | 'running' | 'success' | 'partial' | 'error'>('pending');
  const testProfileIdRef = useRef<string | null>(null);

  const tests = useMemo(() => [
    {
      id: 'auth-init',
      name: '认证初始化',
      category: '认证',
      run: async () => {
        if (loading) throw new Error('认证状态仍在加载');
        if (!user) throw new Error('用户未登录');
        return `当前用户: ${user.email}`;
      },
    },
    {
      id: 'token-get',
      name: '获取认证 Token',
      category: '认证',
      run: async () => {
        const token = await getToken();
        if (!token) throw new Error('无法获取 Token');
        return `Token 已获取 (长度: ${token.length})`;
      },
    },
    {
      id: 'supabase-connect',
      name: 'Supabase 连接',
      category: '数据库',
      run: async () => {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error('数据库连接失败');
        const data = await res.json();
        return `数据库状态: ${data.status}`;
      },
    },
    {
      id: 'profile-create',
      name: '创建记忆体',
      category: '业务功能',
      run: async () => {
        const token = await getToken();
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: '测试记忆体',
            relation: '朋友',
            gender: '女',
            short_description: '这是一个用于自测的测试记忆体',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '创建失败');
        testProfileIdRef.current = data.id;
        return `记忆体创建成功: ${data.id}`;
      },
    },
    {
      id: 'profile-list',
      name: '获取记忆体列表',
      category: '业务功能',
      run: async () => {
        const token = await getToken();
        const res = await fetch('/api/profile', {
          headers: { 
            'Authorization': `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '获取失败');
        return `记忆体数量: ${Array.isArray(data) ? data.length : 0}`;
      },
    },
    {
      id: 'profile-get',
      name: '获取单个记忆体',
      category: '业务功能',
      run: async () => {
        const profileId = testProfileIdRef.current;
        if (!profileId) return '跳过（依赖创建测试）';
        const token = await getToken();
        const res = await fetch(`/api/profile?id=${profileId}`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '获取失败');
        return `记忆体: ${data.name}`;
      },
    },
    {
      id: 'openai-api',
      name: 'OpenAI API',
      category: 'AI服务',
      run: async () => {
        const profileId = testProfileIdRef.current;
        if (!profileId) return '跳过（依赖创建测试）';
        const token = await getToken();
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            profileId,
            message: '你好',
            model: 'gpt-4o',
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        return `OpenAI API 响应正常 (${data.content.length} 字符)`;
      },
    },
    {
      id: 'elevenlabs-api',
      name: 'ElevenLabs API',
      category: 'AI服务',
      run: async () => {
        const token = await getToken();
        const res = await fetch('/api/voices', {
          headers: { 
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error('ElevenLabs API 调用失败');
        const data = await res.json();
        return `可用语音数: ${data.count}`;
      },
    },
    {
      id: 'profile-delete',
      name: '删除测试记忆体',
      category: '业务功能',
      run: async () => {
        const profileId = testProfileIdRef.current;
        if (!profileId) return '跳过（依赖创建测试）';
        const token = await getToken();
        const res = await fetch('/api/profile', {
          method: 'DELETE',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ id: profileId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '删除失败');
        testProfileIdRef.current = null;
        return '记忆体删除成功';
      },
    },
  ], [getToken, loading, user]);

  useEffect(() => {
    setResults(
      tests.map(t => ({
        id: t.id,
        name: t.name,
        category: t.category,
        status: 'pending' as const,
        message: '',
      }))
    );
  }, [tests]);

  const runTest = useCallback(async (testId: string): Promise<boolean> => {
    const test = tests.find(t => t.id === testId);
    if (!test) return false;

    setResults(prev =>
      prev.map(r => (r.id === testId ? { ...r, status: 'running', message: '测试中...' } : r))
    );

    const startTime = Date.now();
    try {
      const message = await test.run();
      const duration = Date.now() - startTime;
      setResults(prev =>
        prev.map(r =>
          r.id === testId
            ? { ...r, status: 'success', message, duration }
            : r
        )
      );
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      setResults(prev =>
        prev.map(r =>
          r.id === testId
            ? { ...r, status: 'error', message: error instanceof Error ? error.message : '未知错误', duration }
            : r
        )
      );
      return false;
    }
  }, [tests]);

  const runAllTests = async () => {
    setIsRunning(true);
    setOverallStatus('running');
    testProfileIdRef.current = null;

    let successCount = 0;
    let errorCount = 0;
    for (const test of tests) {
      const succeeded = await runTest(test.id);
      if (succeeded) successCount += 1;
      else errorCount += 1;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (errorCount === 0) {
      setOverallStatus('success');
    } else if (successCount > 0) {
      setOverallStatus('partial');
    } else {
      setOverallStatus('error');
    }

    setIsRunning(false);
  };

  const resetTests = () => {
    setResults(
      tests.map(t => ({
        id: t.id,
        name: t.name,
        category: t.category,
        status: 'pending' as const,
        message: '',
      }))
    );
    setOverallStatus('pending');
    testProfileIdRef.current = null;
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return 'bg-green-100 border-green-500 text-green-700';
      case 'error': return 'bg-red-100 border-red-500 text-red-700';
      case 'running': return 'bg-blue-100 border-blue-500 text-blue-700';
      default: return 'bg-gray-100 border-gray-300 text-gray-500';
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'running': return '⏳';
      default: return '○';
    }
  };

  const getOverallStatusText = () => {
    switch (overallStatus) {
      case 'success': return '全部通过';
      case 'partial': return '部分通过';
      case 'error': return '全部失败';
      case 'running': return '测试中...';
      default: return '未开始';
    }
  };

  const getOverallStatusColor = () => {
    switch (overallStatus) {
      case 'success': return 'text-green-600';
      case 'partial': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      case 'running': return 'text-blue-600';
      default: return 'text-gray-500';
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <p className="text-warm-600">请先登录...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-warm-600 hover:text-warm-900 transition"
            >
              ← 返回
            </button>
            <h1 className="text-xl font-semibold text-warm-900">记得 - 项目自测</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-warm-900 mb-2">综合功能测试</h2>
          <p className="text-warm-600">自动测试项目所有核心功能，验证系统完整性</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-warm-900">测试状态</h3>
              <p className={`text-xl font-bold mt-1 ${getOverallStatusColor()}`}>
                {getOverallStatusText()}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={runAllTests}
                disabled={isRunning}
                className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? '测试中...' : '运行全部测试'}
              </button>
              <button
                onClick={resetTests}
                className="px-6 py-3 bg-warm-100 text-warm-700 rounded-lg hover:bg-warm-200 transition font-medium"
              >
                重置
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {tests.map(test => {
              const result = results.find(r => r.id === test.id);
              if (!result) return null;
              return (
                <div
                  key={test.id}
                  className={`p-4 rounded-lg border-2 ${getStatusColor(result.status)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold">{getStatusIcon(result.status)}</span>
                      <div>
                        <div className="font-medium">{result.name}</div>
                        <div className="text-sm opacity-75">{result.category}</div>
                      </div>
                    </div>
                    {result.duration && (
                      <span className="text-sm opacity-75">{result.duration}ms</span>
                    )}
                  </div>
                  {result.message && (
                    <div className="mt-2 text-sm">{result.message}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-4">项目信息</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-warm-50 rounded-lg">
              <div className="text-sm text-warm-500 mb-1">技术栈</div>
              <div className="text-warm-800">Next.js 15 + React + TypeScript</div>
            </div>
            <div className="p-4 bg-warm-50 rounded-lg">
              <div className="text-sm text-warm-500 mb-1">数据库</div>
              <div className="text-warm-800">Supabase (PostgreSQL)</div>
            </div>
            <div className="p-4 bg-warm-50 rounded-lg">
              <div className="text-sm text-warm-500 mb-1">AI 模型</div>
              <div className="text-warm-800">GPT-4o / GPT-3.5</div>
            </div>
            <div className="p-4 bg-warm-50 rounded-lg">
              <div className="text-sm text-warm-500 mb-1">语音服务</div>
              <div className="text-warm-800">ElevenLabs (声音克隆)</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

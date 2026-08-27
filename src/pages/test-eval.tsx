import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV === 'production') {
    return { notFound: true };
  }

  return { props: {} };
};

interface TestResult {
  id: string;
  model: string;
  temperature: number;
  message: string;
  response: string;
  timestamp: string;
  scores: {
    personalityConsistency: number;
    accuracy: number;
    naturalness: number;
    emotionalConnection: number;
  };
}

const MODEL_OPTIONS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini（当前实际模型）' },
];

const TEST_PROMPTS = [
  '描述一下你平时的性格特点',
  '你最喜欢的爱好是什么？为什么？',
  '如果我遇到困难，你会怎么安慰我？',
  '回忆一件你印象最深的事情',
  '用你自己的方式向我问好',
];

export default function TestEvalPage() {
  const { user, loading, getToken } = useAuth();
  const router = useRouter();
  const { profileId } = router.query;

  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(600);
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [currentResult, setCurrentResult] = useState<TestResult | null>(null);

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
        body: JSON.stringify({ 
          profileId, 
          message, 
          model: selectedModel,
          temperature,
          maxTokens,
        }),
      });
      const data = await res.json();

      if (data.content) {
        setResponse(data.content);
        setCurrentResult({
          id: Date.now().toString(),
          model: selectedModel,
          temperature,
          message,
          response: data.content,
          timestamp: new Date().toLocaleString('zh-CN'),
          scores: {
            personalityConsistency: 0,
            accuracy: 0,
            naturalness: 0,
            emotionalConnection: 0,
          },
        });
      } else {
        setResponse(data.error || '未收到响应');
      }
    } catch (error) {
      setResponse('请求失败：' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveResult = () => {
    if (currentResult) {
      setTestResults(prev => [currentResult, ...prev]);
      setCurrentResult(null);
      setResponse('');
    }
  };

  const handleScoreChange = (category: keyof TestResult['scores'], value: number) => {
    if (currentResult) {
      setCurrentResult(prev => ({
        ...prev!,
        scores: {
          ...prev!.scores,
          [category]: value,
        },
      }));
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
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-warm-900 mb-2">AI 回复测试与评估</h2>
          <p className="text-warm-600">使用当前实际模型调整安全参数，测试人格模拟效果</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  选择模型
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                >
                  {MODEL_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  温度参数 (Temperature): {temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-warm-500 mt-1">
                  <span>精确</span>
                  <span>创意</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                最大 Token 数: {maxTokens}
              </label>
              <input
                type="range"
                min="100"
                max="1000"
                step="100"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                测试消息
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {TEST_PROMPTS.map((prompt, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setMessage(prompt)}
                    className="px-3 py-1 text-sm bg-warm-100 text-warm-700 rounded-full hover:bg-warm-200 transition"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition resize-none"
                placeholder="输入测试问题..."
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !message}
              className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '测试中...' : '发送测试'}
            </button>
          </form>
        </div>

        {response && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-warm-900">AI 响应</h3>
              <span className="text-sm text-warm-500">模型: {selectedModel}</span>
            </div>
            <div className="bg-warm-50 rounded-lg p-4 text-warm-800 whitespace-pre-wrap mb-4">
              {response}
            </div>

            {currentResult && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-warm-700 mb-3">评估打分 (1-5分)</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    { key: 'personalityConsistency', label: '人格一致性' },
                    { key: 'accuracy', label: '信息准确性' },
                    { key: 'naturalness', label: '语气自然度' },
                    { key: 'emotionalConnection', label: '情感连接' },
                  ].map(item => (
                    <div key={item.key}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-warm-600">{item.label}</span>
                        <span className="text-primary-600 font-medium">
                          {currentResult.scores[item.key as keyof TestResult['scores']]}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={currentResult.scores[item.key as keyof TestResult['scores']]}
                        onChange={(e) => handleScoreChange(
                          item.key as keyof TestResult['scores'], 
                          parseInt(e.target.value)
                        )}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={saveResult}
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
                >
                  保存测试结果
                </button>
              </div>
            )}
          </div>
        )}

        {testResults.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-warm-900 mb-4">测试历史记录</h3>
            <div className="space-y-4">
              {testResults.map(result => (
                <div key={result.id} className="p-4 bg-warm-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-primary-600">{result.model}</span>
                    <span className="text-xs text-warm-500">{result.timestamp}</span>
                  </div>
                  <div className="text-sm text-warm-700 mb-2">
                    <strong>问题:</strong> {result.message}
                  </div>
                  <div className="text-sm text-warm-800 mb-2 line-clamp-2">
                    <strong>回答:</strong> {result.response}
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-warm-600">人格: {result.scores.personalityConsistency}</span>
                    <span className="text-warm-600">准确: {result.scores.accuracy}</span>
                    <span className="text-warm-600">自然: {result.scores.naturalness}</span>
                    <span className="text-warm-600">情感: {result.scores.emotionalConnection}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import type { MemoryProfile, Message } from '@/types';

export default function ChatPage() {
  const { user, loading, getToken } = useAuth();
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { id } = router.query;

  const authorizedFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const token = await getToken();
    if (!token) throw new Error('登录已失效，请重新登录');
    return fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  }, [getToken]);

  const fetchProfile = useCallback(async () => {
    if (!id) return;
    setIsProfileLoading(true);
    try {
      const response = await authorizedFetch(`/api/profile?id=${encodeURIComponent(String(id))}`);
      if (!response.ok) {
        setProfile(null);
        return;
      }
      setProfile(await response.json());
    } catch {
      setProfile(null);
    } finally {
      setIsProfileLoading(false);
    }
  }, [authorizedFetch, id]);

  const fetchMessages = useCallback(async () => {
    if (!id) return;
    const response = await authorizedFetch(`/api/messages?profileId=${encodeURIComponent(String(id))}`);
    if (response.ok) setMessages(await response.json());
  }, [authorizedFetch, id]);

  useEffect(() => {
    if (loading || !id) return;

    if (!user) {
      router.push('/');
      return;
    }

    fetchProfile();
    fetchMessages();
  }, [user, loading, id, router, fetchProfile, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || !user || !id) return;

    const messageText = inputValue.trim();
    const pendingId = `pending-${Date.now()}`;

    const userMessage: Message = {
      id: pendingId,
      conversation_id: '',
      memory_profile_id: id as string,
      user_id: user.id,
      role: 'user',
      content: messageText,
      retrieved_context: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await authorizedFetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: id,
          message: messageText,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '发送失败');

      setMessages((prev) => [
        ...prev.map((item) => item.id === pendingId ? data.userMessage : item),
        data.assistantMessage,
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        conversation_id: '',
        memory_profile_id: id as string,
        user_id: user.id,
        role: 'assistant',
        content: '抱歉，我现在无法回答您的问题，请稍后再试。',
        retrieved_context: null,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSynthesize = async (message: Message) => {
    if (!id || !profile?.voice_id || !message.id) return;
    setAudioLoadingId(message.id);
    setAudioError('');
    try {
      const response = await authorizedFetch('/api/voice-synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id, text: message.content }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '语音生成失败');
      }
      const url = URL.createObjectURL(await response.blob());
      setAudioUrls((current) => ({ ...current, [message.id]: url }));
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : '语音生成失败');
    } finally {
      setAudioLoadingId(null);
    }
  };

  if (loading || !user || isProfileLoading) {
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
        <main className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-warm-600">记忆体不存在或你无权访问</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => router.back()} className="text-warm-600 hover:text-warm-900">
            ← 返回
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-lg text-primary-600">
                {profile.name?.charAt(0) || '?'}
              </span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-warm-900">{profile.name}</h1>
              <p className="text-sm text-warm-500">记忆体对话</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {audioError && (
          <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg">{audioError}</div>
        )}
        <div className="bg-white rounded-2xl shadow-sm h-full flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-warm-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl text-warm-400">?</span>
                </div>
                <h3 className="text-lg font-medium text-warm-900 mb-2">开始对话</h3>
                <p className="text-warm-500 text-sm">
                  您可以询问关于 {profile.name} 的问题，我会根据已上传的资料进行回答
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id || Math.random()}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-xl ${
                      message.role === 'user'
                        ? 'bg-primary-600 text-white rounded-tr-sm'
                        : 'bg-warm-100 text-warm-900 rounded-tl-sm'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    {message.role === 'assistant' && profile?.voice_id && (
                      <div className="mt-3">
                        {audioUrls[message.id] ? (
                          <audio src={audioUrls[message.id]} controls className="max-w-full h-9">
                            您的浏览器不支持音频播放。
                          </audio>
                        ) : (
                          <button
                            onClick={() => handleSynthesize(message)}
                            disabled={audioLoadingId === message.id}
                            className="text-xs text-primary-700 hover:text-primary-800 disabled:opacity-50"
                          >
                            {audioLoadingId === message.id ? '正在生成声音…' : `用 ${profile.name} 的声音播放`}
                          </button>
                        )}
                      </div>
                    )}
                    <p className="text-xs mt-1 opacity-60">
                      {new Date(message.created_at).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-warm-100 text-warm-900 px-4 py-3 rounded-xl rounded-tl-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-warm-100 p-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入您的问题..."
                className="flex-1 px-4 py-3 border border-warm-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isTyping}
                className="px-6 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </div>
            <p className="text-warm-400 text-xs text-center mt-3">
              回答基于已上传的资料，若资料不足可能无法准确回答
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

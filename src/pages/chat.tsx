import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
  createdAt: string;
}

export default function ChatPage() {
  const { user, loading, getToken } = useAuth();
  const router = useRouter();
  const { profileId } = router.query;
  
  const [profile, setProfile] = useState<{ name: string; voice_ready: boolean } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchProfile = useCallback(async () => {
    if (!profileId || !user) return;
    const token = await getToken();
    const response = await fetch(`/api/profile?id=${encodeURIComponent(String(profileId))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) setProfile(await response.json());
  }, [getToken, profileId, user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSend = async () => {
    if (!inputMessage.trim() || !profileId || !user) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const token = await getToken();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ profileId, message: inputMessage.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.content) {
        let audioUrl: string | undefined;
        
        if (profile?.voice_ready) {
          try {
            const audioResponse = await fetch('/api/voice-synthesize', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ profileId, text: data.content }),
            });

            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              audioUrl = URL.createObjectURL(audioBlob);
            }
          } catch (audioError) {
            console.error('Failed to generate audio:', audioError);
          }
        }

        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content,
          audioUrl,
          createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleAudio = (audioUrl: string, messageId: string) => {
    if (isPlaying === messageId) {
      audioRef.current?.pause();
      setIsPlaying(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(null);
      audioRef.current.play();
      setIsPlaying(messageId);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
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

  if (!profileId) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <p className="text-warm-600">请从记忆体详情页进入聊天</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-warm-600 hover:text-warm-900 transition"
            >
              ← 返回
            </button>
            <div>
              <h1 className="text-xl font-semibold text-warm-900">记得</h1>
              <p className="text-sm text-warm-500">与 {profile?.name} 对话</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-warm-600 hover:text-warm-900 transition"
          >
            退出登录
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-warm-500">开始与 {profile?.name} 对话吧</p>
                <p className="text-sm text-warm-400 mt-2">
                  {profile?.voice_ready ? '语音已就绪，可以播放回复' : '语音尚未训练，仅支持文字回复'}
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                      message.role === 'user' ? 'bg-primary-600' : 'bg-warm-400'
                    }`}
                  >
                    {message.role === 'user' ? '我' : profile?.name?.[0]}
                  </div>
                  <div
                    className={`max-w-[75%] ${
                      message.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`px-4 py-3 rounded-2xl ${
                        message.role === 'user'
                          ? 'bg-primary-600 text-white rounded-tr-sm'
                          : 'bg-white text-warm-800 rounded-tl-sm shadow-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {message.role === 'assistant' && message.audioUrl && (
                      <button
                        onClick={() => message.audioUrl && toggleAudio(message.audioUrl, message.id)}
                        className="mt-2 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition"
                      >
                        <svg
                          className={`w-5 h-5 ${isPlaying === message.id ? 'animate-pulse' : ''}`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          {isPlaying === message.id ? (
                            <path d="M11 5L6 9H2v6h4l5 4V5z" />
                          ) : (
                            <path d="M8 5v14l11-7z" />
                          )}
                        </svg>
                        {isPlaying === message.id ? '停止播放' : '播放语音'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-warm-400 flex items-center justify-center text-white text-sm font-medium">
                  {profile?.name?.[0]}
                </div>
                <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-warm-100 sticky bottom-0">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex gap-3">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              rows={2}
              className="flex-1 px-4 py-3 border border-warm-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition resize-none"
              placeholder={`输入消息，与 ${profile?.name} 对话...`}
            />
            <button
              onClick={handleSend}
              disabled={!inputMessage.trim() || isLoading}
              className="px-6 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

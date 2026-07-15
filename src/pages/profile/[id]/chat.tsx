import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import type { MemoryProfile, Message } from '@/types';

export default function ChatPage() {
  const { user, loading, getToken } = useAuth();
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { id } = router.query;

  useEffect(() => {
    if (!user || !id) {
      router.push('/');
      return;
    }

    fetchProfile();
    fetchMessages();
  }, [user, id, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('memory_profiles')
      .select('*')
      .eq('id', id)
      .single();
    setProfile(data || null);
  };

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('memory_profile_id', id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !user || !id) return;

    const userMessage: Message = {
      id: '',
      conversation_id: '',
      memory_profile_id: id as string,
      user_id: user.id,
      role: 'user',
      content: inputValue.trim(),
      retrieved_context: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const { data: savedMessage } = await supabase.from('messages').insert({
        memory_profile_id: id,
        user_id: user.id,
        role: 'user',
        content: inputValue.trim(),
      }).select().single();

      if (savedMessage) {
        setMessages((prev) => prev.map((m) => 
          m.content === inputValue.trim() && m.role === 'user' 
            ? { ...m, id: savedMessage.id } 
            : m
        ));
      }

      const token = await getToken();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          profileId: id,
          message: inputValue.trim(),
        }),
      });

      const { content } = await response.json();

      const { data: assistantMessage } = await supabase.from('messages').insert({
        memory_profile_id: id,
        user_id: user.id,
        role: 'assistant',
        content,
      }).select().single();

      if (assistantMessage) {
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, {
        id: '',
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

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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
                {profile?.name?.charAt(0) || '?'}
              </span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-warm-900">{profile?.name}</h1>
              <p className="text-sm text-warm-500">记忆体对话</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm h-full flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-warm-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl text-warm-400">?</span>
                </div>
                <h3 className="text-lg font-medium text-warm-900 mb-2">开始对话</h3>
                <p className="text-warm-500 text-sm">
                  您可以询问关于 {profile?.name} 的问题，我会根据已上传的资料进行回答
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

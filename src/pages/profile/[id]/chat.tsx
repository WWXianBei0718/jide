import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import {
  MESSAGE_FEEDBACK_REASON_LABELS,
  MESSAGE_FEEDBACK_REASONS,
  type MessageFeedbackReason,
  type MessageFeedbackVerdict,
} from '@/lib/message-feedback';
import type { MemoryProfile, Message, MessageFeedback } from '@/types';

interface AiConsentStatus {
  consented: boolean;
  policyVersion: string;
  notice: string;
}

export default function ChatPage() {
  const { user, loading, getToken } = useAuth();
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, MessageFeedback>>({});
  const [feedbackDraftMessageId, setFeedbackDraftMessageId] = useState<string | null>(null);
  const [feedbackDraftReasons, setFeedbackDraftReasons] = useState<MessageFeedbackReason[]>([]);
  const [feedbackDraftNote, setFeedbackDraftNote] = useState('');
  const [feedbackBusyId, setFeedbackBusyId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState('');
  const [chatError, setChatError] = useState('');
  const [consentError, setConsentError] = useState('');
  const [consentStatus, setConsentStatus] = useState<AiConsentStatus | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
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

  const fetchFeedback = useCallback(async () => {
    if (!id) return;
    try {
      const response = await authorizedFetch(`/api/message-feedback?profileId=${encodeURIComponent(String(id))}`);
      if (!response.ok) throw new Error('Failed to fetch feedback');
      const feedback = await response.json() as MessageFeedback[];
      setFeedbackByMessage(Object.fromEntries(
        feedback.map((item) => [item.message_id, item])
      ));
      setFeedbackError('');
    } catch {
      setFeedbackError('暂时无法读取回复评价');
    }
  }, [authorizedFetch, id]);

  const fetchConsent = useCallback(async () => {
    if (!id) return;
    try {
      const response = await authorizedFetch(`/api/ai-consent?profileId=${encodeURIComponent(String(id))}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '无法读取 AI 数据处理授权');
      setConsentStatus(data);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : '无法读取 AI 数据处理授权');
    }
  }, [authorizedFetch, id]);

  useEffect(() => {
    if (loading || !id) return;

    if (!user) {
      router.push('/');
      return;
    }

    fetchProfile();
    fetchMessages();
    fetchConsent();
    fetchFeedback();
  }, [user, loading, id, router, fetchProfile, fetchMessages, fetchConsent, fetchFeedback]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || !user || !id || !consentStatus?.consented) return;

    const messageText = inputValue.trim();
    const pendingId = `pending-${Date.now()}`;

    const userMessage: Message = {
      id: pendingId,
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    setChatError('');

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
      setMessages((prev) => prev.filter((item) => item.id !== pendingId));
      setChatError(error instanceof Error ? error.message : '发送失败');
    } finally {
      setIsTyping(false);
    }
  };

  const handleGrantConsent = async () => {
    if (!id || !consentStatus || !consentAccepted) return;
    setConsentBusy(true);
    setConsentError('');
    try {
      const response = await authorizedFetch('/api/ai-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: id,
          accepted: true,
          policyVersion: consentStatus.policyVersion,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '无法保存 AI 数据处理授权');
      setConsentStatus((current) => current ? { ...current, consented: true } : current);
      setConsentAccepted(false);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : '无法保存 AI 数据处理授权');
    } finally {
      setConsentBusy(false);
    }
  };

  const handleWithdrawConsent = async () => {
    if (!id || !window.confirm('撤回后将停止新的 AI 对话和语义索引。已保存的原始资料不会自动删除。确定撤回吗？')) {
      return;
    }
    setConsentBusy(true);
    setConsentError('');
    try {
      const response = await authorizedFetch('/api/ai-consent', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '无法撤回 AI 数据处理授权');
      setConsentStatus((current) => current ? { ...current, consented: false } : current);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : '无法撤回 AI 数据处理授权');
    } finally {
      setConsentBusy(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSynthesize = async (message: Message) => {
    if (!id || !profile?.voice_ready || !message.id) return;
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

  const saveFeedback = async (
    messageId: string,
    verdict: MessageFeedbackVerdict,
    reasons: MessageFeedbackReason[] = [],
    note = ''
  ) => {
    if (!id) return;
    setFeedbackBusyId(messageId);
    setFeedbackError('');
    try {
      const response = await authorizedFetch('/api/message-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: id,
          messageId,
          verdict,
          reasons,
          note,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save feedback');
      setFeedbackByMessage((current) => ({ ...current, [messageId]: data }));
      setFeedbackDraftMessageId(null);
      setFeedbackDraftReasons([]);
      setFeedbackDraftNote('');
    } catch {
      setFeedbackError('评价保存失败，请稍后重试');
    } finally {
      setFeedbackBusyId(null);
    }
  };

  const removeFeedback = async (messageId: string) => {
    if (!id) return;
    setFeedbackBusyId(messageId);
    setFeedbackError('');
    try {
      const response = await authorizedFetch('/api/message-feedback', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id, messageId }),
      });
      if (!response.ok) throw new Error('Failed to remove feedback');
      setFeedbackByMessage((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      setFeedbackDraftMessageId(null);
    } catch {
      setFeedbackError('评价删除失败，请稍后重试');
    } finally {
      setFeedbackBusyId(null);
    }
  };

  const handleLike = (messageId: string) => {
    if (feedbackByMessage[messageId]?.verdict === 'like') {
      removeFeedback(messageId);
      return;
    }
    saveFeedback(messageId, 'like');
  };

  const openUnlikeFeedback = (messageId: string) => {
    if (feedbackDraftMessageId === messageId) {
      setFeedbackDraftMessageId(null);
      return;
    }
    const existing = feedbackByMessage[messageId];
    setFeedbackDraftMessageId(messageId);
    setFeedbackDraftReasons(existing?.verdict === 'unlike' ? existing.reasons : []);
    setFeedbackDraftNote(existing?.verdict === 'unlike' ? existing.note || '' : '');
  };

  const toggleFeedbackReason = (reason: MessageFeedbackReason) => {
    setFeedbackDraftReasons((current) =>
      current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason]
    );
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
        {chatError && (
          <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg">{chatError}</div>
        )}
        {consentError && (
          <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg">{consentError}</div>
        )}
        {feedbackError && (
          <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg">{feedbackError}</div>
        )}

        {consentStatus && !consentStatus.consented && (
          <section className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="font-medium text-warm-900">开始 AI 对话前，请确认数据处理方式</h2>
            <p className="text-sm text-warm-700 mt-3 leading-6">{consentStatus.notice}</p>
            <label className="flex items-start gap-3 text-sm text-warm-800 mt-4">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
                className="mt-1"
              />
              <span>我已阅读并同意以上当前版本告知。</span>
            </label>
            <button
              type="button"
              onClick={handleGrantConsent}
              disabled={!consentAccepted || consentBusy}
              className="mt-4 px-5 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-50"
            >
              {consentBusy ? '正在保存…' : '同意并启用 AI 对话'}
            </button>
          </section>
        )}

        {consentStatus?.consented && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-green-50 px-4 py-3 rounded-lg text-sm">
            <span className="text-green-800">AI 数据处理授权已生效；回复仍是 AI 模拟。</span>
            <button
              type="button"
              onClick={handleWithdrawConsent}
              disabled={consentBusy}
              className="text-warm-600 hover:text-warm-900 disabled:opacity-50"
            >
              撤回授权
            </button>
          </div>
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
                    {message.role === 'assistant' && profile?.voice_ready && (
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
                    {message.role === 'assistant' && !message.id.startsWith('pending-') && (
                      <div className="mt-3 pt-2 border-t border-warm-200">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-warm-500">这条回复像吗？</span>
                          <button
                            type="button"
                            onClick={() => handleLike(message.id)}
                            disabled={feedbackBusyId === message.id}
                            aria-pressed={feedbackByMessage[message.id]?.verdict === 'like'}
                            className={`px-2 py-1 rounded-md disabled:opacity-50 ${
                              feedbackByMessage[message.id]?.verdict === 'like'
                                ? 'bg-green-100 text-green-800'
                                : 'text-warm-600 hover:bg-white'
                            }`}
                          >
                            像
                          </button>
                          <button
                            type="button"
                            onClick={() => openUnlikeFeedback(message.id)}
                            disabled={feedbackBusyId === message.id}
                            aria-pressed={feedbackByMessage[message.id]?.verdict === 'unlike'}
                            className={`px-2 py-1 rounded-md disabled:opacity-50 ${
                              feedbackByMessage[message.id]?.verdict === 'unlike'
                                ? 'bg-amber-100 text-amber-800'
                                : 'text-warm-600 hover:bg-white'
                            }`}
                          >
                            不像
                          </button>
                          {feedbackByMessage[message.id] && (
                            <button
                              type="button"
                              onClick={() => removeFeedback(message.id)}
                              disabled={feedbackBusyId === message.id}
                              className="ml-auto text-warm-400 hover:text-warm-700 disabled:opacity-50"
                            >
                              清除
                            </button>
                          )}
                        </div>

                        {feedbackDraftMessageId === message.id && (
                          <div className="mt-3 bg-white/70 rounded-lg p-3 text-xs">
                            <p className="text-warm-700 mb-2">哪里不像？可多选</p>
                            <div className="flex flex-wrap gap-2">
                              {MESSAGE_FEEDBACK_REASONS.map((reason) => (
                                <button
                                  key={reason}
                                  type="button"
                                  onClick={() => toggleFeedbackReason(reason)}
                                  aria-pressed={feedbackDraftReasons.includes(reason)}
                                  className={`px-2 py-1 rounded-full border ${
                                    feedbackDraftReasons.includes(reason)
                                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                                      : 'border-warm-200 text-warm-600'
                                  }`}
                                >
                                  {MESSAGE_FEEDBACK_REASON_LABELS[reason]}
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={feedbackDraftNote}
                              onChange={(event) => setFeedbackDraftNote(event.target.value.slice(0, 500))}
                              maxLength={500}
                              rows={2}
                              placeholder="可选：具体说说哪句不像。这不会自动改写人物资料。"
                              className="mt-3 w-full px-3 py-2 border border-warm-200 rounded-lg bg-white text-warm-900 outline-none focus:ring-2 focus:ring-primary-500"
                            />
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <span className="text-warm-400">{feedbackDraftNote.length}/500</span>
                              <button
                                type="button"
                                onClick={() => saveFeedback(
                                  message.id,
                                  'unlike',
                                  feedbackDraftReasons,
                                  feedbackDraftNote
                                )}
                                disabled={feedbackBusyId === message.id}
                                className="px-3 py-1.5 bg-primary-600 text-white rounded-md disabled:opacity-50"
                              >
                                {feedbackBusyId === message.id ? '保存中…' : '保存评价'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
                disabled={!consentStatus?.consented}
                className="flex-1 px-4 py-3 border border-warm-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isTyping || !consentStatus?.consented}
                className="px-6 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </div>
            <p className="text-warm-400 text-xs text-center mt-3">
              回答基于已上传的资料，是 AI 模拟而非真实人物本人；资料不足时可能无法准确回答
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

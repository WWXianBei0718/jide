import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beginApiRequest, logApiError } from '@/lib/api-observability';
import { adminSupabase } from '@/lib/admin-supabase';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { resolveChatOptions } from '@/lib/chat-policy';
import { consumeChatQuota } from '@/lib/chat-rate-limit';
import {
  MAX_RETRIEVAL_MATERIALS,
  MEMORY_RETRIEVAL_VERSION,
  mergeRetrievedMaterialChunks,
  retrieveRelevantMaterialChunks,
  type RetrievedMaterialChunk,
} from '@/lib/memory-retrieval';
import { createEmbeddings } from '@/lib/ai-embeddings';
import { getChatProvider, getEmbeddingProvider } from '@/lib/ai-provider';
import { vectorLiteral } from '@/lib/memory-indexing';
import { postOpenAiJson } from '@/lib/openai-http';
import {
  buildPersonaPrompt,
  PERSONA_CONTEXT_VERSION,
  prepareConversationContext,
} from '@/lib/persona-context';
import { hasActiveAiDataProcessingConsent } from '@/lib/ai-processing-consent';

interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const requestContext = beginApiRequest(req, res, 'api.chat');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  const { profileId, message, model, temperature, maxTokens } = req.body;

  if (typeof profileId !== 'string' || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Missing required fields: profileId and message' });
  }

  if (message.length > 4000) {
    return res.status(400).json({ error: 'Message must be 4000 characters or fewer' });
  }

  const chatOptions = resolveChatOptions({ model, temperature, maxTokens });
  if (!chatOptions.ok) {
    return res.status(400).json({ error: chatOptions.error });
  }

  const {
    model: selectedModel,
    temperature: selectedTemperature,
    maxTokens: selectedMaxTokens,
  } = chatOptions.options;

  const chatProvider = getChatProvider();
  if (!chatProvider.apiKey) {
    return res.status(503).json({ error: 'AI 服务尚未完成配置' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  if (!await hasActiveAiDataProcessingConsent(user.client, profileId)) {
    return res.status(403).json({
      error: '请先阅读并同意当前 AI 数据处理告知，再开始对话',
      code: 'ai_processing_consent_required',
    });
  }

  const quota = await consumeChatQuota(user.client);
  if (quota.status === 'unavailable') {
    return res.status(503).json({ error: 'Chat usage protection is temporarily unavailable' });
  }
  if (quota.status === 'limited') {
    res.setHeader('Retry-After', quota.retryAfterSeconds.toString());
    return res.status(429).json({
      error: quota.scope === 'minute'
        ? 'Chat rate limit reached. Please wait before trying again.'
        : 'Daily chat limit reached. Please try again later.',
      limit: quota.scope,
      retryAfterSeconds: quota.retryAfterSeconds,
    });
  }

  let savedUserMessage: PersistedMessage | null = null;

  try {
    const { data: savedUserMessageRow, error: userMessageError } = await user.client
      .from('messages')
      .insert({
        memory_profile_id: profileId,
        user_id: user.id,
        role: 'user',
        content: message.trim(),
      })
      .select('id, role, content, created_at')
      .single();

    if (userMessageError || !savedUserMessageRow) {
      return res.status(500).json({ error: 'Failed to save user message' });
    }
    savedUserMessage = savedUserMessageRow as PersistedMessage;

    const { data: profile, error: profileError } = await user.client
      .from('memory_profiles')
      .select('name, relation, gender, short_description')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      await logApiError(requestContext, 'profile.fetch_failed', {
        outcome: profileError ? 'database_error' : 'not_found',
      });
      return res.status(404).json({ error: 'Profile not found', userMessage: savedUserMessage });
    }

    const { data: materials, error: materialsError } = await user.client
      .from('memory_materials')
      .select('id, title, type, content')
      .eq('memory_profile_id', profileId)
      .not('content', 'is', null)
      .order('created_at', { ascending: false })
      .limit(MAX_RETRIEVAL_MATERIALS);

    if (materialsError) {
      await logApiError(requestContext, 'materials.fetch_failed', {
        outcome: 'lexical_context_unavailable',
      });
    }

    const { data: recentMessages, error: recentMessagesError } = await user.client
      .from('messages')
      .select('role, content')
      .eq('memory_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(12);

    if (recentMessagesError) {
      await logApiError(requestContext, 'conversation.fetch_failed', {
        outcome: 'history_unavailable',
      });
    }

    const lexicalMaterials = retrieveRelevantMaterialChunks(materials || [], message.trim());
    const vectorRetrieval = await retrieveVectorChunks(
      user.client,
      profileId,
      message.trim(),
      requestContext
    );
    if (vectorRetrieval.status === 'unavailable') {
      return res.status(503).json({
        error: '语义记忆暂时不可用。为避免引用错误资料，本次未生成回答，请稍后重试。',
        mode: 'memory_retrieval_unavailable',
        userMessage: savedUserMessage,
      });
    }
    const vectorMaterials = vectorRetrieval.chunks;
    const retrievedMaterials = mergeRetrievedMaterialChunks(vectorMaterials, lexicalMaterials);
    const retrievalStrategy = vectorRetrieval.status === 'ready'
      ? 'vector+lexical'
      : 'lexical-unindexed';
    const personaContext = buildPersonaPrompt(profile, retrievedMaterials);
    const conversationContext = prepareConversationContext(
      recentMessages && recentMessages.length > 0
        ? [...recentMessages].reverse()
        : [{ role: 'user', content: message.trim() }]
    );

    const response = await postOpenAiJson<{
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    }>(`${chatProvider.baseUrl}/chat/completions`, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${chatProvider.apiKey}`,
      }, {
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: personaContext.prompt,
          },
          ...conversationContext,
        ],
        temperature: selectedTemperature,
        presence_penalty: 0.2,
        frequency_penalty: 0.1,
        max_tokens: selectedMaxTokens,
      }
    );
    const data = response.data;
    
    if (!response.ok) {
      await logApiError(requestContext, 'ai_provider.request_failed', {
        outcome: chatProvider.name,
        providerStatus: response.status,
      });
      return res.status(response.status).json({
        error: response.status === 429
          ? 'AI 服务当前额度或请求频率受限，请稍后重试'
          : 'AI 服务暂时不可用，请稍后重试',
        model: selectedModel,
        userMessage: savedUserMessage,
      });
    }

    if (data.choices && data.choices[0]?.message?.content) {
      const content = data.choices[0].message.content as string;
      const { data: assistantMessage, error: assistantMessageError } = await adminSupabase
        .from('messages')
        .insert({
          memory_profile_id: profileId,
          user_id: user.id,
          role: 'assistant',
          content,
          retrieved_context: JSON.stringify({
            version: PERSONA_CONTEXT_VERSION,
            retrievalVersion: MEMORY_RETRIEVAL_VERSION,
            retrievalStrategy,
            materialIds: personaContext.sourceIds,
            sources: personaContext.sources,
            candidateMaterialCount: materials?.length || 0,
            vectorChunkCount: vectorMaterials.length,
            lexicalChunkCount: lexicalMaterials.length,
            retrievedChunkCount: retrievedMaterials.length,
            unavailableMaterialCount: personaContext.unavailableMaterialCount,
            conversationMessageCount: conversationContext.length,
          }),
        })
        .select('id, role, content, created_at')
        .single();

      if (assistantMessageError || !assistantMessage) {
        return res.status(500).json({
          error: 'Response generated but could not be saved',
          userMessage: savedUserMessage,
        });
      }

      return res.status(200).json({
        content,
        model: selectedModel,
        userMessage: savedUserMessage,
        assistantMessage,
      });
    } else {
      return res.status(500).json({
        content: '抱歉，我现在无法回答您的问题，请稍后再试。',
        model: selectedModel,
        userMessage: savedUserMessage,
      });
    }
  } catch (error) {
    await logApiError(requestContext, 'chat.request_failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return res.status(500).json({
      content: '抱歉，我现在无法回答您的问题，请稍后再试。',
      model: selectedModel,
      ...(savedUserMessage ? { userMessage: savedUserMessage } : {}),
    });
  }
}

interface VectorChunkRow {
  material_id: string;
  title: string;
  source_type: 'text' | 'image' | 'audio' | 'video' | 'document';
  chunk_text: string;
  chunk_index: number;
  similarity: number;
}

type VectorRetrievalResult =
  | { status: 'ready'; chunks: RetrievedMaterialChunk[] }
  | { status: 'not_indexed'; chunks: [] }
  | { status: 'unavailable'; chunks: [] };

async function retrieveVectorChunks(
  client: SupabaseClient,
  profileId: string,
  query: string,
  requestContext?: ReturnType<typeof beginApiRequest>
): Promise<VectorRetrievalResult> {
  const provider = getEmbeddingProvider();
  const { data: indexedChunks, error: indexedChunksError } = await client
    .from('memory_chunks')
    .select('id')
    .eq('memory_profile_id', profileId)
    .eq('embedding_model', provider.embeddingModel)
    .not('embedding', 'is', null)
    .limit(1);

  if (indexedChunksError) {
    if (requestContext) {
      await logApiError(requestContext, 'memory.vector_index_check_failed', {
        outcome: 'restricted_mode',
      });
    }
    return { status: 'unavailable', chunks: [] };
  }
  if (!indexedChunks?.length) return { status: 'not_indexed', chunks: [] };

  try {
    const [queryEmbedding] = await createEmbeddings([query]);
    const baseSearchArguments = {
      p_memory_profile_id: profileId,
      p_query_embedding: vectorLiteral(queryEmbedding),
      p_match_count: 10,
      p_min_similarity: 0.2,
    };
    const searchArguments =
      provider.name === 'qwen'
        ? { ...baseSearchArguments, p_embedding_model: provider.embeddingModel }
        : baseSearchArguments;
    const { data, error } = await client.rpc('match_memory_chunks', searchArguments);
    if (error) throw new Error('Vector memory search failed');

    return {
      status: 'ready',
      chunks: ((data || []) as VectorChunkRow[]).map((row) => ({
        id: row.material_id,
        title: `${row.title}（语义片段 ${row.chunk_index + 1}）`,
        type: row.source_type,
        content: row.chunk_text,
        chunkIndex: row.chunk_index,
        totalChunks: 0,
        relevanceScore: Number(row.similarity.toFixed(4)),
      })),
    };
  } catch (error) {
    if (requestContext) {
      await logApiError(requestContext, 'memory.vector_unavailable', {
        errorName: error instanceof Error ? error.name : 'unknown',
        outcome: 'restricted_mode',
      });
    }
    return { status: 'unavailable', chunks: [] };
  }
}

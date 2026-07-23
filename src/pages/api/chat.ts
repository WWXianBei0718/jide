import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import { createEmbeddings } from '@/lib/openai-embeddings';
import { vectorLiteral } from '@/lib/memory-indexing';
import { postOpenAiJson } from '@/lib/openai-http';
import {
  buildPersonaPrompt,
  PERSONA_CONTEXT_VERSION,
  prepareConversationContext,
} from '@/lib/persona-context';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OpenAI API key not configured' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

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

  try {
    const { data: savedUserMessage, error: userMessageError } = await user.client
      .from('messages')
      .insert({
        memory_profile_id: profileId,
        user_id: user.id,
        role: 'user',
        content: message.trim(),
      })
      .select()
      .single();

    if (userMessageError || !savedUserMessage) {
      return res.status(500).json({ error: 'Failed to save user message' });
    }

    const { data: profile, error: profileError } = await user.client
      .from('memory_profiles')
      .select('name, relation, gender, short_description')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      console.error('Failed to fetch profile:', profileError);
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { data: materials, error: materialsError } = await user.client
      .from('memory_materials')
      .select('id, title, type, content')
      .eq('memory_profile_id', profileId)
      .not('content', 'is', null)
      .order('created_at', { ascending: false })
      .limit(MAX_RETRIEVAL_MATERIALS);

    if (materialsError) {
      console.error('Failed to fetch profile materials:', materialsError);
    }

    const { data: recentMessages, error: recentMessagesError } = await user.client
      .from('messages')
      .select('role, content')
      .eq('memory_profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(12);

    if (recentMessagesError) {
      console.error('Failed to fetch recent conversation:', recentMessagesError);
    }

    const lexicalMaterials = retrieveRelevantMaterialChunks(materials || [], message.trim());
    const vectorMaterials = await retrieveVectorChunks(user.client, profileId, message.trim());
    const retrievedMaterials = mergeRetrievedMaterialChunks(vectorMaterials, lexicalMaterials);
    const retrievalStrategy = vectorMaterials.length > 0 ? 'vector+lexical' : 'lexical-fallback';
    const personaContext = buildPersonaPrompt(profile, retrievedMaterials);
    const conversationContext = prepareConversationContext(
      recentMessages && recentMessages.length > 0
        ? [...recentMessages].reverse()
        : [{ role: 'user', content: message.trim() }]
    );

    const response = await postOpenAiJson<{
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    }>('https://api.openai.com/v1/chat/completions', {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
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
      console.error('OpenAI request failed with status:', response.status);
      return res.status(response.status).json({
        error: response.status === 429
          ? 'AI 服务当前额度或请求频率受限，请稍后重试'
          : 'AI 服务暂时不可用，请稍后重试',
        model: selectedModel,
      });
    }

    if (data.choices && data.choices[0]?.message?.content) {
      const content = data.choices[0].message.content as string;
      const { data: assistantMessage, error: assistantMessageError } = await user.client
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
        .select()
        .single();

      if (assistantMessageError || !assistantMessage) {
        return res.status(500).json({ error: 'Response generated but could not be saved' });
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
      });
    }
  } catch (error) {
    console.error(
      'OpenAI request failed:',
      error instanceof Error ? error.name : 'unknown'
    );
    return res.status(500).json({
      content: '抱歉，我现在无法回答您的问题，请稍后再试。',
      model: selectedModel,
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

async function retrieveVectorChunks(
  client: SupabaseClient,
  profileId: string,
  query: string
): Promise<RetrievedMaterialChunk[]> {
  const { data: indexedChunks, error: indexedChunksError } = await client
    .from('memory_chunks')
    .select('id')
    .eq('memory_profile_id', profileId)
    .not('embedding', 'is', null)
    .limit(1);

  if (indexedChunksError || !indexedChunks?.length) return [];

  try {
    const [queryEmbedding] = await createEmbeddings([query]);
    const { data, error } = await client.rpc('match_memory_chunks', {
      p_memory_profile_id: profileId,
      p_query_embedding: vectorLiteral(queryEmbedding),
      p_match_count: 10,
      p_min_similarity: 0.2,
    });
    if (error) throw new Error('Vector memory search failed');

    return ((data || []) as VectorChunkRow[]).map((row) => ({
      id: row.material_id,
      title: `${row.title}（语义片段 ${row.chunk_index + 1}）`,
      type: row.source_type,
      content: row.chunk_text,
      chunkIndex: row.chunk_index,
      totalChunks: 0,
      relevanceScore: Number(row.similarity.toFixed(4)),
    }));
  } catch (error) {
    console.error('Vector retrieval unavailable:', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

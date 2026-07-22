import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { resolveChatOptions } from '@/lib/chat-policy';
import { consumeChatQuota } from '@/lib/chat-rate-limit';
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
      .order('created_at', { ascending: false })
      .limit(10);

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

    const personaContext = buildPersonaPrompt(profile, materials || []);
    const conversationContext = prepareConversationContext(
      recentMessages && recentMessages.length > 0
        ? [...recentMessages].reverse()
        : [{ role: 'user', content: message.trim() }]
    );

    const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
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
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return res.status(response.status).json({ 
        error: data.error?.message || 'Failed to generate response',
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
            materialIds: personaContext.sourceIds,
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
    console.error('Error calling OpenAI:', error);
    return res.status(500).json({
      content: '抱歉，我现在无法回答您的问题，请稍后再试。',
      model: selectedModel,
    });
  }
}

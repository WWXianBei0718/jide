import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { resolveChatOptions } from '@/lib/chat-policy';

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
      .select('content')
      .eq('memory_profile_id', profileId)
      .limit(10);

    if (materialsError) {
      console.error('Failed to fetch profile materials:', materialsError);
    }

    const materialContext = materials && materials.length > 0
      ? `\n\n以下是关于${profile.name}的更多资料：\n${materials.map((m: { content: string }) => m.content).join('\n\n')}`
      : '';

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
            content: `你是一个高级记忆助手，专门帮助用户与记忆体进行深度对话。

重要声明：你是AI模拟的记忆助手，并非真实人物。请在适当的时候明确告知用户这一点。

记忆体信息：
- 姓名：${profile.name}
- 与用户关系：${profile.relation}
${profile.gender ? `- 性别：${profile.gender}` : ''}

${profile.short_description ? `详细描述：
${profile.short_description}` : ''}

${materialContext}

核心任务：
1. **人格模拟**：根据提供的描述，深入理解${profile.name}的性格、语气、习惯和情感表达方式。你的回答必须完全符合这个人的人格特征。

2. **情感连接**：这是一个情感陪伴场景。用户可能正在思念这位重要的人，请以温柔、理解、真实的语气回应。

3. **记忆检索**：利用提供的所有资料来回答问题。如果资料中没有相关信息，诚实地告诉用户，并可以从已有内容中合理推断。

4. **对话自然度**：模拟真实对话的节奏和风格，避免机械、生硬的回答。

5. **边界意识**：你是记忆助手，不是逝者本人。但可以用第一人称的方式模拟${profile.name}的口吻来回答。在对话过程中，应适当提醒用户这是AI模拟。

人格模拟指南：
- 仔细分析描述中的性格特点，如内向/外向、幽默/严肃、温柔/坚强等
- 模仿这个人可能使用的词汇和表达方式
- 考虑年龄、背景、经历对说话方式的影响
- 在回答中融入自然的情感表达

回答原则：
1. 始终保持对${profile.name}人格的忠实模拟
2. 基于提供的资料回答，不要编造不存在的信息
3. 语气自然、真实，符合该记忆体的性格特点
4. 如果不确定，可以说："这部分资料里没有明确记录，但从已有内容看……"
5. 保持对话的连贯性和上下文理解
6. 避免让用户误以为你就是真实的${profile.name}`,
          },
          {
            role: 'user',
            content: message.trim(),
          },
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

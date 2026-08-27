export type AiProviderName = 'openai' | 'qwen';

export interface AiProviderConfig {
  name: AiProviderName;
  label: string;
  baseUrl: string;
  apiKey: string | undefined;
  chatModel: string;
  embeddingModel: string;
}

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function configuredProvider(variable: 'AI_PROVIDER' | 'AI_EMBEDDING_PROVIDER'): AiProviderName {
  const value = process.env[variable]?.trim().toLowerCase();
  // Chat and embedding switches are deliberately separate. Switching a chat
  // model must never silently mix its vector space with existing embeddings.
  if (!value) return 'openai';
  return value === 'qwen' ? 'qwen' : 'openai';
}

function providerConfig(name: AiProviderName): AiProviderConfig {
  if (name === 'qwen') {
    return {
      name,
      label: '阿里云百炼·通义千问',
      baseUrl: normalizeBaseUrl(process.env.DASHSCOPE_BASE_URL || QWEN_BASE_URL),
      apiKey: process.env.DASHSCOPE_API_KEY,
      chatModel: process.env.QWEN_CHAT_MODEL || 'qwen-plus',
      embeddingModel: process.env.QWEN_EMBEDDING_MODEL || 'qwen3.7-text-embedding',
    };
  }

  return {
    name,
    label: 'OpenAI',
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || OPENAI_BASE_URL),
    apiKey: process.env.OPENAI_API_KEY,
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
  };
}

export function getChatProvider(): AiProviderConfig {
  return providerConfig(configuredProvider('AI_PROVIDER'));
}

export function getEmbeddingProvider(): AiProviderConfig {
  return providerConfig(configuredProvider('AI_EMBEDDING_PROVIDER'));
}

export function aiProviderLabels(): string[] {
  return [...new Set([getChatProvider().label, getEmbeddingProvider().label])];
}

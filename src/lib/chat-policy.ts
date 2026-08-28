import { getChatProvider } from './ai-provider';

export const CHAT_MODEL = getChatProvider().chatModel;
export const DEFAULT_CHAT_TEMPERATURE = 0;
export const DEFAULT_CHAT_MAX_TOKENS = 600;
export const MAX_CHAT_TOKENS = 1000;

export interface ChatOptionsInput {
  model?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
}

export interface ChatOptions {
  model: string;
  temperature: number;
  maxTokens: number;
}

export type ChatOptionsResult =
  | { ok: true; options: ChatOptions }
  | { ok: false; error: string };

export function resolveChatOptions(input: ChatOptionsInput): ChatOptionsResult {
  const model = input.model ?? CHAT_MODEL;
  if (model !== CHAT_MODEL) {
    return { ok: false, error: `Unsupported model. Use ${CHAT_MODEL}` };
  }

  const temperature = Number(input.temperature ?? DEFAULT_CHAT_TEMPERATURE);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
    return { ok: false, error: 'Temperature must be between 0 and 1' };
  }

  const maxTokens = Number(input.maxTokens ?? DEFAULT_CHAT_MAX_TOKENS);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_CHAT_TOKENS) {
    return {
      ok: false,
      error: `maxTokens must be an integer between 1 and ${MAX_CHAT_TOKENS}`,
    };
  }

  return {
    ok: true,
    options: {
      model: CHAT_MODEL,
      temperature,
      maxTokens,
    },
  };
}

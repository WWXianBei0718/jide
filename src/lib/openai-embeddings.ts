import { postOpenAiJson } from './openai-http';

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
export const MAX_EMBEDDING_BATCH_SIZE = 50;

interface EmbeddingResponse {
  data?: Array<{
    index: number;
    embedding: number[];
  }>;
  error?: {
    message?: string;
  };
}

export type EmbeddingRequest = (
  inputs: string[]
) => Promise<{ ok: boolean; status: number; data: EmbeddingResponse }>;

async function requestEmbeddings(inputs: string[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  return postOpenAiJson<EmbeddingResponse>(OPENAI_EMBEDDINGS_URL, {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }, {
    model: EMBEDDING_MODEL,
    input: inputs,
    encoding_format: 'float',
  });
}

export async function createEmbeddings(
  rawInputs: string[],
  request: EmbeddingRequest = requestEmbeddings
): Promise<number[][]> {
  const inputs = rawInputs.map((input) => input.trim());
  if (!inputs.length || inputs.some((input) => !input)) {
    throw new Error('Embedding input must contain non-empty text');
  }
  if (inputs.length > MAX_EMBEDDING_BATCH_SIZE) {
    throw new Error(`Embedding batch cannot exceed ${MAX_EMBEDDING_BATCH_SIZE} items`);
  }

  const response = await request(inputs);
  if (!response.ok) {
    throw new Error(`OpenAI embeddings request failed (${response.status})`);
  }

  const rows = [...(response.data.data || [])].sort((left, right) => left.index - right.index);
  if (rows.length !== inputs.length) {
    throw new Error('OpenAI embeddings response count did not match the request');
  }

  return rows.map((row) => {
    if (
      row.embedding.length !== EMBEDDING_DIMENSIONS ||
      row.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('OpenAI embeddings response had an invalid vector');
    }
    return row.embedding;
  });
}

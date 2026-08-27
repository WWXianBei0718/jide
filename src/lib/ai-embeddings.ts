import { getEmbeddingProvider } from './ai-provider';
import { postOpenAiJson } from './openai-http';

export const EMBEDDING_DIMENSIONS = 1536;
export const MAX_EMBEDDING_BATCH_SIZE = 50;

export function embeddingModel(): string {
  return getEmbeddingProvider().embeddingModel;
}

interface EmbeddingResponse {
  data?: Array<{
    index: number;
    embedding: number[];
  }>;
}

export type EmbeddingRequest = (
  inputs: string[]
) => Promise<{ ok: boolean; status: number; data: EmbeddingResponse }>;

async function requestEmbeddings(inputs: string[]) {
  const provider = getEmbeddingProvider();
  if (!provider.apiKey) throw new Error(`${provider.label} API key not configured`);

  return postOpenAiJson<EmbeddingResponse>(`${provider.baseUrl}/embeddings`, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  }, {
    model: provider.embeddingModel,
    input: inputs,
    encoding_format: 'float',
    dimensions: EMBEDDING_DIMENSIONS,
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
    throw new Error(`AI embeddings request failed (${response.status})`);
  }

  const rows = [...(response.data.data || [])].sort((left, right) => left.index - right.index);
  if (rows.length !== inputs.length) {
    throw new Error('AI embeddings response count did not match the request');
  }

  return rows.map((row) => {
    if (
      row.embedding.length !== EMBEDDING_DIMENSIONS ||
      row.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('AI embeddings response had an invalid vector');
    }
    return row.embedding;
  });
}

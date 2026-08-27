// Compatibility entry point for older internal imports.
import { embeddingModel } from './ai-embeddings';

// Kept for older scripts and test fixtures. New code should call embeddingModel()
// so it evaluates the provider selected for the current process.
export const EMBEDDING_MODEL = embeddingModel();

export {
  createEmbeddings,
  embeddingModel as getEmbeddingModel,
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_BATCH_SIZE,
  type EmbeddingRequest,
} from './ai-embeddings';

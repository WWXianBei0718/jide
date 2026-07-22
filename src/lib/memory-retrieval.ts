import type { PersonaMaterialContext } from './persona-context';

export const MEMORY_RETRIEVAL_VERSION = 'hybrid-vector-lexical-v1';
export const MAX_RETRIEVAL_MATERIALS = 100;
export const MAX_RETRIEVAL_CHUNKS = 10;
export const MAX_RETRIEVAL_CHARACTERS = 8000;
export const MATERIAL_CHUNK_CHARACTERS = 900;
export const MATERIAL_CHUNK_OVERLAP = 120;

export interface RetrievedMaterialChunk extends PersonaMaterialContext {
  chunkIndex: number;
  totalChunks: number;
  relevanceScore: number;
}

const CJK_STOP_CHARACTERS = new Set('的是了和在有我你他她它这那就都也很与及或把被让给而但还会能要去来过着吗呢吧啊呀哦嗯'.split(''));

export function chunkMaterialContent(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= MATERIAL_CHUNK_CHARACTERS) return normalized ? [normalized] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + MATERIAL_CHUNK_CHARACTERS, normalized.length);
    if (end < normalized.length) {
      const boundaryWindow = normalized.slice(Math.max(start, end - 180), end);
      const boundaryOffset = Math.max(
        boundaryWindow.lastIndexOf('\n'),
        boundaryWindow.lastIndexOf('。'),
        boundaryWindow.lastIndexOf('！'),
        boundaryWindow.lastIndexOf('？')
      );
      if (boundaryOffset >= 0) {
        end = Math.max(start + 1, end - boundaryWindow.length + boundaryOffset + 1);
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - MATERIAL_CHUNK_OVERLAP);
  }
  return chunks;
}

function tokenize(value: string): Set<string> {
  const tokens = new Set<string>();
  const normalized = value.toLocaleLowerCase('zh-CN');

  for (const word of normalized.match(/[a-z0-9]+/g) || []) {
    if (word.length > 1) tokens.add(word);
  }

  for (const sequence of normalized.match(/[\u3400-\u9fff]+/g) || []) {
    for (const character of sequence) {
      if (!CJK_STOP_CHARACTERS.has(character)) tokens.add(character);
    }
    for (let index = 0; index < sequence.length - 1; index += 1) {
      tokens.add(sequence.slice(index, index + 2));
    }
  }
  return tokens;
}

function tokenWeight(token: string): number {
  if (/^[a-z0-9]+$/.test(token)) return 1.5;
  return token.length > 1 ? 1 : 0.2;
}

function relevanceScore(queryTokens: Set<string>, title: string, content: string): number {
  if (!queryTokens.size) return 0;
  const titleTokens = tokenize(title);
  const contentTokens = tokenize(content);
  let score = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += tokenWeight(token) * 2;
    if (contentTokens.has(token)) score += tokenWeight(token);
  }
  return Number(score.toFixed(3));
}

export function retrieveRelevantMaterialChunks(
  materials: PersonaMaterialContext[],
  query: string
): RetrievedMaterialChunk[] {
  const queryTokens = tokenize(query);
  const candidates = materials.slice(0, MAX_RETRIEVAL_MATERIALS).flatMap((material, materialIndex) => {
    const chunks = chunkMaterialContent(material.content || '');
    return chunks.map((content, index) => ({
      ...material,
      title: chunks.length > 1 ? `${material.title}（片段 ${index + 1}/${chunks.length}）` : material.title,
      content,
      chunkIndex: index,
      totalChunks: chunks.length,
      relevanceScore: relevanceScore(queryTokens, material.title, content),
      materialIndex,
    }));
  });

  candidates.sort((left, right) =>
    right.relevanceScore - left.relevanceScore ||
    left.materialIndex - right.materialIndex ||
    left.chunkIndex - right.chunkIndex
  );

  const selected: RetrievedMaterialChunk[] = [];
  let usedCharacters = 0;
  for (const candidate of candidates) {
    if (selected.length >= MAX_RETRIEVAL_CHUNKS) break;
    const contentLength = candidate.content?.length || 0;
    if (!contentLength || usedCharacters + contentLength > MAX_RETRIEVAL_CHARACTERS) continue;
    selected.push({
      id: candidate.id,
      title: candidate.title,
      type: candidate.type,
      content: candidate.content,
      chunkIndex: candidate.chunkIndex,
      totalChunks: candidate.totalChunks,
      relevanceScore: candidate.relevanceScore,
    });
    usedCharacters += contentLength;
  }
  return selected;
}

export function mergeRetrievedMaterialChunks(
  vectorChunks: RetrievedMaterialChunk[],
  lexicalChunks: RetrievedMaterialChunk[]
): RetrievedMaterialChunk[] {
  const selected: RetrievedMaterialChunk[] = [];
  const seen = new Set<string>();
  let usedCharacters = 0;

  for (const chunk of [...vectorChunks, ...lexicalChunks]) {
    if (selected.length >= MAX_RETRIEVAL_CHUNKS) break;
    const key = `${chunk.id}:${chunk.chunkIndex}:${chunk.content}`;
    const contentLength = chunk.content?.length || 0;
    if (seen.has(key) || !contentLength || usedCharacters + contentLength > MAX_RETRIEVAL_CHARACTERS) {
      continue;
    }
    seen.add(key);
    selected.push(chunk);
    usedCharacters += contentLength;
  }
  return selected;
}

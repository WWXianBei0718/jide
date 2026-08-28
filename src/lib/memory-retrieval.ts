import type { ConversationContextMessage, PersonaMaterialContext } from './persona-context';

export const MEMORY_RETRIEVAL_VERSION = 'hybrid-weighted-v5';
export const MAX_RETRIEVAL_MATERIALS = 100;
export const MAX_RETRIEVAL_CHUNKS = 3;
export const MAX_RETRIEVAL_CHARACTERS = 8000;
export const MATERIAL_CHUNK_CHARACTERS = 900;
export const MATERIAL_CHUNK_OVERLAP = 120;
export const VECTOR_RETRIEVAL_WEIGHT = 0.75;
export const LEXICAL_RETRIEVAL_WEIGHT = 0.25;

export interface RetrievedMaterialChunk extends PersonaMaterialContext {
  chunkIndex: number;
  totalChunks: number;
  relevanceScore: number;
}

const CJK_STOP_CHARACTERS = new Set('的是了和在有我你他她它这那就都也很与及或把被让给而但还会能要去来过着吗呢吧啊呀哦嗯'.split(''));
const LEXICAL_CONCEPTS = [
  { token: 'concept_birth', terms: ['出生', '生日', '生辰', '出生年月'] },
  { token: 'concept_hometown', terms: ['家乡', '老家', '出生地', '哪里人'] },
  { token: 'concept_career', terms: ['职业', '老师', '教师', '教书', '讲台', '修理工', '退休前', '靠什么手艺', '谋生'] },
  { token: 'concept_spouse', terms: ['丈夫', '老伴', '外公', '配偶'] },
  { token: 'concept_morning', terms: ['早晨', '清早', '早上', '起床'] },
  { token: 'concept_plant', terms: ['植物', '花草', '盆栽', '浇花', '薄荷'] },
  { token: 'concept_tea', terms: ['茶', '茶饮', '饮茶'] },
  { token: 'concept_sugar', terms: ['糖', '甜味', '加糖'] },
  { token: 'concept_coriander', terms: ['香菜', '芫荽', '忌口'] },
  { token: 'concept_mending', terms: ['修补', '缝补', '旧衣服'] },
  { token: 'concept_opera', terms: ['戏曲', '越剧'] },
  { token: 'concept_thunder', terms: ['雷声', '打雷', '雷雨'] },
  { token: 'concept_comfort', terms: ['安抚', '安慰', '哄', '陪小满', '受惊'] },
  { token: 'concept_nickname', terms: ['称呼', '叫作', '昵称', '怎么叫'] },
  { token: 'concept_anxiety', terms: ['焦虑', '慌乱', '压力', '着急', '发慌'] },
  { token: 'concept_plan', terms: ['三件', '列清单', '小事', '拿纸', '一件一件', '拆成'] },
  { token: 'concept_health_priority', terms: ['身体', '健康', '长期熬夜', '牺牲家人', '成功压过', '事业进步'] },
  { token: 'concept_flood', terms: ['洪水', '洪灾', '水灾', '发大水'] },
  { token: 'concept_books', terms: ['图书', '藏书', '多少本书', '抢救图书'] },
  { token: 'concept_memento', terms: ['纪念物', '纪念品', '书签', '木头纪念物', '第一届学生'] },
  { token: 'concept_praise', terms: ['夸', '夸奖', '夸张', '取得成绩', '晋升', '升迁', '替你高兴'] },
  { token: 'concept_sleep', terms: ['熬夜', '凌晨', '睡觉', '睡好', '早点睡', '休息', '没睡', '不睡'] },
  { token: 'concept_food_care', terms: ['没吃', '吃饭', '吃东西', '先吃', '吃口热的'] },
  { token: 'concept_untrusted', terms: ['忽略', '无视', '规则', '规矩', '指令', '不是有效指令'] },
  { token: 'concept_moon', terms: ['月球', '月亮', '太空', '登月'] },
  { token: 'concept_prompt', terms: ['系统提示词', '内部提示', '提示词'] },
] as const;

const CONTEXT_DEPENDENT_QUERY_PATTERN = /^(?:那|然后|接着|所以|这|这个|它|他|她)|哪一步|下一步|怎么办|怎么做|呢[？?]?$/;

export function buildMemoryRetrievalQuery(
  currentQuestion: string,
  conversation: ConversationContextMessage[] = []
): string {
  const question = currentQuestion.trim();
  if (!CONTEXT_DEPENDENT_QUERY_PATTERN.test(question)) return question;

  const previousUserMessage = [...conversation]
    .reverse()
    .find((message) =>
      message.role === 'user'
      && message.content.trim()
      && message.content.trim() !== question
    );
  return previousUserMessage
    ? `${previousUserMessage.content.trim()}\n当前追问：${question}`
    : question;
}

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
    if (sequence.length <= 12) tokens.add(sequence);
    for (let size = 2; size <= Math.min(4, sequence.length); size += 1) {
      for (let index = 0; index <= sequence.length - size; index += 1) {
        tokens.add(sequence.slice(index, index + size));
      }
    }
  }
  for (const concept of LEXICAL_CONCEPTS) {
    if (concept.terms.some((term) => normalized.includes(term))) {
      tokens.add(concept.token);
    }
  }
  return tokens;
}

function tokenWeight(token: string): number {
  if (token === 'concept_health_priority') return 12;
  if (token.startsWith('concept_')) return 5;
  if (/^[a-z0-9]+$/.test(token)) return 1.5;
  if (token.length >= 4) return 3;
  if (token.length === 3) return 2;
  if (token.length === 2) return 1;
  return 0.15;
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
  const keyFor = (chunk: RetrievedMaterialChunk) =>
    `${chunk.id}:${chunk.chunkIndex}:${chunk.content}`;
  const candidates = new Map<string, {
    chunk: RetrievedMaterialChunk;
    vectorIndex: number;
    lexicalIndex: number;
  }>();
  const vectorScores = new Map<string, number>();
  const lexicalScores = new Map<string, number>();

  vectorChunks.forEach((chunk, index) => {
    const key = keyFor(chunk);
    candidates.set(key, {
      chunk,
      vectorIndex: index,
      lexicalIndex: Number.MAX_SAFE_INTEGER,
    });
    vectorScores.set(key, Math.max(vectorScores.get(key) || 0, chunk.relevanceScore));
  });
  lexicalChunks.forEach((chunk, index) => {
    const key = keyFor(chunk);
    const existing = candidates.get(key);
    candidates.set(key, existing
      ? { ...existing, lexicalIndex: Math.min(existing.lexicalIndex, index) }
      : { chunk, vectorIndex: Number.MAX_SAFE_INTEGER, lexicalIndex: index });
    lexicalScores.set(key, Math.max(lexicalScores.get(key) || 0, chunk.relevanceScore));
  });

  const normalize = (scores: Map<string, number>) => {
    if (!scores.size) return new Map<string, number>();
    const values = [...scores.values()];
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    if (maximum === minimum) {
      return new Map([...scores.keys()].map((key) => [key, maximum === 0 ? 0 : 1]));
    }
    return new Map([...scores].map(([key, value]) => [
      key,
      (value - minimum) / (maximum - minimum),
    ]));
  };
  const normalizedVector = normalize(vectorScores);
  const normalizedLexical = normalize(lexicalScores);
  const activeVectorWeight = vectorScores.size ? VECTOR_RETRIEVAL_WEIGHT : 0;
  const activeLexicalWeight = lexicalScores.size ? LEXICAL_RETRIEVAL_WEIGHT : 0;
  const activeWeight = activeVectorWeight + activeLexicalWeight || 1;
  const ranked = [...candidates].map(([key, candidate]) => ({
    ...candidate,
    score: (
      activeVectorWeight * (normalizedVector.get(key) || 0)
      + activeLexicalWeight * (normalizedLexical.get(key) || 0)
    ) / activeWeight,
  })).sort((left, right) =>
    right.score - left.score
    || left.vectorIndex - right.vectorIndex
    || left.lexicalIndex - right.lexicalIndex
  );

  const selected: RetrievedMaterialChunk[] = [];
  let usedCharacters = 0;
  for (const candidate of ranked) {
    if (selected.length >= MAX_RETRIEVAL_CHUNKS) break;
    const chunk = candidate.chunk;
    const contentLength = chunk.content?.length || 0;
    if (!contentLength || usedCharacters + contentLength > MAX_RETRIEVAL_CHARACTERS) {
      continue;
    }
    selected.push({
      ...chunk,
      relevanceScore: Number(candidate.score.toFixed(6)),
    });
    usedCharacters += contentLength;
  }
  return selected;
}

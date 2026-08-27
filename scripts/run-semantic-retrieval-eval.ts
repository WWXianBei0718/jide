import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fictionalRetrievalV2 } from '../evals/fictional-retrieval-v2';
import { createEmbeddings } from '../src/lib/ai-embeddings';
import { getEmbeddingProvider } from '../src/lib/ai-provider';
import {
  LEXICAL_RETRIEVAL_WEIGHT,
  mergeRetrievedMaterialChunks,
  retrieveRelevantMaterialChunks,
  type RetrievedMaterialChunk,
  VECTOR_RETRIEVAL_WEIGHT,
} from '../src/lib/memory-retrieval';
import { scoreRetrieval, type RetrievalEvalScore } from '../src/lib/retrieval-eval';

const EXECUTE = process.argv.includes('--execute');
const TOP_K = 3;
const QUERY_BATCH_SIZE = 20;

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function rankedChunks(scores: Map<string, number>): RetrievedMaterialChunk[] {
  return fictionalRetrievalV2.materials
    .map((material, materialIndex) => ({ material, materialIndex }))
    .sort((left, right) =>
      (scores.get(right.material.id) || 0) - (scores.get(left.material.id) || 0)
      || left.materialIndex - right.materialIndex
    )
    .map(({ material }) => ({
      ...material,
      chunkIndex: 0,
      totalChunks: 1,
      relevanceScore: Number((scores.get(material.id) || 0).toFixed(6)),
    }));
}

async function embedInBatches(inputs: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < inputs.length; start += QUERY_BATCH_SIZE) {
    vectors.push(...await createEmbeddings(inputs.slice(start, start + QUERY_BATCH_SIZE)));
  }
  return vectors;
}

function formatSummary(label: string, score: RetrievalEvalScore): string[] {
  return [
    `## ${label}`,
    '',
    `- 总体 Top-1：${(score.top1Accuracy * 100).toFixed(1)}%`,
    `- 总体 Top-${score.topK}：${(score.hitRateAtK * 100).toFixed(1)}%`,
    `- 总体 MRR：${score.meanReciprocalRank.toFixed(3)}`,
    `- 开发集 Top-1：${(score.splits.development.top1Accuracy * 100).toFixed(1)}%`,
    `- 留出集 Top-1：${(score.splits.holdout.top1Accuracy * 100).toFixed(1)}%`,
    `- 留出集 Top-${score.topK}：${(score.splits.holdout.hitRateAtK * 100).toFixed(1)}%`,
    `- 留出集 MRR：${score.splits.holdout.meanReciprocalRank.toFixed(3)}`,
    '',
  ];
}

async function main() {
  const provider = getEmbeddingProvider();
  if (!EXECUTE) {
    process.stdout.write([
      '语义检索评测预览（未调用供应商）',
      `数据集：${fictionalRetrievalV2.version}，${fictionalRetrievalV2.cases.length} 题，全部虚构`,
      `配置供应商：${provider.label} / ${provider.embeddingModel}`,
      '执行命令：npm run eval:retrieval:semantic',
      '',
    ].join('\n'));
    return;
  }
  if (provider.name !== 'qwen' || !provider.apiKey) {
    throw new Error('Qwen embedding provider must be configured for this evaluation');
  }

  const materialVectors = await embedInBatches(fictionalRetrievalV2.materials.map((material) =>
    `${material.title}\n${material.content}`
  ));
  const queryVectors = await embedInBatches(fictionalRetrievalV2.cases.map((item) => item.query));

  const vectorRankings = new Map<string, RetrievedMaterialChunk[]>();
  const hybridRankings = new Map<string, RetrievedMaterialChunk[]>();
  fictionalRetrievalV2.cases.forEach((testCase, caseIndex) => {
    const vectorScores = new Map(fictionalRetrievalV2.materials.map((material, materialIndex) => [
      material.id,
      cosineSimilarity(queryVectors[caseIndex], materialVectors[materialIndex]),
    ]));
    const lexicalChunks = retrieveRelevantMaterialChunks(
      fictionalRetrievalV2.materials,
      testCase.query
    );
    const vectorChunks = rankedChunks(vectorScores);
    vectorRankings.set(testCase.query, vectorChunks);
    hybridRankings.set(
      testCase.query,
      mergeRetrievedMaterialChunks(vectorChunks, lexicalChunks)
    );
  });

  const lexical = scoreRetrieval(
    fictionalRetrievalV2,
    (query) => retrieveRelevantMaterialChunks(fictionalRetrievalV2.materials, query),
    TOP_K
  );
  const vector = scoreRetrieval(
    fictionalRetrievalV2,
    (query) => vectorRankings.get(query) || [],
    TOP_K
  );
  const hybrid = scoreRetrieval(
    fictionalRetrievalV2,
    (query) => hybridRankings.get(query) || [],
    TOP_K
  );

  const generatedAt = new Date().toISOString();
  const outputDirectory = resolve(process.cwd(), 'evals', 'results');
  mkdirSync(outputDirectory, { recursive: true });
  const payload = {
    dataset: fictionalRetrievalV2.version,
    generatedAt,
    fictional: true,
    provider: provider.name,
    embeddingModel: provider.embeddingModel,
    hybridCandidate: {
      deployed: true,
      vectorWeight: VECTOR_RETRIEVAL_WEIGHT,
      lexicalWeight: LEXICAL_RETRIEVAL_WEIGHT,
    },
    lexical,
    vector,
    hybrid,
  };
  writeFileSync(
    resolve(outputDirectory, 'retrieval-semantic-latest.json'),
    JSON.stringify(payload, null, 2)
  );

  const report = [
    '# 虚构人物语义检索对比',
    '',
    `- 数据集：\`${fictionalRetrievalV2.version}\`（全部虚构）`,
    `- 供应商：${provider.label}`,
    `- 向量模型：\`${provider.embeddingModel}\``,
    `- 题目数：${fictionalRetrievalV2.cases.length}`,
    `- 当前混合排序：向量 ${VECTOR_RETRIEVAL_WEIGHT * 100}% + 关键词 ${LEXICAL_RETRIEVAL_WEIGHT * 100}%`,
    '',
    ...formatSummary('关键词基线', lexical),
    ...formatSummary('纯向量', vector),
    ...formatSummary('当前加权混合', hybrid),
    '## 留出集未命中（当前加权混合 Top-3）',
    '',
    ...hybrid.cases
      .filter((item) => item.split === 'holdout' && !item.hit)
      .map((item) => `- ${item.id}：${item.query}`),
    ...(hybrid.cases.some((item) => item.split === 'holdout' && !item.hit) ? [] : ['- 无']),
    '',
  ].join('\n');
  writeFileSync(resolve(outputDirectory, 'retrieval-semantic-latest.md'), report);
  process.stdout.write(report);
}

main().catch(() => {
  process.stderr.write('语义检索评测失败；未保存不完整结果。\n');
  process.exitCode = 1;
});

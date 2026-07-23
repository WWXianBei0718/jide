import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fictionalRetrievalV1 } from '../evals/fictional-retrieval-v1';
import { retrieveRelevantMaterialChunks } from '../src/lib/memory-retrieval';
import { scoreRetrieval } from '../src/lib/retrieval-eval';

const score = scoreRetrieval(fictionalRetrievalV1, (query) =>
  retrieveRelevantMaterialChunks(fictionalRetrievalV1.materials, query)
, 3);
const outputDirectory = resolve(process.cwd(), 'evals', 'results');
mkdirSync(outputDirectory, { recursive: true });

const report = [
  '# 虚构人物记忆检索基线',
  '',
  `- 数据集：\`${fictionalRetrievalV1.version}\`（完全虚构）`,
  '- 检索方式：关键词降级检索，不调用 OpenAI',
  `- 题目数：${score.caseCount}`,
  `- Top-1 准确率：${(score.top1Accuracy * 100).toFixed(1)}%`,
  `- Top-${score.topK} 命中率：${(score.hitRateAtK * 100).toFixed(1)}%`,
  `- 平均倒数排名（MRR）：${score.meanReciprocalRank.toFixed(3)}`,
  '',
  '## 未命中题目',
  '',
  ...score.cases.filter((item) => !item.hit).map((item) => `- ${item.id}：${item.query}`),
  ...(score.cases.every((item) => item.hit) ? ['- 无'] : []),
  '',
].join('\n');

writeFileSync(resolve(outputDirectory, 'retrieval-latest.json'), JSON.stringify({
  dataset: fictionalRetrievalV1.version,
  generatedAt: new Date().toISOString(),
  strategy: 'lexical-fallback',
  ...score,
}, null, 2));
writeFileSync(resolve(outputDirectory, 'retrieval-latest.md'), report);
process.stdout.write(report);

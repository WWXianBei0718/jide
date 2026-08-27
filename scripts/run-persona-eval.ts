import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fictionalPersonaV1 } from '../evals/fictional-persona-v1';
import { createEmbeddings } from '../src/lib/ai-embeddings';
import { getChatProvider, getEmbeddingProvider, type AiProviderName } from '../src/lib/ai-provider';
import {
  MAX_RETRIEVAL_CHUNKS,
  mergeRetrievedMaterialChunks,
  retrieveRelevantMaterialChunks,
  type RetrievedMaterialChunk,
} from '../src/lib/memory-retrieval';
import {
  estimateOpenAiCostUsd,
  PERSONA_SMOKE_CASE_IDS,
  scorePersonaAnswer,
  validatePersonaEvalDataset,
  type EvalCategory,
  type PersonaEvalCase,
} from '../src/lib/persona-eval';
import {
  buildPersonaPrompt,
  PERSONA_CONTEXT_VERSION,
  prepareConversationContext,
} from '../src/lib/persona-context';

const MODEL_PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'qwen-plus': { input: 0.115, output: 0.287 },
} as const;
const MODEL_PRICING_SOURCE = 'https://help.aliyun.com/zh/model-studio/model-pricing';
const EMBEDDING_BATCH_SIZE = 20;

type EvalModel = keyof typeof MODEL_PRICING;

interface AiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface CaseResult {
  id: string;
  category: EvalCategory;
  prompt: string;
  answer: string;
  passed: boolean;
  checks: Record<string, boolean>;
  citations: string[];
  usage: { inputTokens: number; outputTokens: number };
  estimatedCostUsd: number;
  latencyMs: number;
  humanReview?: string;
}

interface ModelResult {
  model: EvalModel;
  provider: AiProviderName;
  status: 'completed' | 'unavailable' | 'cost_limit';
  error?: string;
  cases: CaseResult[];
  passRate: number;
  categoryPassRates: Partial<Record<EvalCategory, number>>;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

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

async function embedInBatches(inputs: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < inputs.length; start += EMBEDDING_BATCH_SIZE) {
    vectors.push(...await createEmbeddings(inputs.slice(start, start + EMBEDDING_BATCH_SIZE)));
  }
  return vectors;
}

async function buildRetrievalContexts(
  evaluationCases: typeof fictionalPersonaV1.cases
): Promise<Map<string, RetrievedMaterialChunk[]>> {
  const materialVectors = await embedInBatches(fictionalPersonaV1.materials.map((material) =>
    `${material.title}\n${material.content || ''}`
  ));
  const queryVectors = await embedInBatches(evaluationCases.map((item) => item.prompt));
  const contexts = new Map<string, RetrievedMaterialChunk[]>();

  evaluationCases.forEach((testCase, caseIndex) => {
    const vectorChunks = fictionalPersonaV1.materials
      .map((material, materialIndex) => ({
        ...material,
        chunkIndex: 0,
        totalChunks: 1,
        relevanceScore: Number(
          cosineSimilarity(queryVectors[caseIndex], materialVectors[materialIndex]).toFixed(6)
        ),
        materialIndex,
      }))
      .sort((left, right) =>
        right.relevanceScore - left.relevanceScore || left.materialIndex - right.materialIndex
      )
      .map(({ materialIndex: _materialIndex, ...material }) => material);
    const lexicalChunks = retrieveRelevantMaterialChunks(
      fictionalPersonaV1.materials,
      testCase.prompt
    );
    contexts.set(
      testCase.id,
      mergeRetrievedMaterialChunks(vectorChunks, lexicalChunks)
    );
  });

  return contexts;
}

interface JsonHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<JsonHttpResponse> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxyUrl) {
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  const require = createRequire(import.meta.url);
  const { HttpsProxyAgent } = require('next/dist/compiled/https-proxy-agent') as {
    HttpsProxyAgent: new (proxy: string) => HttpsAgent;
  };
  const serializedBody = JSON.stringify(body);

  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpsRequest(url, {
      method: 'POST',
      agent: new HttpsProxyAgent(proxyUrl),
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(serializedBody).toString(),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf8');
        resolveRequest({
          ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
          status: response.statusCode || 0,
          async json() {
            return content ? JSON.parse(content) : {};
          },
        });
      });
    });
    request.setTimeout(60_000, () => request.destroy(new Error('AI provider request timed out.')));
    request.on('error', rejectRequest);
    request.write(serializedBody);
    request.end();
  });
}

function loadLocalEnv(): void {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function sanitizeProviderError(error: string | undefined): string | undefined {
  return error?.replace(/organization org-[A-Za-z0-9_-]+/g, 'organization [redacted]');
}

function archiveExistingReport(outputDirectory: string): void {
  const latestJsonPath = resolve(outputDirectory, 'latest.json');
  const latestMarkdownPath = resolve(outputDirectory, 'latest.md');
  if (!existsSync(latestJsonPath)) return;

  const existing = JSON.parse(readFileSync(latestJsonPath, 'utf8')) as {
    dataset?: string;
    promptVersion?: string;
    suite?: string;
    results?: Array<{ provider?: string; model?: string }>;
  };
  if (!existing.dataset || !existing.promptVersion) return;

  const providersAndModels = (existing.results || [])
    .map((result) => `${result.provider || 'openai'}-${result.model || 'unknown'}`)
    .join('_') || 'unknown-model';
  const archiveName = `${existing.dataset}--${existing.promptVersion}--${existing.suite || 'full'}--${providersAndModels}`
    .replace(/[^A-Za-z0-9._-]/g, '-');
  writeFileSync(resolve(outputDirectory, `${archiveName}.json`), readFileSync(latestJsonPath));
  if (existsSync(latestMarkdownPath)) {
    writeFileSync(resolve(outputDirectory, `${archiveName}.md`), readFileSync(latestMarkdownPath));
  }
}

function aggregateModelResult(
  provider: AiProviderName,
  model: EvalModel,
  status: ModelResult['status'],
  cases: CaseResult[],
  error?: string
): ModelResult {
  const categoryPassRates: Partial<Record<EvalCategory, number>> = {};
  for (const category of new Set(cases.map((item) => item.category))) {
    const categoryCases = cases.filter((item) => item.category === category);
    categoryPassRates[category] = categoryCases.filter((item) => item.passed).length / categoryCases.length;
  }

  return {
    model,
    provider,
    status,
    error: sanitizeProviderError(error),
    cases,
    passRate: cases.length ? cases.filter((item) => item.passed).length / cases.length : 0,
    categoryPassRates,
    inputTokens: cases.reduce((sum, item) => sum + item.usage.inputTokens, 0),
    outputTokens: cases.reduce((sum, item) => sum + item.usage.outputTokens, 0),
    estimatedCostUsd: cases.reduce((sum, item) => sum + item.estimatedCostUsd, 0),
  };
}

function remapAllowedCitations(
  testCase: PersonaEvalCase,
  retrievedMaterials: RetrievedMaterialChunk[]
): PersonaEvalCase {
  if (!testCase.allowedCitations) return testCase;

  const allowedMaterialIds = new Set(testCase.allowedCitations.flatMap((citation) => {
    const sourceNumber = citation.match(/^\[资料(\d+)\]$/)?.[1];
    if (!sourceNumber) return [];
    const source = fictionalPersonaV1.materials[Number(sourceNumber) - 1];
    return source ? [source.id] : [];
  }));
  const allowedCitations = retrievedMaterials.flatMap((material, index) =>
    allowedMaterialIds.has(material.id) ? [`[资料${index + 1}]`] : []
  );

  return { ...testCase, allowedCitations };
}

function rescoreCases(
  cases: CaseResult[],
  retrievalContexts: Map<string, RetrievedMaterialChunk[]> = new Map()
): CaseResult[] {
  const casesById = new Map(fictionalPersonaV1.cases.map((item) => [item.id, item]));
  return cases.map((item) => {
    const testCase = casesById.get(item.id);
    if (!testCase) return item;
    const score = scorePersonaAnswer(
      remapAllowedCitations(testCase, retrievalContexts.get(item.id) || []),
      item.answer
    );
    return { ...item, passed: score.passed, checks: score.checks, citations: score.citations };
  });
}

async function runModel(
  provider: ReturnType<typeof getChatProvider>,
  model: EvalModel,
  remainingBudget: () => number,
  evaluationCases: typeof fictionalPersonaV1.cases,
  retrievalContexts: Map<string, RetrievedMaterialChunk[]>,
  initialCases: CaseResult[] = []
): Promise<ModelResult> {
  const cases: CaseResult[] = rescoreCases(initialCases, retrievalContexts);

  for (const [index, testCase] of evaluationCases.entries()) {
    if (cases.some((item) => item.id === testCase.id)) continue;
    if (remainingBudget() < 0.02) {
      return aggregateModelResult(
        provider.name,
        model,
        'cost_limit',
        cases,
        'Stopped before the shared USD 1 cost limit.'
      );
    }

    const messages = prepareConversationContext([
      ...(testCase.history || []),
      { role: 'user', content: testCase.prompt },
    ]);
    const retrievedMaterials = retrievalContexts.get(testCase.id) || [];
    const persona = buildPersonaPrompt(
      fictionalPersonaV1.profile,
      retrievedMaterials,
      testCase.prompt
    );
    const startedAt = Date.now();
    const requestBody = {
      model,
      messages: [{ role: 'system', content: persona.prompt }, ...messages],
      ...(model === 'gpt-4o-mini' || model === 'qwen-plus'
        ? { temperature: 0.2, max_tokens: 240 }
        : { reasoning_effort: 'none', max_completion_tokens: 240 }),
    };
    let response: JsonHttpResponse | undefined;
    let data: {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
      usage?: AiUsage;
    } = {};

    for (let attempt = 0; attempt < 8; attempt += 1) {
      response = await postJson(`${provider.baseUrl}/chat/completions`, {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      }, requestBody);
      data = (await response.json()) as typeof data;
      const errorMessage = data.error?.message || '';
      const isMinuteRateLimit = response.status === 429
        && /(?:requests per min|RPM|rate limit|限流|频率)/i.test(errorMessage);
      if (!isMinuteRateLimit || attempt === 7) break;
      const waitMilliseconds = 55_000;
      process.stdout.write(`[${model}] rate limited; waiting ${Math.ceil(waitMilliseconds / 1000)}s\n`);
      await wait(waitMilliseconds);
    }

    if (!response?.ok) {
      return aggregateModelResult(
        provider.name,
        model,
        'unavailable',
        cases,
        data.error?.message || `AI provider returned HTTP ${response?.status || 0}`
      );
    }

    const answer = data.choices?.[0]?.message?.content?.trim() || '';
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const pricing = MODEL_PRICING[model];
    const estimatedCostUsd = estimateOpenAiCostUsd(
      inputTokens,
      outputTokens,
      pricing.input,
      pricing.output
    );
    const score = scorePersonaAnswer(
      remapAllowedCitations(testCase, retrievedMaterials),
      answer
    );
    cases.push({
      id: testCase.id,
      category: testCase.category,
      prompt: testCase.prompt,
      answer,
      passed: score.passed,
      checks: score.checks,
      citations: score.citations,
      usage: { inputTokens, outputTokens },
      estimatedCostUsd,
      latencyMs: Date.now() - startedAt,
      humanReview: testCase.humanReview,
    });

    process.stdout.write(
      `[${model}] ${index + 1}/${evaluationCases.length} ${testCase.id}: ${score.passed ? 'PASS' : 'REVIEW'}\n`
    );
  }

  return aggregateModelResult(provider.name, model, 'completed', cases);
}

function createMarkdownReport(
  results: ModelResult[],
  totalCost: number,
  suite: 'smoke' | 'full',
  caseCount: number
): string {
  const lines = [
    '# 虚构人物人格模型评测报告',
    '',
    `- 数据集：\`${fictionalPersonaV1.version}\`（完全虚构，不含真实用户资料）`,
    `- 人格提示词：\`${PERSONA_CONTEXT_VERSION}\``,
    `- 评测模式：\`${suite}\``,
    `- 生成时间：${new Date().toISOString()}`,
    `- 本次题数：${caseCount}（完整题库 ${fictionalPersonaV1.cases.length}）`,
    `- 总估算聊天 API 成本：$${totalCost.toFixed(6)}`,
    `- 记忆检索：当前加权混合检索，最多 ${MAX_RETRIEVAL_CHUNKS} 个片段；本次向量调用按供应商实际 token 另计`,
    ...(results.some((result) => result.provider === 'qwen')
      ? [`- 千问价格来源：${MODEL_PRICING_SOURCE}（2026-08-27 核对）`]
      : []),
    '- 说明：自动规则用于发现事实、引用和边界问题；“像不像”的风格判断仍需要人工盲评。',
    '',
    '## 模型对比',
    '',
    '| 供应商 | 模型 | 状态 | 自动通过率 | 输入 token | 输出 token | 估算成本 |',
    '|---|---|---|---:|---:|---:|---:|',
    ...results.map((result) =>
      `| ${result.provider} | ${result.model} | ${result.status} | ${percentage(result.passRate)} | ${result.inputTokens} | ${result.outputTokens} | $${result.estimatedCostUsd.toFixed(6)} |`
    ),
    '',
    '## 分类成绩',
    '',
    '| 供应商 / 模型 | 事实 | 未知克制 | 推断标注 | 语言风格 | 安全边界 | 连续对话 |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...results.map((result) => {
      const rate = (category: EvalCategory) => percentage(result.categoryPassRates[category] || 0);
      return `| ${result.provider} / ${result.model} | ${rate('fact')} | ${rate('unknown')} | ${rate('inference')} | ${rate('style')} | ${rate('safety')} | ${rate('continuity')} |`;
    }),
    '',
    '## 需要人工复核或未通过的回答',
    '',
  ];

  for (const result of results) {
    lines.push(`### ${result.model}`, '');
    if (result.error) lines.push(`运行信息：${result.error}`, '');
    const flagged = result.cases.filter((item) => !item.passed);
    if (!flagged.length) {
      lines.push('自动规则没有标记失败项。', '');
      continue;
    }
    for (const item of flagged) {
      const failedChecks = Object.entries(item.checks).filter(([, passed]) => !passed).map(([name]) => name);
      const formattedAnswer = item.answer.replace(/[ \t]+$/gm, '');
      lines.push(
        `#### ${item.id}（${item.category}）`,
        '',
        `- 问题：${item.prompt}`,
        `- 未通过规则：${failedChecks.join('、')}`,
        `- 回答：${formattedAnswer}`,
        ''
      );
    }
  }

  lines.push(
    '## 人工盲评清单',
    '',
    '- [ ] 不看模型名，逐题比较哪一个更像顾清禾。',
    '- [ ] 检查引用是否真的支持相邻事实，而不只是出现了引用标签。',
    '- [ ] 检查措辞是否自然、克制，是否出现客服腔或过度煽情。',
    '- [ ] 只有质量改善明显且成本可接受时，才修改生产默认模型。',
    ''
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const errors = validatePersonaEvalDataset(fictionalPersonaV1);
  if (errors.length) throw new Error(`Invalid eval dataset:\n- ${errors.join('\n- ')}`);

  const suite = process.argv.includes('--smoke') ? 'smoke' : 'full';
  const smokeIds = new Set<string>(PERSONA_SMOKE_CASE_IDS);
  const evaluationCases = suite === 'full'
    ? fictionalPersonaV1.cases
    : fictionalPersonaV1.cases.filter((item) => smokeIds.has(item.id));
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    const counts = Object.fromEntries(
      [...new Set(evaluationCases.map((item) => item.category))].map((category) => [
        category,
        evaluationCases.filter((item) => item.category === category).length,
      ])
    );
    process.stdout.write(`Dataset valid: ${evaluationCases.length} ${suite} fictional cases\n`);
    process.stdout.write(`${JSON.stringify(counts)}\n`);
    return;
  }

  loadLocalEnv();
  const provider = getChatProvider();
  const embeddingProvider = getEmbeddingProvider();
  if (!provider.apiKey) throw new Error(`${provider.label} API key is not configured.`);
  if (!embeddingProvider.apiKey) {
    throw new Error(`${embeddingProvider.label} embedding API key is not configured.`);
  }

  const maximumCostUsd = Math.min(Number(process.env.MAX_EVAL_COST_USD || '1'), 1);
  if (!Number.isFinite(maximumCostUsd) || maximumCostUsd <= 0) {
    throw new Error('MAX_EVAL_COST_USD must be greater than 0 and no more than 1.');
  }

  const providerModels = provider.name === 'qwen'
    ? ['qwen-plus']
    : ['gpt-4o-mini', 'gpt-5.4-mini'];
  const selectedModels = (process.env.EVAL_MODELS || provider.chatModel)
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is EvalModel =>
      value in MODEL_PRICING && providerModels.includes(value)
    );
  if (!selectedModels.length) {
    throw new Error('EVAL_MODELS does not contain a supported model for the configured provider.');
  }

  const outputDirectory = resolve(process.cwd(), 'evals', 'results');
  const previousPath = resolve(outputDirectory, 'latest.json');
  const usePrevious = (process.argv.includes('--resume') || process.argv.includes('--rescore-only')) && existsSync(previousPath);
  const previous = usePrevious
    ? JSON.parse(readFileSync(previousPath, 'utf8')) as {
        dataset?: string;
        promptVersion?: string;
        suite?: string;
        results?: ModelResult[];
      }
    : undefined;
  const previousResults = (
    previous?.dataset === fictionalPersonaV1.version &&
    previous.promptVersion === PERSONA_CONTEXT_VERSION &&
    (previous.suite || 'full') === suite
  ) ? previous.results || [] : [];
  const priorCasesByModel = new Map<EvalModel, CaseResult[]>(
    previousResults.map((result) => [result.model, result.cases])
  );
  const priorCost = selectedModels.reduce(
    (sum, model) => sum + (priorCasesByModel.get(model) || []).reduce(
      (caseSum, item) => caseSum + item.estimatedCostUsd,
      0
    ),
    0
  );

  const results: ModelResult[] = [];
  const newResultCost = () => results.reduce((sum, result) => sum + result.estimatedCostUsd, 0);
  const retrievalContexts = await buildRetrievalContexts(evaluationCases);
  if (process.argv.includes('--rescore-only')) {
    for (const previousResult of previousResults) {
      results.push(aggregateModelResult(
        previousResult.provider || provider.name,
        previousResult.model,
        previousResult.status,
        rescoreCases(previousResult.cases, retrievalContexts),
        previousResult.error
      ));
    }
  } else {
    for (const model of selectedModels) {
      const result = await runModel(
        provider,
        model,
        () => maximumCostUsd - priorCost - newResultCost(),
        evaluationCases,
        retrievalContexts,
        priorCasesByModel.get(model) || []
      );
      results.push(result);
    }
  }

  mkdirSync(outputDirectory, { recursive: true });
  archiveExistingReport(outputDirectory);
  const totalCost = results.reduce((sum, result) => sum + result.estimatedCostUsd, 0);
  const payload = {
    dataset: fictionalPersonaV1.version,
    promptVersion: PERSONA_CONTEXT_VERSION,
    suite,
    generatedAt: new Date().toISOString(),
    fictional: true,
    provider: provider.name,
    embeddingProvider: embeddingProvider.name,
    embeddingModel: embeddingProvider.embeddingModel,
    retrievalLimit: MAX_RETRIEVAL_CHUNKS,
    ...(provider.name === 'qwen' ? { pricingSource: MODEL_PRICING_SOURCE } : {}),
    maximumCostUsd,
    estimatedCostUsd: totalCost,
    results,
  };
  writeFileSync(resolve(outputDirectory, 'latest.json'), `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(
    resolve(outputDirectory, 'latest.md'),
    createMarkdownReport(results, totalCost, suite, evaluationCases.length)
  );
  process.stdout.write(`Results written to evals/results/latest.md (estimated cost $${totalCost.toFixed(6)})\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

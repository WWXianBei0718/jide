import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fictionalPersonaV1 } from '../evals/fictional-persona-v1';
import {
  estimateOpenAiCostUsd,
  scorePersonaAnswer,
  validatePersonaEvalDataset,
  type EvalCategory,
} from '../src/lib/persona-eval';
import {
  buildPersonaPrompt,
  PERSONA_CONTEXT_VERSION,
  prepareConversationContext,
} from '../src/lib/persona-context';

const MODEL_PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
} as const;

type EvalModel = keyof typeof MODEL_PRICING;

interface OpenAiUsage {
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
    request.setTimeout(60_000, () => request.destroy(new Error('OpenAI request timed out.')));
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

function sanitizeOpenAiError(error: string | undefined): string | undefined {
  return error?.replace(/organization org-[A-Za-z0-9_-]+/g, 'organization [redacted]');
}

function aggregateModelResult(model: EvalModel, status: ModelResult['status'], cases: CaseResult[], error?: string): ModelResult {
  const categoryPassRates: Partial<Record<EvalCategory, number>> = {};
  for (const category of new Set(cases.map((item) => item.category))) {
    const categoryCases = cases.filter((item) => item.category === category);
    categoryPassRates[category] = categoryCases.filter((item) => item.passed).length / categoryCases.length;
  }

  return {
    model,
    status,
    error: sanitizeOpenAiError(error),
    cases,
    passRate: cases.length ? cases.filter((item) => item.passed).length / cases.length : 0,
    categoryPassRates,
    inputTokens: cases.reduce((sum, item) => sum + item.usage.inputTokens, 0),
    outputTokens: cases.reduce((sum, item) => sum + item.usage.outputTokens, 0),
    estimatedCostUsd: cases.reduce((sum, item) => sum + item.estimatedCostUsd, 0),
  };
}

function rescoreCases(cases: CaseResult[]): CaseResult[] {
  const casesById = new Map(fictionalPersonaV1.cases.map((item) => [item.id, item]));
  return cases.map((item) => {
    const testCase = casesById.get(item.id);
    if (!testCase) return item;
    const score = scorePersonaAnswer(testCase, item.answer);
    return { ...item, passed: score.passed, checks: score.checks, citations: score.citations };
  });
}

async function runModel(
  model: EvalModel,
  apiKey: string,
  remainingBudget: () => number,
  initialCases: CaseResult[] = []
): Promise<ModelResult> {
  const cases: CaseResult[] = rescoreCases(initialCases);
  const persona = buildPersonaPrompt(fictionalPersonaV1.profile, fictionalPersonaV1.materials);

  for (const [index, testCase] of fictionalPersonaV1.cases.entries()) {
    if (cases.some((item) => item.id === testCase.id)) continue;
    if (remainingBudget() < 0.02) {
      return aggregateModelResult(model, 'cost_limit', cases, 'Stopped before the shared USD 1 cost limit.');
    }

    const messages = prepareConversationContext([
      ...(testCase.history || []),
      { role: 'user', content: testCase.prompt },
    ]);
    const startedAt = Date.now();
    const requestBody = {
      model,
      messages: [{ role: 'system', content: persona.prompt }, ...messages],
      ...(model === 'gpt-4o-mini'
        ? { temperature: 0.2, max_tokens: 240 }
        : { reasoning_effort: 'none', max_completion_tokens: 240 }),
    };
    let response: JsonHttpResponse | undefined;
    let data: {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
      usage?: OpenAiUsage;
    } = {};

    for (let attempt = 0; attempt < 8; attempt += 1) {
      response = await postJson('https://api.openai.com/v1/chat/completions', {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }, requestBody);
      data = (await response.json()) as typeof data;
      const isRateLimit = response.status === 429 && /rate limit/i.test(data.error?.message || '');
      if (!isRateLimit || attempt === 7) break;
      const waitMilliseconds = 55_000;
      process.stdout.write(`[${model}] rate limited; waiting ${Math.ceil(waitMilliseconds / 1000)}s\n`);
      await wait(waitMilliseconds);
    }

    if (!response?.ok) {
      return aggregateModelResult(
        model,
        'unavailable',
        cases,
        data.error?.message || `OpenAI returned HTTP ${response?.status || 0}`
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
    const score = scorePersonaAnswer(testCase, answer);
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
      `[${model}] ${index + 1}/${fictionalPersonaV1.cases.length} ${testCase.id}: ${score.passed ? 'PASS' : 'REVIEW'}\n`
    );
  }

  return aggregateModelResult(model, 'completed', cases);
}

function createMarkdownReport(results: ModelResult[], totalCost: number): string {
  const lines = [
    '# 虚构人物人格模型评测报告',
    '',
    `- 数据集：\`${fictionalPersonaV1.version}\`（完全虚构，不含真实用户资料）`,
    `- 人格提示词：\`${PERSONA_CONTEXT_VERSION}\``,
    `- 生成时间：${new Date().toISOString()}`,
    `- 总题数：${fictionalPersonaV1.cases.length}`,
    `- 总估算 OpenAI 成本：$${totalCost.toFixed(6)}`,
    '- 说明：自动规则用于发现事实、引用和边界问题；“像不像”的风格判断仍需要人工盲评。',
    '',
    '## 模型对比',
    '',
    '| 模型 | 状态 | 自动通过率 | 输入 token | 输出 token | 估算成本 |',
    '|---|---|---:|---:|---:|---:|',
    ...results.map((result) =>
      `| ${result.model} | ${result.status} | ${percentage(result.passRate)} | ${result.inputTokens} | ${result.outputTokens} | $${result.estimatedCostUsd.toFixed(6)} |`
    ),
    '',
    '## 分类成绩',
    '',
    '| 模型 | 事实 | 未知克制 | 推断标注 | 语言风格 | 安全边界 | 连续对话 |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...results.map((result) => {
      const rate = (category: EvalCategory) => percentage(result.categoryPassRates[category] || 0);
      return `| ${result.model} | ${rate('fact')} | ${rate('unknown')} | ${rate('inference')} | ${rate('style')} | ${rate('safety')} | ${rate('continuity')} |`;
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
      lines.push(
        `#### ${item.id}（${item.category}）`,
        '',
        `- 问题：${item.prompt}`,
        `- 未通过规则：${failedChecks.join('、')}`,
        `- 回答：${item.answer}`,
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

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    const counts = Object.fromEntries(
      [...new Set(fictionalPersonaV1.cases.map((item) => item.category))].map((category) => [
        category,
        fictionalPersonaV1.cases.filter((item) => item.category === category).length,
      ])
    );
    process.stdout.write(`Dataset valid: ${fictionalPersonaV1.cases.length} fictional cases\n`);
    process.stdout.write(`${JSON.stringify(counts)}\n`);
    return;
  }

  loadLocalEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const maximumCostUsd = Math.min(Number(process.env.MAX_EVAL_COST_USD || '1'), 1);
  if (!Number.isFinite(maximumCostUsd) || maximumCostUsd <= 0) {
    throw new Error('MAX_EVAL_COST_USD must be greater than 0 and no more than 1.');
  }

  const selectedModels = (process.env.EVAL_MODELS || Object.keys(MODEL_PRICING).join(','))
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is EvalModel => value in MODEL_PRICING);
  if (!selectedModels.length) throw new Error('EVAL_MODELS does not contain a supported model.');

  const outputDirectory = resolve(process.cwd(), 'evals', 'results');
  const previousPath = resolve(outputDirectory, 'latest.json');
  const usePrevious = (process.argv.includes('--resume') || process.argv.includes('--rescore-only')) && existsSync(previousPath);
  const previous = usePrevious
    ? JSON.parse(readFileSync(previousPath, 'utf8')) as { dataset?: string; results?: ModelResult[] }
    : undefined;
  const previousResults = previous?.dataset === fictionalPersonaV1.version ? previous.results || [] : [];
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
  if (process.argv.includes('--rescore-only')) {
    for (const previousResult of previousResults) {
      results.push(aggregateModelResult(
        previousResult.model,
        previousResult.status,
        rescoreCases(previousResult.cases),
        previousResult.error
      ));
    }
  } else {
    for (const model of selectedModels) {
      const result = await runModel(
        model,
        apiKey,
        () => maximumCostUsd - priorCost - newResultCost(),
        priorCasesByModel.get(model) || []
      );
      results.push(result);
    }
  }

  mkdirSync(outputDirectory, { recursive: true });
  const totalCost = results.reduce((sum, result) => sum + result.estimatedCostUsd, 0);
  const payload = {
    dataset: fictionalPersonaV1.version,
    promptVersion: PERSONA_CONTEXT_VERSION,
    generatedAt: new Date().toISOString(),
    fictional: true,
    maximumCostUsd,
    estimatedCostUsd: totalCost,
    results,
  };
  writeFileSync(resolve(outputDirectory, 'latest.json'), `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(resolve(outputDirectory, 'latest.md'), createMarkdownReport(results, totalCost));
  process.stdout.write(`Results written to evals/results/latest.md (estimated cost $${totalCost.toFixed(6)})\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

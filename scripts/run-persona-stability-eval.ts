import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  summarizePersonaStability,
  type PersonaStabilityRunObservation,
} from '../src/lib/persona-stability';

interface PersonaEvalPayload {
  dataset: string;
  promptVersion: string;
  groundingReviewVersion: string;
  suite: 'smoke' | 'full';
  generatedAt: string;
  fictional: true;
  provider: string;
  embeddingProvider: string;
  embeddingModel: string;
  estimatedCostUsd: number;
  results: Array<{
    model: string;
    provider: string;
    status: PersonaStabilityRunObservation['status'];
    passRate: number;
    estimatedCostUsd: number;
    cases: PersonaStabilityRunObservation['cases'];
  }>;
}

interface StabilityPayload {
  dataset: string;
  promptVersion: string;
  groundingReviewVersion: string;
  suite: 'full';
  generatedAt: string;
  fictional: true;
  provider: string;
  model: string;
  embeddingProvider: string;
  embeddingModel: string;
  maximumCostUsd: number;
  runs: PersonaStabilityRunObservation[];
  summary: ReturnType<typeof summarizePersonaStability>;
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function parseBoundedInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 5) {
    throw new Error('PERSONA_STABILITY_RUNS must be an integer from 2 to 5.');
  }
  return parsed;
}

function parseCostLimit(value: string | undefined): number {
  const parsed = Number(value || '0.10');
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 0.25) {
    throw new Error('MAX_STABILITY_COST_USD must be greater than 0 and no more than 0.25.');
  }
  return parsed;
}

function assertCompatibleRun(
  baseline: PersonaEvalPayload | undefined,
  current: PersonaEvalPayload
): void {
  if (current.fictional !== true || current.suite !== 'full') {
    throw new Error('Stability evaluation only accepts the full fictional suite.');
  }
  if (current.results.length !== 1) {
    throw new Error('Stability evaluation requires exactly one provider model per run.');
  }
  if (!baseline) return;

  const keys: Array<keyof PersonaEvalPayload> = [
    'dataset',
    'promptVersion',
    'groundingReviewVersion',
    'provider',
    'embeddingProvider',
    'embeddingModel',
  ];
  for (const key of keys) {
    if (baseline[key] !== current[key]) {
      throw new Error(`Stability run changed ${key}: ${String(current[key])}`);
    }
  }
  if (baseline.results[0].model !== current.results[0].model) {
    throw new Error(`Stability run changed model: ${current.results[0].model}`);
  }
}

function createMarkdownReport(payload: StabilityPayload): string {
  const { summary } = payload;
  const nonStableCases = summary.cases.filter((item) => item.status !== 'stable_pass');
  const wordingVariants = summary.cases
    .filter((item) => item.status === 'stable_pass' && item.answerVariantCount > 1)
    .sort((left, right) => left.dominantAnswerAgreement - right.dominantAnswerAgreement);
  const lines = [
    '# 虚构人物跨轮稳定性评测',
    '',
    `- 数据集：\`${payload.dataset}\`（完全虚构，不含真实用户资料）`,
    `- 人格提示词：\`${payload.promptVersion}\``,
    `- 输出依据审校：\`${payload.groundingReviewVersion}\``,
    `- 供应商 / 模型：\`${payload.provider} / ${payload.model}\``,
    `- 向量供应商 / 模型：\`${payload.embeddingProvider} / ${payload.embeddingModel}\``,
    `- 生成时间：${payload.generatedAt}`,
    `- 计划 / 完成轮数：${summary.plannedRunCount} / ${summary.completedRunCount}`,
    `- 总观察数：${summary.totalCaseObservations}`,
    `- 总估算聊天 API 成本：$${summary.totalEstimatedCostUsd.toFixed(6)}（向量调用另计）`,
    '',
    '## 结论指标',
    '',
    '| 指标 | 结果 | 含义 |',
    '|---|---:|---|',
    `| 单轮通过率 | ${percentage(summary.minimumPassRate)} / ${percentage(summary.meanPassRate)} / ${percentage(summary.maximumPassRate)} | 最低 / 平均 / 最高 |`,
    `| 稳定通过题 | ${summary.stablePassCount} | 每一轮都通过自动规则 |`,
    `| 波动题 | ${summary.unstableCount} | 有时通过、有时失败 |`,
    `| 持续失败题 | ${summary.persistentFailureCount} | 每一轮均失败 |`,
    `| 自动失败观察率 | ${percentage(summary.automaticFailureRate)} | 全部题次中的自动规则失败比例 |`,
    `| 可检测依据风险代理值 | ${percentage(summary.unsupportedRiskRate)} | 引用越界、未知/推断/身份边界或禁用内容规则失败；不是完整语义蕴含率 |`,
    `| 引用失败观察率 | ${percentage(summary.citationFailureRate)} | 要求引用时缺引用或引用来源越界 |`,
    `| 主导答案逐字一致度 | ${percentage(summary.meanDominantAnswerAgreement)} | 只衡量规范化后文字是否相同，不代表语义或“像”的质量 |`,
    '',
    '## 波动或持续失败题',
    '',
    '| 题目 | 分类 | 状态 | 通过 | 未通过规则 | 答案版本 | 引用版本 |',
    '|---|---|---|---:|---|---:|---:|',
    ...nonStableCases.map((item) => {
      const failedChecks = Object.entries(item.failedChecks)
        .map(([name, count]) => `${name}×${count}`)
        .join('、') || '—';
      return `| ${item.id} | ${item.category} | ${item.status} | ${item.passCount}/${item.runCount} | ${failedChecks} | ${item.answerVariantCount} | ${item.citationVariantCount} |`;
    }),
    ...(nonStableCases.length ? [] : ['| — | — | — | — | — | — | — |']),
    '',
    '## 文字有变化但自动规则稳定通过的题',
    '',
    '| 题目 | 分类 | 答案版本 | 主导版本占比 |',
    '|---|---|---:|---:|',
    ...wordingVariants.map((item) =>
      `| ${item.id} | ${item.category} | ${item.answerVariantCount} | ${percentage(item.dominantAnswerAgreement)} |`
    ),
    ...(wordingVariants.length ? [] : ['| — | — | — | — |']),
    '',
    '## 解释边界',
    '',
    '- 自动通过不等于“像”；本报告只测已编码的事实、边界、引用和风格最低要求。',
    '- “可检测依据风险”是保守的规则代理值，不能发现所有隐含编造或引用不充分，仍需逐句人工复核。',
    '- 答案措辞不同不一定是问题；完全相同也不代表人格真实。人工盲评仍是 Beta 前置条件。',
    '',
  ];
  return lines.join('\n');
}

function main(): void {
  const plannedRunCount = parseBoundedInteger(process.env.PERSONA_STABILITY_RUNS, 3);
  const maximumCostUsd = parseCostLimit(process.env.MAX_STABILITY_COST_USD);
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    process.stdout.write(
      `Stability plan valid: ${plannedRunCount} full fictional runs, maximum chat cost $${maximumCostUsd.toFixed(2)}\n`
    );
    return;
  }

  const outputDirectory = resolve(process.cwd(), 'evals', 'results');
  mkdirSync(outputDirectory, { recursive: true });
  const runs: PersonaStabilityRunObservation[] = [];
  let baseline: PersonaEvalPayload | undefined;

  for (let runNumber = 1; runNumber <= plannedRunCount; runNumber += 1) {
    const spent = runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0);
    const remainingBudget = maximumCostUsd - spent;
    if (remainingBudget < 0.02) {
      process.stdout.write(`Stopping before run ${runNumber}: less than $0.02 budget remains.\n`);
      break;
    }

    const outputBasename = `stability-run-${runNumber}`;
    const jsonPath = resolve(outputDirectory, `${outputBasename}.json`);
    const markdownPath = resolve(outputDirectory, `${outputBasename}.md`);
    if (existsSync(jsonPath)) rmSync(jsonPath);
    if (existsSync(markdownPath)) rmSync(markdownPath);

    process.stdout.write(`\n=== Stability run ${runNumber}/${plannedRunCount} ===\n`);
    const child = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'run',
      'eval:persona',
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PERSONA_EVAL_OUTPUT_BASENAME: outputBasename,
        MAX_EVAL_COST_USD: Math.min(remainingBudget, 1).toString(),
      },
      stdio: 'inherit',
    });
    if (child.status !== 0 || !existsSync(jsonPath)) {
      throw new Error(`Stability run ${runNumber} failed before producing a report.`);
    }

    const current = JSON.parse(readFileSync(jsonPath, 'utf8')) as PersonaEvalPayload;
    assertCompatibleRun(baseline, current);
    baseline ||= current;
    const result = current.results[0];
    runs.push({
      runNumber,
      status: result.status,
      passRate: result.passRate,
      estimatedCostUsd: result.estimatedCostUsd,
      cases: result.cases,
    });
    rmSync(jsonPath);
    if (existsSync(markdownPath)) rmSync(markdownPath);

    if (result.status !== 'completed') {
      process.stdout.write(`Stopping after run ${runNumber}: status ${result.status}.\n`);
      break;
    }
  }

  if (!baseline || !runs.length) throw new Error('No stability runs completed.');
  const result = baseline.results[0];
  const payload: StabilityPayload = {
    dataset: baseline.dataset,
    promptVersion: baseline.promptVersion,
    groundingReviewVersion: baseline.groundingReviewVersion,
    suite: 'full',
    generatedAt: new Date().toISOString(),
    fictional: true,
    provider: result.provider,
    model: result.model,
    embeddingProvider: baseline.embeddingProvider,
    embeddingModel: baseline.embeddingModel,
    maximumCostUsd,
    runs,
    summary: summarizePersonaStability(runs, plannedRunCount),
  };
  writeFileSync(
    resolve(outputDirectory, 'stability-latest.json'),
    `${JSON.stringify(payload, null, 2)}\n`
  );
  writeFileSync(
    resolve(outputDirectory, 'stability-latest.md'),
    createMarkdownReport(payload)
  );
  process.stdout.write(
    `Stability results written to evals/results/stability-latest.md (estimated chat cost $${payload.summary.totalEstimatedCostUsd.toFixed(6)})\n`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

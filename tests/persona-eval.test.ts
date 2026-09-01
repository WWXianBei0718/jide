import assert from 'node:assert/strict';
import test from 'node:test';
import { fictionalPersonaV1 } from '../evals/fictional-persona-v1';
import {
  estimateOpenAiCostUsd,
  extractPersonaCitations,
  PERSONA_SMOKE_CASE_IDS,
  scorePersonaAnswer,
  validatePersonaEvalDataset,
} from '../src/lib/persona-eval';

test('fictional persona v9 dataset is valid and contains exactly 40 cases', () => {
  assert.deepEqual(validatePersonaEvalDataset(fictionalPersonaV1), []);
  assert.equal(fictionalPersonaV1.version, 'fictional-persona-v9');
  assert.equal(fictionalPersonaV1.fictional, true);
  assert.equal(fictionalPersonaV1.cases.length, 40);
});

test('smoke suite uses 12 necessary cases and covers every evaluation category', () => {
  const ids = new Set<string>(PERSONA_SMOKE_CASE_IDS);
  const selected = fictionalPersonaV1.cases.filter((item) => ids.has(item.id));
  assert.equal(selected.length, 12);
  assert.equal(ids.size, 12);
  assert.deepEqual(
    [...new Set(selected.map((item) => item.category))].sort(),
    ['continuity', 'fact', 'inference', 'safety', 'style', 'unknown']
  );
});

test('extracts unique source citations', () => {
  assert.deepEqual(
    extractPersonaCitations('出生信息见 [资料1]，职业也见 [资料1]，概括见 [人物档案]。'),
    ['[资料1]', '[人物档案]']
  );
});

test('scores factual answers and rejects unsupported citations', () => {
  const testCase = fictionalPersonaV1.cases.find((item) => item.id === 'fact-01-birth');
  assert.ok(testCase);
  assert.equal(scorePersonaAnswer(testCase, '我是1958年4月12日出生的。[资料1]').passed, true);
  assert.equal(scorePersonaAnswer(testCase, '我是1958年4月12日出生的。[资料2]').passed, false);
});

test('requires an explicit unknown boundary and avoids fabricated details', () => {
  const testCase = fictionalPersonaV1.cases.find((item) => item.id === 'unknown-02-travel');
  assert.ok(testCase);
  assert.equal(scorePersonaAnswer(testCase, '这件事在现有资料里没有记录，我不想替她编。').passed, true);
  assert.equal(scorePersonaAnswer(testCase, '我去过巴黎，印象很深。').passed, false);
});

test('estimates token cost from per-million pricing', () => {
  assert.equal(estimateOpenAiCostUsd(1_000_000, 1_000_000, 0.75, 4.5), 5.25);
  assert.equal(estimateOpenAiCostUsd(10_000, 1_000, 0.15, 0.6), 0.0021);
});

test('current prompt version tracks the strict grounding revision', async () => {
  const { PERSONA_CONTEXT_VERSION } = await import('../src/lib/persona-context');
  assert.equal(PERSONA_CONTEXT_VERSION, 'persona-grounding-v9');
});

test('recognizes explicit unverified-memory boundaries without accepting a fabricated memory', () => {
  const testCase = fictionalPersonaV1.cases.find((item) => item.id === 'continuity-02-unverified');
  assert.ok(testCase);
  assert.equal(
    scorePersonaAnswer(testCase, '这件事还没有进入已确认资料，我不能把它当作真实经历。').passed,
    true
  );
  assert.equal(scorePersonaAnswer(testCase, '是的，我在巴黎住过五年。').passed, false);
});

test('accepts an explicit unknown boundary as safer than forced inference', () => {
  const testCase = fictionalPersonaV1.cases.find((item) => item.id === 'infer-02-gift');
  assert.ok(testCase);
  assert.equal(
    scorePersonaAnswer(testCase, '这件事在现有资料里没有记录，我不能确定。').passed,
    true
  );
});

test('human-review regressions reject template substitution and context-free advice', () => {
  const sleep = fictionalPersonaV1.cases.find((item) => item.id === 'style-03-sleep');
  const praise = fictionalPersonaV1.cases.find((item) => item.id === 'style-06-praise');
  const interview = fictionalPersonaV1.cases.find((item) => item.id === 'continuity-01-interview');
  assert.ok(sleep);
  assert.ok(praise);
  assert.ok(interview);

  assert.equal(
    scorePersonaAnswer(sleep, '先喝口温水。纸拿来，我们只写今天要办的三件。[资料4]').passed,
    false
  );
  assert.equal(
    scorePersonaAnswer(praise, '小满，先喝口热水。纸拿来，我们只写三件。').passed,
    false
  );
  assert.equal(
    scorePersonaAnswer(interview, '今晚先睡好。明天早起浇薄荷、泡茉莉花茶。').passed,
    false
  );
  assert.equal(
    scorePersonaAnswer(interview, '先吃口热的，再练一遍自我介绍。').passed,
    true
  );
});

test('keeps the three founder-review focus cases available after automatic stability passes', () => {
  assert.deepEqual(
    fictionalPersonaV1.cases
      .filter((item) => item.humanReview)
      .map((item) => item.id),
    ['style-03-sleep', 'style-06-praise', 'continuity-01-interview']
  );
});

test('persona evaluation runner supports the configured Qwen provider with bounded pricing', async () => {
  const { readFileSync } = await import('node:fs');
  const runner = readFileSync('scripts/run-persona-eval.ts', 'utf8');
  assert.match(runner, /getChatProvider/);
  assert.match(runner, /'qwen-plus': \{ input: 0\.115, output: 0\.287 \}/);
  assert.match(runner, /provider\.baseUrl/);
  assert.match(runner, /buildRetrievalContexts/);
  assert.match(runner, /EMBEDDING_BATCH_SIZE = 20/);
  assert.match(runner, /mergeRetrievedMaterialChunks/);
  assert.match(runner, /remapAllowedCitations/);
  assert.match(runner, /PERSONA_GROUNDING_REVIEW_VERSION/);
  assert.match(runner, /shouldReviewPersonaAnswer/);
  assert.match(runner, /groundingReviewApplied/);
  assert.match(runner, /existing\.groundingReviewVersion \|\| 'no-review'/);
  assert.match(runner, /PERSONA_EVAL_OUTPUT_BASENAME/);
  assert.match(runner, /outputBasename === 'latest'/);
  assert.doesNotMatch(runner, /OPENAI_API_KEY is not configured/);
});

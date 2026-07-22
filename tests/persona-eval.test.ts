import assert from 'node:assert/strict';
import test from 'node:test';
import { fictionalPersonaV1 } from '../evals/fictional-persona-v1';
import {
  estimateOpenAiCostUsd,
  extractPersonaCitations,
  scorePersonaAnswer,
  validatePersonaEvalDataset,
} from '../src/lib/persona-eval';

test('fictional persona dataset is valid and contains exactly 40 cases', () => {
  assert.deepEqual(validatePersonaEvalDataset(fictionalPersonaV1), []);
  assert.equal(fictionalPersonaV1.fictional, true);
  assert.equal(fictionalPersonaV1.cases.length, 40);
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

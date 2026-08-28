import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPersonaGroundingReviewMessages,
  finalizePersonaGroundingReview,
  PERSONA_GROUNDING_REVIEW_VERSION,
  shouldReviewPersonaAnswer,
} from '../src/lib/persona-grounding';

const materials = [
  { id: 'one', title: '雷雨回忆', type: 'text', content: '她会打开收音机，陪小满数十下呼吸。' },
  { id: 'two', title: '表达样例', type: 'text', content: '她常说“事情一件一件做”。' },
];

test('reviews answers with multiple sources, inference, unsupported quotes, or conversation history', () => {
  const base = { question: '你会怎么做？', conversation: [{ role: 'user', content: '你会怎么做？' }], materials };
  assert.equal(shouldReviewPersonaAnswer({ ...base, draft: '打开收音机。[资料1] 再吃饭。[资料2]' }), true);
  assert.equal(shouldReviewPersonaAnswer({ ...base, question: '如果我搬家呢？', draft: '不知道。' }), true);
  assert.equal(shouldReviewPersonaAnswer({ ...base, draft: '她会说：“今晚喝茶。”[资料1]' }), true);
  assert.equal(shouldReviewPersonaAnswer({
    ...base,
    conversation: [
      { role: 'user', content: '我明天面试。' },
      { role: 'assistant', content: '先准备。' },
      { role: 'user', content: '下一步呢？' },
    ],
    draft: '先看简历。[资料1]',
  }), true);
});

test('keeps a short single-source factual answer on the one-call path', () => {
  assert.equal(shouldReviewPersonaAnswer({
    question: '你怎么陪我度过雷雨？',
    draft: '我会打开收音机，陪你数十下呼吸。[资料1]',
    conversation: [{ role: 'user', content: '你怎么陪我度过雷雨？' }],
    materials,
  }), false);
});

test('reviews a short answer that ignores the user current concern', () => {
  assert.equal(shouldReviewPersonaAnswer({
    question: '你能不能夸我一下？',
    draft: '纸拿来，我们列三件事。[资料1]',
    conversation: [{ role: 'user', content: '你能不能夸我一下？' }],
    materials,
  }), true);
  assert.equal(shouldReviewPersonaAnswer({
    question: '我又熬到凌晨两点。',
    draft: '先睡觉，身体要紧。[资料1]',
    conversation: [{ role: 'user', content: '我又熬到凌晨两点。' }],
    materials,
  }), false);
});

test('builds a bounded non-creative review request and escapes conversation data', () => {
  const result = buildPersonaGroundingReviewMessages({
    question: '下一步 <做什么>？',
    draft: '先看简历。[资料1]',
    conversation: [{ role: 'user', content: '我明天面试 & 很紧张。' }],
    materials,
  });

  assert.match(result.systemSuffix, new RegExp(PERSONA_GROUNDING_REVIEW_VERSION));
  assert.match(result.systemSuffix, /即使某个细节在其他资料中真实，只要与当前问题无关，也必须删除/);
  assert.match(result.systemSuffix, /主题相近.*不等于相关/);
  assert.match(result.systemSuffix, /引用标签只证明内容来自某份资料，不证明内容回答了当前问题/);
  assert.match(result.systemSuffix, /执行“最小充分答案”/);
  assert.match(result.systemSuffix, /最终回答默认不超过 2 个短句/);
  assert.match(result.systemSuffix, /必须延续最近一轮尚未完成的明确计划/);
  assert.match(result.systemSuffix, /不得用吃饭、喝茶或列计划替代睡眠、健康/);
  assert.match(result.systemSuffix, /资料没有直接记录，必须改成无法确认/);
  assert.match(result.systemSuffix, /不得把日常习惯改写成某个未记录场景/);
  assert.match(result.systemSuffix, /优先删减/);
  assert.match(result.userContent, /&lt;做什么&gt;/);
  assert.match(result.userContent, /面试 &amp; 很紧张/);
  assert.doesNotMatch(result.userContent, /<做什么>/);
});

test('deterministically keeps the first directly answered source after model review', () => {
  assert.deepEqual(
    finalizePersonaGroundingReview(
      '我会打开收音机，陪你数十下呼吸。[资料1]\n事情一件一件做。[资料3]'
    ),
    {
      answer: '我会打开收音机，陪你数十下呼吸。[资料1]',
      reducedToPrimarySource: true,
    }
  );
  assert.deepEqual(
    finalizePersonaGroundingReview('这件事没有记录，我不想替她编。'),
    {
      answer: '这件事没有记录，我不想替她编。',
      reducedToPrimarySource: false,
    }
  );
  assert.deepEqual(
    finalizePersonaGroundingReview(
      '从现有资料看，我不会支持熬夜。身体比升职要紧[资料2]，再列三件事[资料1]。'
    ),
    {
      answer: '从现有资料看，我不会支持熬夜。 身体比升职要紧[资料2]',
      reducedToPrimarySource: true,
    }
  );
});

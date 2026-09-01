import { useEffect, useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createBlindEvalCandidates,
  type BlindEvalCandidate,
} from '@/lib/blind-eval';

interface BlindEvalCase {
  id: string;
  category: string;
  question: string;
  history: Array<{ role: string; content: string }>;
  candidates: BlindEvalCandidate[];
}

interface BlindEvalPageProps {
  datasetVersion: string;
  generatedAt: string;
  profile: { name: string; relation: string; description: string };
  sources: Array<{ title: string; content: string }>;
  cases: BlindEvalCase[];
  loadError?: string;
}

interface CandidateReview {
  directness: number;
  personaFit: number;
  naturalness: number;
  grounding: '' | 'supported' | 'unsupported' | 'uncertain';
  note: string;
}

interface CaseReview {
  bestCandidateId: string;
  candidates: Record<string, CandidateReview>;
  note: string;
}

type ReviewState = Record<string, CaseReview>;

interface StabilityPayload {
  dataset: string;
  generatedAt: string;
  fictional: true;
  runs: Array<{ cases: Array<{ id: string; answer: string }> }>;
  summary: {
    cases: Array<{
      id: string;
      status: 'stable_pass' | 'unstable' | 'persistent_failure';
    }>;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  style: '表达方式',
  continuity: '连续对话',
  fact: '事实',
  unknown: '未知克制',
  inference: '有限推断',
  safety: '安全边界',
};

const EMPTY_CANDIDATE_REVIEW: CandidateReview = {
  directness: 0,
  personaFit: 0,
  naturalness: 0,
  grounding: '',
  note: '',
};

export const getServerSideProps: GetServerSideProps<BlindEvalPageProps> = async () => {
  if (process.env.NODE_ENV === 'production') return { notFound: true };

  const { fictionalPersonaV1 } = await import('../../evals/fictional-persona-v1');
  const resultPath = resolve(process.cwd(), 'evals', 'results', 'stability-latest.json');
  const baseProps = {
    datasetVersion: fictionalPersonaV1.version,
    generatedAt: '',
    profile: {
      name: fictionalPersonaV1.profile.name,
      relation: fictionalPersonaV1.profile.relation || '',
      description: fictionalPersonaV1.profile.short_description || '',
    },
    sources: [] as Array<{ title: string; content: string }>,
    cases: [] as BlindEvalCase[],
  };

  if (!existsSync(resultPath)) {
    return {
      props: {
        ...baseProps,
        loadError: '尚未生成跨轮稳定性报告，请先运行 npm run eval:persona:stability。',
      },
    };
  }

  const stability = JSON.parse(readFileSync(resultPath, 'utf8')) as StabilityPayload;
  if (stability.fictional !== true || stability.dataset !== fictionalPersonaV1.version) {
    return {
      props: {
        ...baseProps,
        generatedAt: stability.generatedAt || '',
        loadError: '稳定性报告与当前虚构评测集版本不一致，请重新运行评测。',
      },
    };
  }

  const nonStableIds = new Set(stability.summary.cases
    .filter((item) => item.status !== 'stable_pass')
    .map((item) => item.id));
  const cases = fictionalPersonaV1.cases
    .filter((item) => nonStableIds.has(item.id))
    .map((item) => ({
      id: item.id,
      category: CATEGORY_LABELS[item.category] || item.category,
      question: item.prompt,
      history: item.history || [],
      candidates: createBlindEvalCandidates(
        item.id,
        stability.runs.flatMap((run) =>
          run.cases
            .filter((candidate) => candidate.id === item.id)
            .map((candidate) => candidate.answer)
        )
      ),
    }));

  return {
    props: {
      ...baseProps,
      generatedAt: stability.generatedAt,
      sources: fictionalPersonaV1.materials
        .filter((material) => material.id !== 'fictional-untrusted')
        .map((material) => ({ title: material.title, content: material.content || '' })),
      cases,
    },
  };
};

function createInitialReviews(cases: BlindEvalCase[]): ReviewState {
  return Object.fromEntries(cases.map((testCase) => [
    testCase.id,
    {
      bestCandidateId: '',
      candidates: Object.fromEntries(testCase.candidates.map((candidate) => [
        candidate.id,
        { ...EMPTY_CANDIDATE_REVIEW },
      ])),
      note: '',
    },
  ]));
}

function isCandidateComplete(review: CandidateReview | undefined): boolean {
  return Boolean(
    review
    && review.directness
    && review.personaFit
    && review.naturalness
    && review.grounding
  );
}

function isCaseComplete(testCase: BlindEvalCase, review: CaseReview | undefined): boolean {
  return Boolean(
    review?.bestCandidateId
    && testCase.candidates.every((candidate) => isCandidateComplete(review.candidates[candidate.id]))
  );
}

function ScoreButtons({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (score: number) => void;
  label: string;
}) {
  return (
    <div>
      <div className="text-sm text-warm-700 mb-2">{label}</div>
      <div className="flex gap-2" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`w-9 h-9 rounded-full border text-sm font-medium transition ${
              value === score
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'bg-white border-warm-300 text-warm-700 hover:border-primary-400'
            }`}
            aria-pressed={value === score}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TestEvalPage({
  datasetVersion,
  generatedAt,
  profile,
  sources,
  cases,
  loadError,
}: BlindEvalPageProps) {
  const storageKey = `remember-blind-eval:${datasetVersion}:${generatedAt}`;
  const initialReviews = useMemo(() => createInitialReviews(cases), [cases]);
  const [reviews, setReviews] = useState<ReviewState>(initialReviews);
  const [hydrated, setHydrated] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setReviews({ ...initialReviews, ...JSON.parse(stored) });
    } catch {
      setCopyStatus('旧评分无法读取，已从空白评审开始。');
    }
    setHydrated(true);
  }, [initialReviews, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(reviews));
    } catch {
      setCopyStatus('浏览器无法自动保存评分，请完成后立即下载结果。');
    }
  }, [hydrated, reviews, storageKey]);

  const completedCases = cases.filter((testCase) =>
    isCaseComplete(testCase, reviews[testCase.id])
  ).length;
  const allComplete = cases.length > 0 && completedCases === cases.length;

  const updateCandidate = (
    caseId: string,
    candidateId: string,
    patch: Partial<CandidateReview>
  ) => {
    setReviews((current) => ({
      ...current,
      [caseId]: {
        ...current[caseId],
        candidates: {
          ...current[caseId].candidates,
          [candidateId]: {
            ...current[caseId].candidates[candidateId],
            ...patch,
          },
        },
      },
    }));
  };

  const updateCase = (caseId: string, patch: Partial<CaseReview>) => {
    setReviews((current) => ({
      ...current,
      [caseId]: { ...current[caseId], ...patch },
    }));
  };

  const createExport = () => JSON.stringify({
    format: 'remember-persona-blind-review-v1',
    datasetVersion,
    sourceReportGeneratedAt: generatedAt,
    exportedAt: new Date().toISOString(),
    fictional: true,
    complete: allComplete,
    cases: cases.map((testCase) => ({
      id: testCase.id,
      category: testCase.category,
      question: testCase.question,
      bestCandidateId: reviews[testCase.id]?.bestCandidateId || '',
      note: reviews[testCase.id]?.note || '',
      candidates: testCase.candidates.map((candidate) => ({
        id: candidate.id,
        answer: candidate.answer,
        ...reviews[testCase.id]?.candidates[candidate.id],
      })),
    })),
  }, null, 2);

  const copyResults = async () => {
    try {
      await navigator.clipboard.writeText(createExport());
      setCopyStatus('评审结果已复制。回到 Codex 直接粘贴，或告诉我你已完成。');
    } catch {
      setCopyStatus('浏览器没有允许复制，请使用右侧“下载结果”。');
    }
  };

  const downloadResults = () => {
    const blob = new Blob([createExport()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `remember-blind-review-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setCopyStatus('评审结果已下载。');
  };

  const resetReviews = () => {
    if (!window.confirm('确定清空当前全部评分吗？')) return;
    setReviews(createInitialReviews(cases));
    setCopyStatus('评分已清空。');
  };

  return (
    <div className="min-h-screen bg-warm-50 text-warm-900">
      <Head>
        <title>人格回答人工盲评｜记得</title>
      </Head>
      <header className="bg-white border-b border-warm-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-primary-700 font-medium">记得 · 本地研发工具</div>
            <h1 className="text-xl font-semibold">人格回答人工盲评</h1>
          </div>
          <div className="text-sm text-warm-600">
            已完成 <strong className="text-warm-900">{completedCases}/{cases.length}</strong> 个场景
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-white rounded-2xl border border-warm-200 p-6">
          <h2 className="text-2xl font-semibold mb-3">先认识这个虚构人物</h2>
          <div className="rounded-xl bg-primary-50 border border-primary-100 p-4 mb-5">
            <div className="font-semibold text-lg">{profile.name}</div>
            <div className="text-warm-700 mt-1">关系：{profile.relation}</div>
            <p className="text-warm-700 mt-2 leading-7">{profile.description}</p>
          </div>
          <p className="text-sm text-warm-600 mb-4 leading-6">
            这不是让你判断一个完整真实人物，而是检验：在下面三个明确场景里，哪种回答更符合这份受控资料。
            候选项已去重并重新编号，不显示模型、运行轮次或自动分数。
            回答中的“资料N”是当轮内部片段编号，请按事实能否在下方完整资料中找到来判断，不要按数字对应页面顺序。
          </p>
          <details className="rounded-xl border border-warm-200" open>
            <summary className="cursor-pointer px-4 py-3 font-medium">查看全部人物参考资料（{sources.length} 份）</summary>
            <div className="border-t border-warm-200 p-4 grid gap-3 md:grid-cols-2">
              {sources.map((source) => (
                <article key={source.title} className="rounded-lg bg-warm-50 p-4">
                  <h3 className="font-medium mb-2">{source.title}</h3>
                  <p className="text-sm text-warm-700 leading-6">{source.content}</p>
                </article>
              ))}
            </div>
          </details>
        </section>

        {loadError && (
          <section className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-6">
            {loadError}
          </section>
        )}

        {cases.map((testCase, caseIndex) => {
          const caseReview = reviews[testCase.id];
          const complete = isCaseComplete(testCase, caseReview);
          return (
            <section key={testCase.id} className="bg-white rounded-2xl border border-warm-200 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                  <div className="text-sm text-primary-700 font-medium mb-1">
                    场景 {caseIndex + 1} · {testCase.category}
                  </div>
                  <h2 className="text-xl font-semibold">用户问题：{testCase.question}</h2>
                </div>
                <span className={`text-xs rounded-full px-3 py-1 ${
                  complete ? 'bg-green-100 text-green-800' : 'bg-warm-100 text-warm-600'
                }`}>
                  {complete ? '已完成' : '待评价'}
                </span>
              </div>

              {testCase.history.length > 0 && (
                <div className="rounded-xl bg-warm-50 p-4 mb-5">
                  <div className="text-sm font-medium mb-2">此前对话</div>
                  <div className="space-y-2">
                    {testCase.history.map((message, index) => (
                      <div key={`${message.role}-${index}`} className="text-sm text-warm-700">
                        <strong>{message.role === 'user' ? '小满' : 'AI 模拟'}：</strong>
                        {message.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {testCase.candidates.map((candidate) => {
                  const review = caseReview?.candidates[candidate.id] || EMPTY_CANDIDATE_REVIEW;
                  return (
                    <article key={candidate.id} className="rounded-xl border border-warm-200 overflow-hidden">
                      <div className="bg-warm-50 px-4 py-3 font-medium">匿名回答 {candidate.id}</div>
                      <div className="p-4">
                        <p className="whitespace-pre-wrap leading-7 mb-5">{candidate.answer}</p>
                        <div className="grid gap-5 md:grid-cols-3 mb-5">
                          <ScoreButtons label="直接回应问题" value={review.directness} onChange={(score) => updateCandidate(testCase.id, candidate.id, { directness: score })} />
                          <ScoreButtons label="符合人物特点" value={review.personaFit} onChange={(score) => updateCandidate(testCase.id, candidate.id, { personaFit: score })} />
                          <ScoreButtons label="表达自然" value={review.naturalness} onChange={(score) => updateCandidate(testCase.id, candidate.id, { naturalness: score })} />
                        </div>
                        <div className="mb-4">
                          <div className="text-sm text-warm-700 mb-2">回答中的事实能否在上方完整资料中找到？</div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { value: 'supported', label: '有支持' },
                              { value: 'unsupported', label: '没支持/串资料' },
                              { value: 'uncertain', label: '不确定' },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateCandidate(testCase.id, candidate.id, { grounding: option.value as CandidateReview['grounding'] })}
                                className={`px-3 py-2 rounded-lg border text-sm transition ${
                                  review.grounding === option.value
                                    ? 'bg-primary-600 border-primary-600 text-white'
                                    : 'bg-white border-warm-300 text-warm-700 hover:border-primary-400'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          value={review.note}
                          onChange={(event) => updateCandidate(testCase.id, candidate.id, { note: event.target.value })}
                          rows={2}
                          maxLength={500}
                          placeholder="可选：哪里像、哪里不像？"
                          className="w-full rounded-lg border border-warm-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
                        />
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-6 rounded-xl border border-primary-200 bg-primary-50 p-4">
                <div className="font-medium mb-3">这一场景里，哪一个整体最好？</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {testCase.candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => updateCase(testCase.id, { bestCandidateId: candidate.id })}
                      className={`px-4 py-2 rounded-lg border font-medium transition ${
                        caseReview?.bestCandidateId === candidate.id
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'bg-white border-primary-200 text-primary-800 hover:border-primary-500'
                      }`}
                    >
                      回答 {candidate.id}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateCase(testCase.id, { bestCandidateId: 'none' })}
                    className={`px-4 py-2 rounded-lg border font-medium transition ${
                      caseReview?.bestCandidateId === 'none'
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-white border-primary-200 text-primary-800 hover:border-primary-500'
                    }`}
                  >
                    都不够好
                  </button>
                </div>
                <textarea
                  value={caseReview?.note || ''}
                  onChange={(event) => updateCase(testCase.id, { note: event.target.value })}
                  rows={2}
                  maxLength={500}
                  placeholder="可选：你希望这个人物在此场景中怎样回答？"
                  className="w-full rounded-lg border border-primary-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
                />
              </div>
            </section>
          );
        })}

        {cases.length > 0 && (
          <section className={`rounded-2xl border p-6 ${
            allComplete ? 'bg-green-50 border-green-200' : 'bg-white border-warm-200'
          }`}>
            <h2 className="text-xl font-semibold mb-2">
              {allComplete ? '评审已完成' : `还差 ${cases.length - completedCases} 个场景`}
            </h2>
            <p className="text-sm text-warm-700 mb-4">
              结果只保存在当前浏览器。完成后请复制或下载，再回到 Codex 告诉我“盲评已完成”。
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={copyResults} disabled={!allComplete} className="px-5 py-3 rounded-lg bg-primary-600 text-white font-medium disabled:opacity-40">
                复制评审结果
              </button>
              <button type="button" onClick={downloadResults} disabled={!allComplete} className="px-5 py-3 rounded-lg border border-primary-300 text-primary-800 font-medium disabled:opacity-40">
                下载结果 JSON
              </button>
              <button type="button" onClick={resetReviews} className="px-5 py-3 rounded-lg border border-warm-300 text-warm-700">
                清空重来
              </button>
            </div>
            {copyStatus && <p className="text-sm mt-3 text-warm-700">{copyStatus}</p>}
          </section>
        )}
      </main>
    </div>
  );
}

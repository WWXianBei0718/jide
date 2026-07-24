import type { PersonaMaterialContext } from './persona-context';
import type { RetrievedMaterialChunk } from './memory-retrieval';

export interface RetrievalEvalCase {
  id: string;
  query: string;
  expectedMaterialIds: string[];
  split?: 'development' | 'holdout';
}

export interface RetrievalEvalDataset {
  version: string;
  fictional: true;
  materials: PersonaMaterialContext[];
  cases: RetrievalEvalCase[];
}

export interface RetrievalCaseScore {
  id: string;
  query: string;
  expectedMaterialIds: string[];
  retrievedMaterialIds: string[];
  firstRelevantRank: number | null;
  hit: boolean;
}

export interface RetrievalEvalScore {
  caseCount: number;
  topK: number;
  top1Accuracy: number;
  hitRateAtK: number;
  meanReciprocalRank: number;
  splits: Record<string, {
    caseCount: number;
    top1Accuracy: number;
    hitRateAtK: number;
    meanReciprocalRank: number;
  }>;
  cases: RetrievalCaseScore[];
}

export function scoreRetrieval(
  dataset: RetrievalEvalDataset,
  retrieve: (query: string) => RetrievedMaterialChunk[],
  topK = 10
): RetrievalEvalScore {
  const safeTopK = Math.max(1, Math.floor(topK));
  const cases = dataset.cases.map((testCase) => {
    const retrievedMaterialIds = [
      ...new Set(retrieve(testCase.query).map((item) => item.id)),
    ].slice(0, safeTopK);
    const firstRelevantIndex = retrievedMaterialIds.findIndex((id) =>
      testCase.expectedMaterialIds.includes(id)
    );
    const firstRelevantRank = firstRelevantIndex >= 0 ? firstRelevantIndex + 1 : null;
    return {
      ...testCase,
      retrievedMaterialIds,
      firstRelevantRank,
      hit: firstRelevantRank !== null,
    };
  });

  const splitNames = [...new Set(
    dataset.cases.map((item) => item.split || 'development')
  )];
  const splits = Object.fromEntries(splitNames.map((split) => {
    const splitCases = cases.filter((item) => (item.split || 'development') === split);
    return [split, {
      caseCount: splitCases.length,
      top1Accuracy:
        splitCases.filter((item) => item.firstRelevantRank === 1).length / splitCases.length,
      hitRateAtK: splitCases.filter((item) => item.hit).length / splitCases.length,
      meanReciprocalRank:
        splitCases.reduce(
          (sum, item) => sum + (item.firstRelevantRank ? 1 / item.firstRelevantRank : 0),
          0
        ) / splitCases.length,
    }];
  }));

  return {
    caseCount: cases.length,
    topK: safeTopK,
    top1Accuracy: cases.filter((item) => item.firstRelevantRank === 1).length / cases.length,
    hitRateAtK: cases.filter((item) => item.hit).length / cases.length,
    meanReciprocalRank:
      cases.reduce((sum, item) => sum + (item.firstRelevantRank ? 1 / item.firstRelevantRank : 0), 0) /
      cases.length,
    splits,
    cases,
  };
}

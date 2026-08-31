import type { EvalCategory } from './persona-eval';

export type PersonaStabilityRunStatus = 'completed' | 'unavailable' | 'cost_limit';

export interface PersonaStabilityCaseObservation {
  id: string;
  category: EvalCategory;
  answer: string;
  passed: boolean;
  checks: Record<string, boolean>;
  citations: string[];
}

export interface PersonaStabilityRunObservation {
  runNumber: number;
  status: PersonaStabilityRunStatus;
  passRate: number;
  estimatedCostUsd: number;
  cases: PersonaStabilityCaseObservation[];
}

export type PersonaStabilityCaseStatus =
  | 'stable_pass'
  | 'unstable'
  | 'persistent_failure';

export interface PersonaStabilityCaseSummary {
  id: string;
  category: EvalCategory;
  runCount: number;
  passCount: number;
  passRate: number;
  status: PersonaStabilityCaseStatus;
  failedChecks: Record<string, number>;
  answerVariantCount: number;
  dominantAnswerAgreement: number;
  citationVariantCount: number;
  unsupportedRiskCount: number;
  citationFailureCount: number;
}

export interface PersonaStabilitySummary {
  plannedRunCount: number;
  completedRunCount: number;
  totalCaseObservations: number;
  totalEstimatedCostUsd: number;
  minimumPassRate: number;
  meanPassRate: number;
  maximumPassRate: number;
  stablePassCount: number;
  unstableCount: number;
  persistentFailureCount: number;
  automaticFailureRate: number;
  unsupportedRiskRate: number;
  citationFailureRate: number;
  meanDominantAnswerAgreement: number;
  cases: PersonaStabilityCaseSummary[];
}

const UNSUPPORTED_RISK_CHECKS = new Set([
  'avoidsForbidden',
  'citationsAreAllowed',
  'hasUnknownBoundary',
  'hasInferenceHedge',
  'hasAiDisclosure',
]);

const CITATION_CHECKS = new Set(['hasCitation', 'citationsAreAllowed']);

function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, ' ');
}

function normalizeCitations(citations: string[]): string {
  return [...new Set(citations)].sort().join('|');
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 0;
}

function dominantAgreement(values: string[]): number {
  if (!values.length) return 0;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Math.max(...counts.values()) / values.length;
}

export function isUnsupportedRiskObservation(
  checks: Record<string, boolean>
): boolean {
  return Object.entries(checks).some(
    ([name, passed]) => UNSUPPORTED_RISK_CHECKS.has(name) && !passed
  );
}

export function isCitationFailureObservation(
  checks: Record<string, boolean>
): boolean {
  return Object.entries(checks).some(
    ([name, passed]) => CITATION_CHECKS.has(name) && !passed
  );
}

export function summarizePersonaStability(
  runs: PersonaStabilityRunObservation[],
  plannedRunCount = runs.length
): PersonaStabilitySummary {
  const completedRuns = runs.filter((run) => run.status === 'completed');
  const observationsById = new Map<string, PersonaStabilityCaseObservation[]>();
  let expectedCaseIds: Set<string> | undefined;

  for (const run of completedRuns) {
    const idsInRun = new Set<string>();
    for (const observation of run.cases) {
      if (idsInRun.has(observation.id)) {
        throw new Error(`Duplicate stability case in run ${run.runNumber}: ${observation.id}`);
      }
      idsInRun.add(observation.id);
      const observations = observationsById.get(observation.id) || [];
      observations.push(observation);
      observationsById.set(observation.id, observations);
    }
    if (!expectedCaseIds) {
      expectedCaseIds = idsInRun;
    } else if (
      idsInRun.size !== expectedCaseIds.size
      || [...expectedCaseIds].some((id) => !idsInRun.has(id))
    ) {
      throw new Error(`Stability run ${run.runNumber} has a different case set.`);
    }
  }

  const cases = [...observationsById.entries()].map(([id, observations]) => {
    const categories = new Set(observations.map((item) => item.category));
    if (categories.size !== 1) throw new Error(`Stability case changed category: ${id}`);

    const failedChecks: Record<string, number> = {};
    for (const observation of observations) {
      for (const [name, passed] of Object.entries(observation.checks)) {
        if (!passed) failedChecks[name] = (failedChecks[name] || 0) + 1;
      }
    }

    const passCount = observations.filter((item) => item.passed).length;
    const status: PersonaStabilityCaseStatus = passCount === observations.length
      ? 'stable_pass'
      : passCount === 0
        ? 'persistent_failure'
        : 'unstable';
    const answers = observations.map((item) => normalizeAnswer(item.answer));
    const citationSets = observations.map((item) => normalizeCitations(item.citations));

    return {
      id,
      category: observations[0].category,
      runCount: observations.length,
      passCount,
      passRate: ratio(passCount, observations.length),
      status,
      failedChecks,
      answerVariantCount: new Set(answers).size,
      dominantAnswerAgreement: dominantAgreement(answers),
      citationVariantCount: new Set(citationSets).size,
      unsupportedRiskCount: observations.filter((item) =>
        isUnsupportedRiskObservation(item.checks)
      ).length,
      citationFailureCount: observations.filter((item) =>
        isCitationFailureObservation(item.checks)
      ).length,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  const passRates = completedRuns.map((run) => run.passRate);
  const totalCaseObservations = cases.reduce((sum, item) => sum + item.runCount, 0);
  const failedObservations = cases.reduce(
    (sum, item) => sum + item.runCount - item.passCount,
    0
  );
  const unsupportedRiskObservations = cases.reduce(
    (sum, item) => sum + item.unsupportedRiskCount,
    0
  );
  const citationFailureObservations = cases.reduce(
    (sum, item) => sum + item.citationFailureCount,
    0
  );

  return {
    plannedRunCount,
    completedRunCount: completedRuns.length,
    totalCaseObservations,
    totalEstimatedCostUsd: runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0),
    minimumPassRate: passRates.length ? Math.min(...passRates) : 0,
    meanPassRate: ratio(passRates.reduce((sum, rate) => sum + rate, 0), passRates.length),
    maximumPassRate: passRates.length ? Math.max(...passRates) : 0,
    stablePassCount: cases.filter((item) => item.status === 'stable_pass').length,
    unstableCount: cases.filter((item) => item.status === 'unstable').length,
    persistentFailureCount: cases.filter((item) => item.status === 'persistent_failure').length,
    automaticFailureRate: ratio(failedObservations, totalCaseObservations),
    unsupportedRiskRate: ratio(unsupportedRiskObservations, totalCaseObservations),
    citationFailureRate: ratio(citationFailureObservations, totalCaseObservations),
    meanDominantAnswerAgreement: ratio(
      cases.reduce((sum, item) => sum + item.dominantAnswerAgreement, 0),
      cases.length
    ),
    cases,
  };
}

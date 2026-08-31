import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCitationFailureObservation,
  isUnsupportedRiskObservation,
  summarizePersonaStability,
  type PersonaStabilityRunObservation,
} from '../src/lib/persona-stability';

function observation(
  id: string,
  passed: boolean,
  checks: Record<string, boolean>,
  answer = `${id}-${passed}`
) {
  return {
    id,
    category: 'fact' as const,
    answer,
    passed,
    checks,
    citations: ['[资料1]'],
  };
}

test('summarizes stable, unstable, and persistent failure cases across completed runs', () => {
  const runs: PersonaStabilityRunObservation[] = [1, 2, 3].map((runNumber) => ({
    runNumber,
    status: 'completed',
    passRate: runNumber === 1 ? 1 / 3 : 2 / 3,
    estimatedCostUsd: 0.01,
    cases: [
      observation('stable', true, { hasCitation: true }, 'same answer'),
      observation('unstable', runNumber > 1, { hasCitation: runNumber > 1 }),
      observation('persistent', false, { avoidsForbidden: false }),
    ],
  }));

  const summary = summarizePersonaStability(runs, 3);
  assert.equal(summary.completedRunCount, 3);
  assert.equal(summary.totalCaseObservations, 9);
  assert.equal(summary.stablePassCount, 1);
  assert.equal(summary.unstableCount, 1);
  assert.equal(summary.persistentFailureCount, 1);
  assert.equal(summary.totalEstimatedCostUsd, 0.03);
  assert.equal(summary.citationFailureRate, 1 / 9);
  assert.equal(summary.unsupportedRiskRate, 3 / 9);
  assert.equal(summary.cases.find((item) => item.id === 'stable')?.answerVariantCount, 1);
  assert.equal(summary.cases.find((item) => item.id === 'unstable')?.passCount, 2);
});

test('labels only explicit grounding boundary failures as unsupported-risk proxies', () => {
  assert.equal(isUnsupportedRiskObservation({ hasRequiredAny: false }), false);
  assert.equal(isUnsupportedRiskObservation({ citationsAreAllowed: false }), true);
  assert.equal(isUnsupportedRiskObservation({ hasUnknownBoundary: false }), true);
  assert.equal(isUnsupportedRiskObservation({ hasInferenceHedge: false }), true);
  assert.equal(isCitationFailureObservation({ hasRequiredAny: false }), false);
  assert.equal(isCitationFailureObservation({ hasCitation: false }), true);
});

test('rejects duplicate case observations within one stability run', () => {
  assert.throws(() => summarizePersonaStability([{
    runNumber: 1,
    status: 'completed',
    passRate: 1,
    estimatedCostUsd: 0,
    cases: [
      observation('duplicate', true, {}),
      observation('duplicate', true, {}),
    ],
  }]), /Duplicate stability case/);
});

test('rejects completed stability runs with different case coverage', () => {
  assert.throws(() => summarizePersonaStability([
    {
      runNumber: 1,
      status: 'completed',
      passRate: 1,
      estimatedCostUsd: 0,
      cases: [observation('first', true, {})],
    },
    {
      runNumber: 2,
      status: 'completed',
      passRate: 1,
      estimatedCostUsd: 0,
      cases: [observation('second', true, {})],
    },
  ]), /different case set/);
});

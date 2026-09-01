export interface BlindEvalCandidate {
  id: string;
  answer: string;
}

function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, ' ');
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createBlindEvalCandidates(
  caseId: string,
  answers: string[]
): BlindEvalCandidate[] {
  const uniqueAnswers = [...new Map(
    answers
      .map((answer) => ({ normalized: normalizeAnswer(answer), answer: answer.trim() }))
      .filter((item) => item.normalized)
      .map((item) => [item.normalized, item.answer])
  ).values()];

  return uniqueAnswers
    .map((answer) => ({ answer, order: stableHash(`${caseId}\u0000${answer}`) }))
    .sort((left, right) => left.order - right.order || left.answer.localeCompare(right.answer))
    .map((item, index) => ({
      id: String.fromCharCode(65 + index),
      answer: item.answer,
    }));
}

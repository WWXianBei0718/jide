export const MESSAGE_FEEDBACK_REASONS = [
  'fact_wrong',
  'tone_wrong',
  'relationship_wrong',
  'unsupported',
  'too_generic',
] as const;

export type MessageFeedbackReason = typeof MESSAGE_FEEDBACK_REASONS[number];
export type MessageFeedbackVerdict = 'like' | 'unlike';

export const MESSAGE_FEEDBACK_REASON_LABELS: Record<MessageFeedbackReason, string> = {
  fact_wrong: '事实不对',
  tone_wrong: '语气不像',
  relationship_wrong: '关系感不对',
  unsupported: '像在编造',
  too_generic: '太像通用 AI',
};

export const MAX_MESSAGE_FEEDBACK_NOTE_CHARACTERS = 500;
export const MAX_MESSAGE_FEEDBACK_REASONS = 5;

export interface ValidatedMessageFeedback {
  verdict: MessageFeedbackVerdict;
  reasons: MessageFeedbackReason[];
  note: string | null;
}

export function validateMessageFeedback(input: {
  verdict: unknown;
  reasons: unknown;
  note: unknown;
}): ValidatedMessageFeedback | null {
  if (input.verdict !== 'like' && input.verdict !== 'unlike') return null;
  if (!Array.isArray(input.reasons)) return null;

  const reasons = Array.from(new Set(input.reasons));
  if (
    reasons.length > MAX_MESSAGE_FEEDBACK_REASONS
    || reasons.some((reason) =>
      typeof reason !== 'string'
      || !MESSAGE_FEEDBACK_REASONS.includes(reason as MessageFeedbackReason)
    )
  ) {
    return null;
  }

  if (input.verdict === 'like' && reasons.length > 0) return null;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > MAX_MESSAGE_FEEDBACK_NOTE_CHARACTERS) return null;

  return {
    verdict: input.verdict,
    reasons: reasons as MessageFeedbackReason[],
    note: note || null,
  };
}

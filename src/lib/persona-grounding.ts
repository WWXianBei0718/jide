import type {
  ConversationContextMessage,
  PersonaMaterialContext,
  PreparedConversationMessage,
} from './persona-context';
import { isHypotheticalPersonaQuestion } from './persona-context';

export const PERSONA_GROUNDING_REVIEW_VERSION = 'persona-grounding-review-v6';
export const MAX_GROUNDING_DRAFT_CHARACTERS = 6000;

const CITATION_PATTERN = /\[(?:资料\d+|人物档案)\]/g;
const SPECULATIVE_LANGUAGE_PATTERN = /从现有资料看|我只能推测|推测|大概|也许|或许|可能|若是|如果/;
const QUOTED_TEXT_PATTERN = /[“「『]([^”」』]{2,})[”」』]/g;
const CURRENT_CONCERN_RULES = [
  { question: /夸|表扬|称赞/, answer: /夸|高兴|不会那样|不太会/ },
  { question: /熬夜|凌晨|没睡|失眠/, answer: /睡|休息|身体|身子/ },
  { question: /没吃|没吃饭|饿/, answer: /吃|饭/ },
] as const;

export interface PersonaGroundingReviewInput {
  question: string;
  draft: string;
  conversation: Array<PreparedConversationMessage | ConversationContextMessage>;
  materials: PersonaMaterialContext[];
}

export interface PersonaGroundingReviewMessages {
  systemSuffix: string;
  userContent: string;
}

export interface FinalizedPersonaAnswer {
  answer: string;
  reducedToPrimarySource: boolean;
}

function escapeData(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function quotedClaims(value: string): string[] {
  return [...value.matchAll(QUOTED_TEXT_PATTERN)].map((match) => match[1].trim());
}

export function shouldReviewPersonaAnswer(input: PersonaGroundingReviewInput): boolean {
  const citations = input.draft.match(CITATION_PATTERN) || [];
  const materialText = input.materials.map((material) => material.content || '').join('\n');
  const hasUnsupportedQuote = quotedClaims(input.draft)
    .some((quote) => !materialText.includes(quote));
  const missesCurrentConcern = CURRENT_CONCERN_RULES.some((rule) =>
    rule.question.test(input.question) && !rule.answer.test(input.draft)
  );

  return (
    isHypotheticalPersonaQuestion(input.question)
    || input.conversation.length > 1
    || citations.length > 1
    || SPECULATIVE_LANGUAGE_PATTERN.test(input.draft)
    || hasUnsupportedQuote
    || missesCurrentConcern
    || input.draft.length > 220
  );
}

export function finalizePersonaGroundingReview(answer: string): FinalizedPersonaAnswer {
  const trimmed = answer.trim();
  const citations = [...new Set(trimmed.match(CITATION_PATTERN) || [])];
  if (citations.length <= 1) {
    return { answer: trimmed, reducedToPrimarySource: false };
  }

  const primaryCitation = citations[0];
  const segments = trimmed
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const selected: string[] = [];
  let foundPrimarySource = false;

  for (const segment of segments) {
    const segmentCitations = [...new Set(segment.match(CITATION_PATTERN) || [])];
    if (!segmentCitations.length && !foundPrimarySource) {
      selected.push(segment);
      continue;
    }
    if (segmentCitations.includes(primaryCitation)) {
      const primaryCitationEnd = segment.indexOf(primaryCitation) + primaryCitation.length;
      selected.push(segment.slice(0, primaryCitationEnd).trim());
      foundPrimarySource = true;
      if (segmentCitations.length > 1) break;
      continue;
    }
    if (foundPrimarySource || segmentCitations.length > 0) break;
  }

  const reducedAnswer = selected
    .join(' ')
    .replace(/\s+(\[(?:资料\d+|人物档案)\])/g, '$1')
    .trim();
  return {
    answer: reducedAnswer || trimmed,
    reducedToPrimarySource: Boolean(reducedAnswer && reducedAnswer !== trimmed),
  };
}

export function buildPersonaGroundingReviewMessages(
  input: PersonaGroundingReviewInput
): PersonaGroundingReviewMessages {
  const conversation = input.conversation.map((message) =>
    `<message role="${message.role}">${escapeData(message.content)}</message>`
  ).join('\n');
  const draft = escapeData(input.draft.slice(0, MAX_GROUNDING_DRAFT_CHARACTERS));

  return {
    systemSuffix: `

<final_grounding_review version="${PERSONA_GROUNDING_REVIEW_VERSION}">
你现在执行最终依据审校，不是在继续创作。只输出修订后的最终回答，不解释审校过程，不输出标签或 JSON。
1. 每个事实、动作、物品、地点、引语和因果都必须由当前记忆资料直接支持，并且必须直接回答当前问题。
2. 即使某个细节在其他资料中真实，只要与当前问题无关，也必须删除。
3. “主题相近”“符合性格”或“可能有帮助”不等于相关。若问题询问某个具体事件或场景，通用习惯、口头禅、饮食和价值观只有在资料明确记录它被用于该事件或同类场景时才能保留。例如，问题询问某次生病时，资料中的日常早餐即使真实也必须删除。
4. 不得把日常习惯改写成某个未记录场景中发生过的动作；不得把一般价值观写成亲历事件。
5. 资料中没有逐字出现的引语必须改为不带引号的转述或删除。
6. 保留正确的未知边界、AI 身份说明和有限推断措辞；不得把推断升级为事实。
7. 引用标签只证明内容来自某份资料，不证明内容回答了当前问题。引用只能使用原草稿已有且确实支持相邻内容的精确 [资料N] 或 [人物档案]；不得新增来源编号。
8. 执行“最小充分答案”：若最高相关的 [资料1] 已经直接、完整回答问题，只保留这部分，删除来自其他资料的补充。只有当前问题明确包含多个子问题，而且 [资料1] 无法回答缺少的部分时，才保留后续资料。
9. 对话历史不能证明人物生平，但能证明本次谈话里用户刚说的需求和助手已经承诺的下一步。若当前问题是追问，回答必须延续最近一轮尚未完成的明确计划，不得换成资料中的其他习惯或物品。
10. 最终回答必须直接处理用户当前最主要的状态；不得用吃饭、喝茶或列计划替代睡眠、健康等被明确问到的问题。
11. 若用户要求确认某种性格、教学方式或习惯，而资料没有直接记录，必须改成无法确认的克制回答，删除为证明它而补写的任何例子。
12. 最终回答默认不超过 2 个短句。优先删减；除纠正语法、恢复必要边界，或恢复对话历史里已明确承诺的下一步外，不得加入原草稿没有的新内容。
</final_grounding_review>`,
    userContent: `<conversation_data>
${conversation}
</conversation_data>
<current_question>${escapeData(input.question)}</current_question>
<draft_answer>${draft}</draft_answer>
请按最终依据审校规则输出修订后的回答。`,
  };
}

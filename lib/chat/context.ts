import "server-only";
import type { LanguageModel, ModelMessage } from "ai";
import { z } from "zod";
import { readAnswerHistory } from "@/lib/db/queries/chat";
import { getClassroom, ClassroomError } from "@/lib/services/classroom";
import { projectTeachingContext } from "@/lib/services/teaching-context";
import { buildChatPrompt } from "@/lib/prompts/build-chat-prompt";
import type { ChatTurn } from "@/lib/types/chat";
import type { TeachingContext } from "@/lib/types/teaching-context";
import type { ClassroomReadResponse } from "@/lib/types/classroom";
import { ChatAgentError, ChatBudget, CHAT_LIMITS } from "./budget";

type ReadyClassroom = Extract<ClassroomReadResponse, { state: "ready" }>["classroom"];

export type ProtectedQuestion = {
  sceneId: string;
  id: string;
  question: string;
  options?: { value: string; label: string }[];
};

export type Candidate = { id: string; text: string };

/** 供模型与最终检查使用的本轮聊天上下文快照。 */
export type ChatContext = {
  course: TeachingContext["course"];
  scene: unknown;
  protectedQuestions: ProtectedQuestion[];
  history: ModelMessage[];
  memory: { text: string; turnIds: string[] }[];
  pendingGrading: { sceneId: string; questionId: string; status: string }[];
};

const admittedSchema = z.object({ allowedIds: z.array(z.string()).max(100) }).strict();
const memorySelectSchema = z.object({ turnIds: z.array(z.uuid()).max(4) }).strict();
const memorySummarySchema = z
  .object({
    items: z
      .array(
        z
          .object({
            text: z.string().min(1).max(500),
            turnIds: z.array(z.uuid()).min(1).max(4),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
const finalCheckSchema = z.object({ safe: z.boolean() }).strict();

/**
 * 收集未提交测验题的题干与可见选项；标准答案不在此列出。
 */
export function protectedQuestions(classroom: ReadyClassroom): ProtectedQuestion[] {
  return classroom.scenes.flatMap((scene) =>
    scene.content.type !== "quiz"
      ? []
      : scene.content.questions
        .filter(
          (question) =>
            !classroom.answers.some(
              (answer) =>
                answer.sceneId === scene.id && answer.questionId === question.id,
            ),
        )
        .map((question) => ({
          sceneId: scene.id,
          id: question.id,
          question: question.question,
          ...(question.type === "short_answer"
            ? {}
            : {
              options: question.options.map(({ value, label }) => ({
                value,
                label,
              })),
            }),
        })),
  );
}

/** 读取已就绪课堂；未就绪时抛 ClassroomError。 */
export async function readChatClassroom(stageId: string) {
  const response = await getClassroom(stageId);
  if (response.state !== "ready") {
    throw new ClassroomError("NOT_READY", "课堂尚未就绪");
  }
  return response.classroom;
}

function checkCandidateLength(text: string) {
  if (text.length > CHAT_LIMITS.candidateChars) {
    throw new ChatAgentError("LIMIT_EXCEEDED", "候选资料超过本轮长度限制");
  }
}

/** 模型只能从本批候选中选择，不能凭空添加来源或重复返回 ID。 */
function assertRelevanceFilterResult(
  result: z.infer<typeof admittedSchema>,
  batch: Candidate[],
) {
  const batchIds = new Set(batch.map((item) => item.id));
  const hasUnknownId = result.allowedIds.some((id) => !batchIds.has(id));
  const hasDuplicateId = new Set(result.allowedIds).size !== result.allowedIds.length;
  if (hasUnknownId || hasDuplicateId) {
    throw new ChatAgentError(
      "REPLY_INVALID",
      "资料筛选结果无效，未放行候选内容",
      "REPLY_INVALID",
    );
  }
}

/**
 * 按批调用模型筛选与当前问题相关的资料候选；受 candidateChars 与每批条数上限约束。
 */
export async function filterRelevantCandidates(
  candidates: Candidate[],
  model: LanguageModel,
  budget: ChatBudget,
  query: string,
): Promise<Set<string>> {
  if (!candidates.length) {
    return new Set();
  }

  const allowed = new Set<string>();
  let batch: Candidate[] = [];
  let batchChars = 0;

  const flush = async () => {
    if (!batch.length) {
      return;
    }
    const result = await budget.structured(
      model,
      buildChatPrompt("chat-context-filter"),
      { task: "relevance", query, candidates: batch },
      admittedSchema,
    );
    assertRelevanceFilterResult(result, batch);
    result.allowedIds.forEach((id) => allowed.add(id));
    batch = [];
    batchChars = 0;
  };

  for (const candidate of candidates) {
    checkCandidateLength(candidate.text);
    if (
      batchChars + candidate.text.length > CHAT_LIMITS.candidateChars ||
      batch.length === 80
    ) {
      await flush();
    }
    batch.push(candidate);
    batchChars += candidate.text.length;
  }
  await flush();
  return allowed;
}

/** 将一轮问答转为模型消息；assistant 行携带教师/场景/轮次标识便于溯源。 */
function turnMessages(turn: ChatTurn): ModelMessage[] {
  return [
    { role: "user", content: turn.question },
    {
      role: "assistant",
      content: `[Teacher: ${turn.teacherId}; scene: ${turn.sceneId}; turn: ${turn.id}]\n${turn.reply}`,
    },
  ];
}

function extractQueryTerms(question: string): string[] {
  return [
    ...new Intl.Segmenter("zh", { granularity: "word" }).segment(
      question.toLowerCase(),
    ),
  ]
    .filter((item) => item.isWordLike && item.segment.length > 1)
    .map((item) => item.segment);
}

/**
 * 先保留近期轮次，再按问题词语和场景筛选有界的旧历史候选。
 */
function historyCandidates(saved: ChatTurn[], record: ChatTurn): ChatTurn[] {
  const recent = saved.slice(-3);
  const recentIds = new Set(recent.map((turn) => turn.id));
  const terms = extractQueryTerms(record.question);

  const ranked = saved
    .filter((turn) => !recentIds.has(turn.id))
    .map((turn, index) => ({
      turn,
      index,
      score:
        terms.reduce(
          (score, term) =>
            score +
            ((turn.question + "\n" + turn.reply).toLowerCase().includes(term)
              ? 4
              : 0),
          0,
        ) + (turn.sceneId === record.sceneId ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.index - a.index);

  const ids = new Set(recentIds);
  let chars = recent.reduce(
    (size, turn) => size + turn.question.length + (turn.reply?.length ?? 0),
    0,
  );

  for (const { turn } of ranked) {
    const size = turn.question.length + (turn.reply?.length ?? 0);
    if (ids.size >= 24) {
      break;
    }
    if (chars + size > CHAT_LIMITS.candidateChars * 2) {
      continue;
    }
    ids.add(turn.id);
    chars += size;
  }

  return saved.filter((turn) => ids.has(turn.id));
}

function pendingGradingSnapshot(classroom: ReadyClassroom) {
  return classroom.answers
    .filter((answer) => answer.status !== "completed")
    .map(({ sceneId, questionId, status }) => ({ sceneId, questionId, status }));
}

/** 在 historyChars 内从尾部尽量取满 3 轮完整问答。 */
function collectRecentTurnsWithinBudget(history: ChatTurn[]) {
  let recentSize = 0;
  const recent: ChatTurn[] = [];
  for (let index = history.length - 1; index >= 0 && recent.length < 3; index--) {
    const size = JSON.stringify(turnMessages(history[index])).length;
    if (recentSize + size > CHAT_LIMITS.historyChars) {
      break;
    }
    recent.unshift(history[index]);
    recentSize += size;
  }
  return { recent, recentSize };
}

/** 选择结果必须能追溯到当前会话的旧轮次，且不能重复。 */
function assertMemorySelectionValid(
  turnIds: string[],
  older: ChatTurn[],
) {
  const selectedIds = new Set(turnIds);
  const hasDuplicate = selectedIds.size !== turnIds.length;
  const hasUnknown = turnIds.some((id) => !older.some((turn) => turn.id === id));
  if (hasDuplicate || hasUnknown) {
    throw new ChatAgentError(
      "REPLY_INVALID",
      "历史选择包含无效来源",
      "REPLY_INVALID",
    );
  }
  return selectedIds;
}

/**
 * 从当前会话和发送时场景准备上下文；长历史按需选择或摘要。
 */
export async function prepareChatContext(
  record: ChatTurn,
  model: LanguageModel,
  budget: ChatBudget,
): Promise<ChatContext> {
  const classroom = await readChatClassroom(record.stageId);
  budget.check();

  const teaching = projectTeachingContext(
    { stageId: record.stageId, sceneId: record.sceneId },
    classroom,
  );
  const questions = protectedQuestions(classroom);
  const saved = await readAnswerHistory({
    stageId: record.stageId,
    sessionId: record.sessionId,
    sceneId: record.sceneId,
    turnId: record.id,
  });
  const history = historyCandidates(saved, record);

  history.forEach((turn) =>
    checkCandidateLength(
      JSON.stringify({
        question: turn.question,
        reply: turn.reply,
        sceneId: turn.sceneId,
      }),
    ),
  );
  checkCandidateLength(JSON.stringify(teaching.scene));
  checkCandidateLength(
    JSON.stringify({
      name: teaching.course.name,
      directory: teaching.course.outlines.map(({ id, title }) => ({ id, title })),
    }),
  );

  const context: ChatContext = {
    course: teaching.course,
    scene: teaching.scene,
    protectedQuestions: questions,
    history: [],
    memory: [],
    pendingGrading: pendingGradingSnapshot(classroom),
  };

  if (JSON.stringify(history.map(turnMessages)).length <= CHAT_LIMITS.historyChars) {
    context.history = history.flatMap(turnMessages);
    return context;
  }

  // --- 超出历史预算：近期完整问答 + 可选的旧轮次索引 / 摘要 ---
  const { recent, recentSize } = collectRecentTurnsWithinBudget(history);
  if (!recent.length) {
    throw new ChatAgentError(
      "LIMIT_EXCEEDED",
      "近期完整问答超过本轮上下文长度",
    );
  }

  context.history = recent.flatMap(turnMessages);
  const recentIds = new Set(recent.map((turn) => turn.id));
  const older = history.filter((turn) => !recentIds.has(turn.id));
  const index = older.map((turn) => ({
    id: turn.id,
    sceneId: turn.sceneId,
    teacherId: turn.teacherId,
    question: turn.question.slice(0, 220),
    replyPreview: turn.reply!.slice(0, 160),
  }));

  if (JSON.stringify(index).length > CHAT_LIMITS.candidateChars) {
    throw new ChatAgentError(
      "LIMIT_EXCEEDED",
      "历史索引超过本轮长度，请缩小本次问题范围",
    );
  }

  const selected = await budget.structured(
    model,
    buildChatPrompt("chat-memory"),
    {
      task: "select",
      question: record.question,
      sceneId: record.sceneId,
      recent: context.history,
      candidates: index,
    },
    memorySelectSchema,
  );
  const selectedIds = assertMemorySelectionValid(selected.turnIds, older);
  const originals = older.filter((turn) => selectedIds.has(turn.id));

  if (!originals.length) {
    return context;
  }

  if (
    JSON.stringify(originals.map(turnMessages)).length + recentSize <=
    CHAT_LIMITS.historyChars
  ) {
    context.history = [...originals.flatMap(turnMessages), ...context.history];
    return context;
  }

  // 选中的原始问答仍放不下时才生成临时摘要；原始记录仍保存在数据库。
  const summary = await budget.structured(
    model,
    buildChatPrompt("chat-memory"),
    {
      task: "summarize",
      question: record.question,
      turns: originals.map((turn) => ({
        id: turn.id,
        messages: turnMessages(turn),
      })),
    },
    memorySummarySchema,
  );
  if (summary.items.some((item) => item.turnIds.some((id) => !selectedIds.has(id)))) {
    throw new ChatAgentError(
      "REPLY_INVALID",
      "会话摘要包含无效来源",
      "REPLY_INVALID",
    );
  }
  context.memory = summary.items;
  return context;
}

/**
 * 轻量测验保护下的终稿检查；无保护题时跳过。模型判断仍可能漏判。
 */
export async function checkFinalAnswer(
  reply: string,
  context: ChatContext,
  model: LanguageModel,
  budget: ChatBudget,
) {
  if (!context.protectedQuestions.length) {
    return;
  }
  const result = await budget.structured(
    model,
    buildChatPrompt("chat-context-filter"),
    {
      task: "final_check",
      protectedQuestions: context.protectedQuestions,
      pendingGrading: context.pendingGrading,
      draft: reply,
    },
    finalCheckSchema,
  );
  if (!result.safe) {
    throw new ChatAgentError(
      "REPLY_INVALID",
      "回复未通过测验状态与提示边界检查，可换用提示性问题重试",
      "REPLY_INVALID",
    );
  }
}
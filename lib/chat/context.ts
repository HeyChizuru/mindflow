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
export type ProtectedQuestion = { sceneId: string; id: string; question: string; options?: { value: string; label: string }[] };
export type Candidate = { id: string; text: string };
export type ChatContext = {
  course: TeachingContext["course"]; scene: unknown; protectedQuestions: ProtectedQuestion[];
  history: ModelMessage[]; memory: { text: string; turnIds: string[] }[]; restrictedHistory: boolean;
  pendingGrading: { sceneId: string; questionId: string; status: string }[];
};

export function protectedQuestions(classroom: ReadyClassroom): ProtectedQuestion[] {
  return classroom.scenes.flatMap((scene) => scene.content.type !== "quiz" ? [] : scene.content.questions
    .filter((question) => !classroom.answers.some((answer) => answer.sceneId === scene.id && answer.questionId === question.id))
    .map((question) => ({ sceneId: scene.id, id: question.id, question: question.question,
      ...(question.type === "short_answer" ? {} : { options: question.options.map(({ value, label }) => ({ value, label })) }) })));
}

export async function readChatClassroom(stageId: string) {
  const response = await getClassroom(stageId);
  if (response.state !== "ready") throw new ClassroomError("NOT_READY", "课堂尚未就绪");
  return response.classroom;
}

const admittedSchema = z.object({ allowedIds: z.array(z.string()).max(100) }).strict();
export async function filterCandidates(
  candidates: Candidate[], questions: ProtectedQuestion[], model: LanguageModel, budget: ChatBudget,
  task: "admission" | "relevance" = "admission", query = "",
): Promise<Set<string>> {
  if (!candidates.length || (task === "admission" && !questions.length)) return new Set(candidates.map((item) => item.id));
  const allowed = new Set<string>();
  let batch: Candidate[] = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const result = await budget.structured(model, buildChatPrompt("chat-context-filter"), {
      task, query, protectedQuestions: questions, candidates: batch,
    }, admittedSchema);
    const ids = new Set(batch.map((item) => item.id));
    if (result.allowedIds.some((id) => !ids.has(id)) || new Set(result.allowedIds).size !== result.allowedIds.length) {
      throw new ChatAgentError("REPLY_INVALID", "资料筛选结果无效，未放行候选内容", "REPLY_INVALID");
    }
    result.allowedIds.forEach((id) => allowed.add(id));
    batch = []; size = 0;
  };
  for (const candidate of candidates) {
    if (candidate.text.length > CHAT_LIMITS.candidateChars) throw new ChatAgentError("LIMIT_EXCEEDED", "候选资料超过本轮安全检查长度");
    if (size + candidate.text.length > CHAT_LIMITS.candidateChars || batch.length === 80) await flush();
    batch.push(candidate); size += candidate.text.length;
  }
  await flush();
  return allowed;
}

function turnMessages(turn: ChatTurn): ModelMessage[] {
  return [
    { role: "user", content: turn.question },
    { role: "assistant", content: `[Teacher: ${turn.teacherId}; scene: ${turn.sceneId}; turn: ${turn.id}]\n${turn.reply}` },
  ];
}

function historyCandidates(saved: ChatTurn[], record: ChatTurn): ChatTurn[] {
  const recent = saved.slice(-3);
  const recentIds = new Set(recent.map((turn) => turn.id));
  const terms = [...new Intl.Segmenter("zh", { granularity: "word" }).segment(record.question.toLowerCase())]
    .filter((item) => item.isWordLike && item.segment.length > 1).map((item) => item.segment);
  const ranked = saved.filter((turn) => !recentIds.has(turn.id)).map((turn, index) => ({
    turn, index, score: terms.reduce((score, term) => score + ((turn.question + "\n" + turn.reply).toLowerCase().includes(term) ? 4 : 0), 0)
      + (turn.sceneId === record.sceneId ? 1 : 0),
  })).sort((a, b) => b.score - a.score || b.index - a.index);
  const ids = new Set(recentIds);
  let chars = recent.reduce((size, turn) => size + turn.question.length + (turn.reply?.length ?? 0), 0);
  for (const { turn } of ranked) {
    const size = turn.question.length + (turn.reply?.length ?? 0);
    if (ids.size >= 24) break;
    if (chars + size > CHAT_LIMITS.candidateChars * 2) continue;
    ids.add(turn.id); chars += size;
  }
  return saved.filter((turn) => ids.has(turn.id));
}

export async function prepareChatContext(record: ChatTurn, model: LanguageModel, budget: ChatBudget): Promise<ChatContext> {
  const classroom = await readChatClassroom(record.stageId);
  budget.check();
  const teaching = projectTeachingContext({ stageId: record.stageId, sceneId: record.sceneId }, classroom);
  const questions = protectedQuestions(classroom);
  const saved = await readAnswerHistory({ stageId: record.stageId, sessionId: record.sessionId, sceneId: record.sceneId, turnId: record.id });
  const pool = historyCandidates(saved, record);
  const candidates = pool.map((turn) => ({ id: turn.id, text: JSON.stringify({ question: turn.question, reply: turn.reply, sceneId: turn.sceneId }) }));
  const allowed = await filterCandidates(candidates, questions, model, budget);
  const history = pool.filter((turn) => allowed.has(turn.id));
  const sceneAllowed = await filterCandidates([
    { id: teaching.scene.id, text: JSON.stringify(teaching.scene) },
    { id: "course-metadata", text: JSON.stringify({ name: teaching.course.name,
      directory: teaching.course.outlines.map(({ id, title }) => ({ id, title })) }) },
  ], questions, model, budget);
  const metadataAllowed = sceneAllowed.has("course-metadata");
  const context: ChatContext = {
    course: { ...teaching.course, name: metadataAllowed ? teaching.course.name : "当前课堂",
      outlines: teaching.course.outlines.map((outline) => questions.length
        ? { ...outline, title: metadataAllowed ? outline.title : `场景 ${outline.order}`, description: "", keyPoints: [] } : outline) },
    scene: sceneAllowed.has(teaching.scene.id) ? teaching.scene
      : { id: teaching.scene.id, type: teaching.scene.type, status: "restricted" },
    protectedQuestions: questions, history: [], memory: [], restrictedHistory: history.length !== pool.length,
    pendingGrading: classroom.answers.filter((answer) => answer.status !== "completed")
      .map(({ sceneId, questionId, status }) => ({ sceneId, questionId, status })),
  };
  if (JSON.stringify(history.map(turnMessages)).length <= CHAT_LIMITS.historyChars) {
    context.history = history.flatMap(turnMessages);
    return context;
  }

  // Preserve whole recent pairs; the remainder is selected by bounded, attributed IDs.
  let recentSize = 0;
  const recent: ChatTurn[] = [];
  for (let index = history.length - 1; index >= 0 && recent.length < 3; index--) {
    const size = JSON.stringify(turnMessages(history[index])).length;
    if (recentSize + size > CHAT_LIMITS.historyChars) break;
    recent.unshift(history[index]); recentSize += size;
  }
  if (!recent.length) throw new ChatAgentError("LIMIT_EXCEEDED", "近期完整问答超过本轮上下文长度");
  context.history = recent.flatMap(turnMessages);
  const recentIds = new Set(recent.map((turn) => turn.id));
  const older = history.filter((turn) => !recentIds.has(turn.id));
  const index = older.map((turn) => ({ id: turn.id, sceneId: turn.sceneId, teacherId: turn.teacherId,
    question: turn.question.slice(0, 220), replyPreview: turn.reply!.slice(0, 160) }));
  if (JSON.stringify(index).length > CHAT_LIMITS.candidateChars) throw new ChatAgentError("LIMIT_EXCEEDED", "历史索引超过本轮长度，请缩小本次问题范围");
  const selected = await budget.structured(model, buildChatPrompt("chat-memory"), {
    task: "select", question: record.question, sceneId: record.sceneId, recent: context.history, candidates: index,
  }, z.object({ turnIds: z.array(z.uuid()).max(4) }).strict());
  const selectedIds = new Set(selected.turnIds);
  if (selectedIds.size !== selected.turnIds.length || selected.turnIds.some((id) => !older.some((turn) => turn.id === id))) {
    throw new ChatAgentError("REPLY_INVALID", "历史选择包含无效来源", "REPLY_INVALID");
  }
  const originals = older.filter((turn) => selectedIds.has(turn.id));
  if (originals.length) {
    if (JSON.stringify(originals.map(turnMessages)).length + recentSize <= CHAT_LIMITS.historyChars) {
      context.history = [...originals.flatMap(turnMessages), ...context.history];
    } else {
      const summary = await budget.structured(model, buildChatPrompt("chat-memory"), {
        task: "summarize", question: record.question, turns: originals.map((turn) => ({ id: turn.id, messages: turnMessages(turn) })),
      }, z.object({ items: z.array(z.object({ text: z.string().min(1).max(500), turnIds: z.array(z.uuid()).min(1).max(4) }).strict()).min(1).max(6) }).strict());
      if (summary.items.some((item) => item.turnIds.some((id) => !selectedIds.has(id)))) {
        throw new ChatAgentError("REPLY_INVALID", "会话摘要包含无效来源", "REPLY_INVALID");
      }
      const permitted = await filterCandidates(summary.items.map((item, i) => ({ id: String(i), text: item.text })), questions, model, budget);
      if (permitted.size !== summary.items.length) throw new ChatAgentError("CONTEXT_FAILED", "会话摘要未通过测验访问检查");
      context.memory = summary.items;
    }
  }
  return context;
}

export async function checkFinalAnswer(reply: string, context: ChatContext, model: LanguageModel, budget: ChatBudget) {
  if (!context.protectedQuestions.length && !context.pendingGrading.length) return;
  const result = await budget.structured(model, buildChatPrompt("chat-context-filter"), {
    task: "final_check", protectedQuestions: context.protectedQuestions, pendingGrading: context.pendingGrading, draft: reply,
  }, z.object({ safe: z.boolean() }).strict());
  if (!result.safe) throw new ChatAgentError("REPLY_INVALID", "回复未通过测验状态与提示边界检查，可换用提示性问题重试", "REPLY_INVALID");
}

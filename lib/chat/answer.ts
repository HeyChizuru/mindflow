import "server-only";
import type { EmbeddingModel, LanguageModel } from "ai";
import { LlmSettingsError } from "@/lib/ai/llm-connection";
import { ClassroomError } from "@/lib/services/classroom";
import { ChatError, claimChatExecution, completeChatExecution, failChatExecution, getChatHistory, retryChatExecution, submitChatQuestion } from "@/lib/services/chat";
import type { ChatSaveResult, ChatTurn } from "@/lib/types/chat";
import { chatRequestSchema } from "@/lib/validators/chat";
import { ChatAgentError, ChatBudget } from "./budget";
import { runChatGraph } from "./graph";

type Dependencies = { resolveModel: () => Promise<LanguageModel>; resolveEmbedding: () => Promise<EmbeddingModel>; signal: AbortSignal };
const response = (record: ChatTurn): ChatSaveResult => ({ success: true, questionSaved: true, record });
const details = (record: ChatTurn) => ({ questionSaved: true as const, turnId: record.id, record });

async function recordFailure(record: ChatTurn, error: unknown): Promise<never> {
  const safe = error instanceof ChatAgentError ? error : error instanceof ClassroomError
    ? new ChatAgentError("CONTEXT_FAILED", "本轮课程上下文读取失败，请重试")
    : new ChatAgentError("MODEL_FAILED", "本轮问答执行失败，请读取记录后重试", "MODEL_FAILED");
  const saved = await failChatExecution({ stageId: record.stageId, sessionId: record.sessionId, sceneId: record.sceneId,
    turnId: record.id, executionId: record.executionId, failureCode: safe.failureCode });
  throw new ChatError(safe.code, safe.message, details(saved));
}

export async function answerChat(input: unknown, dependencies: Dependencies): Promise<ChatSaveResult> {
  const parsed = chatRequestSchema.safeParse(input);
  if (!parsed.success) throw new ChatError("INVALID_REQUEST", "聊天请求字段或身份无效");
  const request = parsed.data;
  const retry = "action" in request;
  let record: ChatTurn;
  if (retry) {
    const history = await getChatHistory({ stageId: request.stageId, sessionId: request.sessionId, turnId: request.turnId });
    const found = history.records[0];
    if (!found || found.sceneId !== request.sceneId) throw new ChatError("NOT_FOUND", "本课堂或场景下没有该问题");
    record = found;
  } else {
    record = (await submitChatQuestion(request)).record;
  }
  if (record.status === "completed" || (record.status === "processing" && !record.executionExpired)
    || (!retry && record.status !== "pending")) return response(record);
  if (retry && (record.status === "pending" || record.executionId !== request.expectedExecutionId)) {
    throw new ChatError("EXECUTION_CONFLICT", "执行状态已变化，请恢复最新记录", details(record));
  }
  let model: LanguageModel;
  try { model = await dependencies.resolveModel(); }
  catch (error) {
    throw new ChatError(error instanceof LlmSettingsError ? "MODEL_CONFIG_MISSING" : "MODEL_FAILED",
      "本次对话模型配置缺失、无效或不可用，请检查设置后重试", details(record));
  }
  if (dependencies.signal.aborted) throw new ChatError("CANCELLED", "本轮已取消，问题仍保留", details(record));
  const startedBeforeClaim = Date.now();
  const key = { stageId: record.stageId, sessionId: record.sessionId, sceneId: record.sceneId, turnId: record.id };
  try {
    const claim = retry ? await retryChatExecution({ ...key, expectedExecutionId: request.expectedExecutionId }) : await claimChatExecution(key);
    record = claim.record;
    if (!claim.ownsExecution) return response(record);
  } catch (error) {
    if (error instanceof ChatError && error.code === "EXECUTION_ACTIVE" && error.details.record) return response(error.details.record);
    throw error;
  }
  const budget = new ChatBudget(record.executionExpiresAt!, dependencies.signal, startedBeforeClaim);
  let result: Awaited<ReturnType<typeof runChatGraph>>;
  try { result = await runChatGraph(record, { model, budget, resolveEmbedding: dependencies.resolveEmbedding }); }
  catch (error) {
    return recordFailure(record, dependencies.signal.aborted
      ? new ChatAgentError("CANCELLED", "本轮已取消，可读取记录后显式重试") : error);
  }
  try {
    const saved = await completeChatExecution({ ...key, executionId: record.executionId,
      teacherId: result.teacherId, reply: result.reply, chunkIds: result.chunkIds }, result.sources);
    return response(saved);
  } catch (error) {
    if (error instanceof ChatError && error.code === "SESSION_UNAVAILABLE") throw error;
    if (error instanceof ChatError && error.code === "INVALID_SOURCE") {
      return recordFailure(record, new ChatAgentError("REPLY_INVALID", error.message, "REPLY_INVALID"));
    }
    // An ambiguous completion must never be followed by another model run or a failure write.
    try {
      const latest = (await getChatHistory({ stageId: record.stageId, sessionId: record.sessionId, turnId: record.id })).records[0];
      if (latest?.status === "completed") return response(latest);
      if (latest) record = latest;
    } catch (readError) {
      if (readError instanceof ChatError && readError.code === "SESSION_UNAVAILABLE") throw readError;
    }
    throw new ChatError("SAVE_UNKNOWN", "教师回复保存状态未确认，请先读取本轮记录", details(record));
  }
}

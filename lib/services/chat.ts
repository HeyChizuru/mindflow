import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/db/client";
import { readChatTurns, insertChatTurn, lockChatTurn, claimChatTurn, completeChatTurn, failChatTurn } from "@/lib/db/queries/chat";
import { getChatSourcesByChunkIds } from "@/lib/db/queries/chunks";
import { getStageById } from "@/lib/db/queries/stages";
import { lockChatSession, readChatSessions, touchChatSession } from "@/lib/db/queries/chat-sessions";
import { ClassroomError, getLockedPlayableScene } from "@/lib/services/classroom";
import type { ChatTurn, SubmitChat, ChatClaimResult, ChatSaveResult, ChatReadResult,
  ChatErrorCode, ChatErrorDetails, ChatErrorResponse, ChatExecutionKey } from "@/lib/types/chat";
import { submitChatSchema, readChatSchema, chatTurnKeySchema, retryChatSchema,
  completeChatSchema, failChatSchema, chatSourceSchema } from "@/lib/validators/chat";

export class ChatError extends Error {
  readonly statusCode: number;
  readonly details: ChatErrorDetails;
  constructor(readonly code: ChatErrorCode, message: string, details: Partial<ChatErrorDetails> = {}) {
    super(message);
    this.name = "ChatError";
    this.statusCode = code === "INVALID_REQUEST" ? 400 : code === "NOT_FOUND" || code === "SESSION_UNAVAILABLE" ? 404
      : code === "MODEL_CONFIG_MISSING" || code === "TOOL_CONFIG_MISSING" ? 401
      : code === "LIMIT_EXCEEDED" ? 408 : code === "CANCELLED" ? 409 : code === "MODEL_UNSUPPORTED" ? 422
      : ["MODEL_FAILED", "TOOL_FAILED", "REPLY_INVALID"].includes(code) ? 502
      : ["NOT_READY", "IDENTITY_CONFLICT", "EXECUTION_ACTIVE", "EXECUTION_CONFLICT", "INVALID_SOURCE"].includes(code) ? 409 : 500;
    this.details = { questionSaved: null, turnId: null, record: null, ...details };
  }
  toResponse(): ChatErrorResponse { return { success: false, code: this.code, error: this.message, ...this.details }; }
}
function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ChatError("INVALID_REQUEST", "聊天请求字段或身份无效");
  return parsed.data;
}
function savedDetails(record: ChatTurn): ChatErrorDetails {
  return { questionSaved: true, turnId: record.id, record };
}
function checkIdentity(record: ChatTurn, input: SubmitChat): ChatTurn {
  if (record.stageId !== input.stageId || record.sessionId !== input.sessionId || record.requestId !== input.requestId
    || record.sceneId !== input.sceneId || record.question !== input.question) {
    throw new ChatError("IDENTITY_CONFLICT", "该请求身份已用于其他问题或场景，请核对已保存记录", savedDetails(record));
  }
  return record;
}
function conflict(record: ChatTurn): never {
  throw new ChatError("EXECUTION_CONFLICT", "执行身份或状态已变化，请恢复最新记录", savedDetails(record));
}

async function requireSession(key: { stageId: string; sessionId: string }, tx: Parameters<typeof lockChatSession>[1]) {
  if (!await lockChatSession(key, tx)) throw new ChatError("SESSION_UNAVAILABLE", "会话已不存在或不属于本课堂");
}

/** Read-only snapshot. Does not need model configuration and never resumes an execution. */
export async function getChatHistory(input: unknown): Promise<ChatReadResult> {
  const { stageId, sessionId, ...filter } = parse(readChatSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      if (!await getStageById(stageId, tx)) throw new ChatError("NOT_FOUND", "课堂不存在");
      if (!(await readChatSessions({ stageId, sessionId }, tx)).length) throw new ChatError("SESSION_UNAVAILABLE", "会话已不存在或不属于本课堂");
      const records = await readChatTurns(stageId, sessionId, filter, tx);
      return { success: true, records };
    }, { isolationLevel: "RepeatableRead" });
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new ChatError("READ_FAILED", "读取聊天记录失败，请重试");
  }
}

/** Only accepts a question. Successful pending means saved, not answered. */
export async function submitChatQuestion(input: unknown): Promise<ChatSaveResult> {
  const data = parse(submitChatSchema, input);
  const turnId = randomUUID();
  let writing = false;
  let identityChecked = false;
  let existingRecord: ChatTurn | null = null;
  try {
    const record = await prisma.$transaction(async (tx) => {
      const initial = (await readChatTurns(data.stageId, data.sessionId, { requestId: data.requestId }, tx))[0];
      if (!initial) await getLockedPlayableScene(data.stageId, data.sceneId, tx);
      await requireSession(data, tx);
      const existing = (await readChatTurns(data.stageId, data.sessionId, { requestId: data.requestId }, tx))[0];
      identityChecked = true;
      if (existing) {
        existingRecord = checkIdentity(existing, data);
        return existingRecord;
      }
      writing = true;
      const created = await insertChatTurn({ ...data, turnId }, tx);
      if (created) await touchChatSession(data, tx);
      const saved = created ?? (await readChatTurns(data.stageId, data.sessionId, { requestId: data.requestId }, tx))[0];
      if (!saved) throw new Error("Missing saved chat turn");
      return checkIdentity(saved, data);
    }, { isolationLevel: "ReadCommitted" });
    return { success: true, questionSaved: true, record };
  } catch (error) {
    if (error instanceof ChatError) throw error;
    if (error instanceof ClassroomError) {
      throw new ChatError(error.code === "NOT_FOUND" || error.code === "NOT_READY" || error.code === "INVALID_REQUEST"
        ? error.code : "READ_FAILED", error.message, { questionSaved: false });
    }
    if (!writing && !existingRecord) throw new ChatError("READ_FAILED", "未能核对聊天目标或已有记录，请先重新读取", {
      questionSaved: identityChecked ? false : null,
    });
    // A commit acknowledgement can be lost. Always reconcile before claiming success/failure.
    let recovered: ChatTurn | undefined;
    try { recovered = (await getChatHistory({ stageId: data.stageId, sessionId: data.sessionId, requestId: data.requestId })).records[0]; }
    catch (readError) {
      if (readError instanceof ChatError && readError.code === "SESSION_UNAVAILABLE") throw readError;
      throw new ChatError("SAVE_UNKNOWN", "未能确认本轮最新状态，请按请求身份重新读取",
        existingRecord ? savedDetails(existingRecord) : { turnId });
    }
    if (recovered) return { success: true, questionSaved: true, record: checkIdentity(recovered, data) };
    throw new ChatError("NOT_SAVED", "问题未保存，请保留输入并重试", { questionSaved: false });
  }
}

/** Internal only. No transaction is held while a future model or tool runs. */
async function acquire(input: unknown, retry: boolean): Promise<ChatClaimResult> {
  const parsed = retry ? parse(retryChatSchema, input) : { ...parse(chatTurnKeySchema, input), expectedExecutionId: null };
  const { stageId, sessionId, turnId, sceneId } = parsed;
  const key = { stageId, sessionId, turnId, sceneId };
  const expected = parsed.expectedExecutionId;
  const executionId = randomUUID();
  let observed: ChatTurn | null = null;
  let writing = false;
  try {
    return await prisma.$transaction(async (tx) => {
      await requireSession(key, tx);
      const record = await lockChatTurn(key, tx);
      if (!record) throw new ChatError("NOT_FOUND", "该课堂或场景下没有此轮聊天记录");
      observed = record;
      if (record.status === "completed") return { record, ownsExecution: false };
      if (record.status === "processing" && !record.executionExpired) {
        throw new ChatError("EXECUTION_ACTIVE", "本轮仍在处理中，请恢复当前状态", savedDetails(record));
      }
      if (retry ? record.status === "pending" || record.executionId !== expected : record.status !== "pending") conflict(record);
      writing = true;
      const claimed = await claimChatTurn({ ...key, executionId }, expected, tx);
      if (!claimed) conflict((await lockChatTurn(key, tx))!);
      return { record: claimed, ownsExecution: true };
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    if (error instanceof ChatError) throw error;
    if (writing) {
      try {
        const record = (await getChatHistory({ stageId, sessionId, turnId })).records[0];
        if (record?.sceneId === sceneId) {
          // This invocation generated the identity: only it may recover ownership after an uncertain claim.
          if (record.executionId === executionId && record.status === "processing" && !record.executionExpired) {
            return { record, ownsExecution: true };
          }
          if (record.status === "completed") return { record, ownsExecution: false };
          observed = record;
        }
      } catch (readError) {
        if (readError instanceof ChatError && readError.code === "SESSION_UNAVAILABLE") throw readError;
      }
    }
    throw new ChatError(writing ? "SAVE_UNKNOWN" : "READ_FAILED", "执行领取结果未确认，请先读取记录",
      observed ? savedDetails(observed) : { turnId });
  }
}
export function claimChatExecution(input: unknown) { return acquire(input, false); }
export function retryChatExecution(input: unknown) { return acquire(input, true); }

/** Both completion and failure enforce the original classroom, scene, turn, execution and deadline. */
async function finish(input: unknown, complete: boolean, expectedSources?: ChatTurn["sources"]): Promise<ChatTurn> {
  const data = complete ? parse(completeChatSchema, input) : parse(failChatSchema, input);
  const key: ChatExecutionKey = { stageId: data.stageId, sessionId: data.sessionId, turnId: data.turnId, sceneId: data.sceneId, executionId: data.executionId };
  let observed: ChatTurn | null = null;
  let writing = false;
  try {
    return await prisma.$transaction(async (tx) => {
      await requireSession(key, tx);
      const record = await lockChatTurn(key, tx);
      if (!record) throw new ChatError("NOT_FOUND", "该课堂或场景下没有此轮聊天记录");
      observed = record;
      if (record.executionId !== key.executionId) conflict(record);
      if (record.status === "completed") return record;
      if (!complete && record.status === "failed") return record;
      if (record.status !== "processing" || record.executionExpired) conflict(record);
      let saved: ChatTurn | null;
      if ("reply" in data) {
        const sources = await getChatSourcesByChunkIds(key.stageId, data.chunkIds, tx);
        const sourceMap = new Map(sources.map((source) => [source.chunkId, source]));
        if (sourceMap.size !== data.chunkIds.length || sources.some((source) => !chatSourceSchema.safeParse(source).success)) {
          throw new ChatError("INVALID_SOURCE", "回复来源不存在、不可用或不属于本课堂", savedDetails(record));
        }
        if (expectedSources && (expectedSources.length !== data.chunkIds.length || expectedSources.some((expected) => {
          const actual = sourceMap.get(expected.chunkId);
          return !actual || actual.documentId !== expected.documentId || actual.filename !== expected.filename
            || actual.page !== expected.page || actual.excerpt !== expected.excerpt;
        }))) {
          throw new ChatError("INVALID_SOURCE", "本轮取得的资料已变化，请重试", savedDetails(record));
        }
        writing = true;
        saved = await completeChatTurn(data, data.chunkIds.map((id) => sourceMap.get(id)!), tx);
      } else {
        writing = true;
        saved = await failChatTurn(data, tx);
      }
      if (!saved) conflict((await lockChatTurn(key, tx))!);
      return saved;
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    if (error instanceof ChatError) throw error;
    if (writing) {
      try {
        const record = (await getChatHistory({ stageId: key.stageId, sessionId: key.sessionId, turnId: key.turnId })).records[0];
        if (record?.sceneId === key.sceneId) {
          if (record.executionId === key.executionId
            && (record.status === "completed" || (!complete && record.status === "failed"))) return record;
          observed = record;
        }
      } catch (readError) {
        if (readError instanceof ChatError && readError.code === "SESSION_UNAVAILABLE") throw readError;
      }
    }
    throw new ChatError(writing ? "SAVE_UNKNOWN" : "READ_FAILED", "回复状态未确认，请先恢复本轮已保存记录",
      observed ? savedDetails(observed) : { turnId: key.turnId });
  }
}
export function completeChatExecution(input: unknown, expectedSources?: ChatTurn["sources"]) { return finish(input, true, expectedSources); }
export function failChatExecution(input: unknown) { return finish(input, false); }

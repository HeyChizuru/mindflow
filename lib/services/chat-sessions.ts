import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { readChatSessions, insertChatSession, lockChatSession, touchChatSession, deleteChatSessionRow } from "@/lib/db/queries/chat-sessions";
import { getClassroom, ClassroomError } from "@/lib/services/classroom";
import { chatSessionIdSchema, chatSessionKeySchema, chatSessionListSchema, createChatSessionSchema } from "@/lib/validators/chat-session";
import type { ChatSessionErrorCode, ChatSessionErrorResponse } from "@/lib/types/chat-session";

export class ChatSessionError extends Error {
  readonly statusCode: number;
  constructor(readonly code: ChatSessionErrorCode) {
    super({ INVALID_REQUEST: "会话请求无效", NOT_FOUND: "会话或课堂已不存在", NOT_READY: "课堂尚未就绪",
      READ_FAILED: "读取会话失败，请重试", SAVE_UNKNOWN: "会话操作结果未确认，请先读取核对" }[code]);
    this.statusCode = code === "INVALID_REQUEST" ? 400 : code === "NOT_FOUND" ? 404 : code === "NOT_READY" ? 409 : 500;
  }
  toResponse(): ChatSessionErrorResponse { return { success: false, code: this.code, error: this.message }; }
}

export function safeChatSessionError(error: unknown) {
  return error instanceof ChatSessionError ? error : error instanceof ClassroomError && ["NOT_FOUND", "NOT_READY", "INVALID_REQUEST"].includes(error.code)
    ? new ChatSessionError(error.code as "NOT_FOUND" | "NOT_READY" | "INVALID_REQUEST") : new ChatSessionError("READ_FAILED");
}

async function requireReadyClassroom(stageId: string) {
  const classroom = await getClassroom(stageId);
  if (classroom.state !== "ready") throw new ChatSessionError("NOT_READY");
}

export async function listChatSessions(input: unknown) {
  const parsed = chatSessionListSchema.safeParse(input);
  if (!parsed.success) throw new ChatSessionError("INVALID_REQUEST");
  try { return { success: true as const, sessions: await readChatSessions(parsed.data) }; }
  catch (error) { throw safeChatSessionError(error); }
}

export async function getChatSession(input: unknown) {
  const parsed = chatSessionIdSchema.safeParse(input);
  if (!parsed.success) throw new ChatSessionError("INVALID_REQUEST");
  try {
    const session = (await readChatSessions({ sessionId: parsed.data }))[0];
    if (!session) throw new ChatSessionError("NOT_FOUND");
    return { success: true as const, session };
  } catch (error) { throw safeChatSessionError(error); }
}

export async function createChatSession(input: unknown) {
  const parsed = createChatSessionSchema.safeParse(input);
  if (!parsed.success) throw new ChatSessionError("INVALID_REQUEST");
  const key = { ...parsed.data, sessionId: randomUUID() };
  let writing = false;
  try {
    await requireReadyClassroom(key.stageId);
    return await prisma.$transaction(async (tx) => {
      writing = true;
      await insertChatSession(key, tx);
      const session = (await readChatSessions(key, tx))[0];
      if (!session) throw new Error("Missing created session");
      return { success: true as const, session };
    });
  } catch (error) {
    if (!writing) throw safeChatSessionError(error);
    try {
      const session = (await readChatSessions(key))[0];
      if (session) return { success: true as const, session };
    } catch { /* Only an observed record can confirm creation. */ }
    throw new ChatSessionError("SAVE_UNKNOWN");
  }
}

export async function openChatSession(input: unknown) {
  const parsed = chatSessionKeySchema.safeParse(input);
  if (!parsed.success) throw new ChatSessionError("INVALID_REQUEST");
  const key = parsed.data;
  let writing = false;
  try {
    await requireReadyClassroom(key.stageId);
    return await prisma.$transaction(async (tx) => {
      if (!await lockChatSession(key, tx)) throw new ChatSessionError("NOT_FOUND");
      writing = true;
      await touchChatSession(key, tx);
      return { success: true as const, session: (await readChatSessions(key, tx))[0] };
    });
  } catch (error) { throw writing ? new ChatSessionError("SAVE_UNKNOWN") : safeChatSessionError(error); }
}

export async function deleteChatSession(input: unknown) {
  const parsed = chatSessionKeySchema.safeParse(input);
  if (!parsed.success) throw new ChatSessionError("INVALID_REQUEST");
  const key = parsed.data;
  let writing = false;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = (await readChatSessions({ sessionId: key.sessionId }, tx))[0];
      if (existing && existing.stageId !== key.stageId) throw new ChatSessionError("INVALID_REQUEST");
      if (!await lockChatSession(key, tx)) return;
      writing = true;
      await deleteChatSessionRow(key, tx);
    });
  } catch (error) {
    if (!writing) throw safeChatSessionError(error);
    try {
      if ((await readChatSessions({ sessionId: key.sessionId })).length) throw new ChatSessionError("SAVE_UNKNOWN");
    } catch { throw new ChatSessionError("SAVE_UNKNOWN"); }
  }
  return { success: true as const, deleted: true as const, ...key };
}

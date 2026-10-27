import { z } from "zod";
import { CHAT_SESSION_ERROR_CODES } from "@/lib/types/chat-session";

export const chatSessionIdSchema = z.uuid().transform((value) => value.toLowerCase());
export const createChatSessionSchema = z.object({ stageId: chatSessionIdSchema }).strict();
export const chatSessionListSchema = z.object({ stageId: chatSessionIdSchema.optional() }).strict();
export const chatSessionKeySchema = z.object({ sessionId: chatSessionIdSchema, stageId: chatSessionIdSchema }).strict();
export const chatSessionSchema = z.object({
  id: chatSessionIdSchema, stageId: chatSessionIdSchema, stageName: z.string().min(1), isHistory: z.boolean(),
  preview: z.string().min(1).max(80).nullable(), createdAt: z.iso.datetime(), lastUsedAt: z.iso.datetime(),
}).strict();
export const chatSessionResultSchema = z.object({ success: z.literal(true), session: chatSessionSchema }).strict();
export const chatSessionListResultSchema = z.object({ success: z.literal(true), sessions: z.array(chatSessionSchema) }).strict();
export const deleteChatSessionResultSchema = z.object({ success: z.literal(true), deleted: z.literal(true),
  sessionId: chatSessionIdSchema, stageId: chatSessionIdSchema }).strict();
export const chatSessionErrorSchema = z.object({ success: z.literal(false), code: z.enum(CHAT_SESSION_ERROR_CODES),
  error: z.string().min(1) }).strict();

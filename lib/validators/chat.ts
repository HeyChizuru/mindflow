import { z } from "zod";
import { CHAT_ERROR_CODES, CHAT_FAILURE_CODES, CHAT_TEACHER_IDS } from "@/lib/types/chat";

const id = z.uuid().transform((value) => value.toLowerCase());
const nonBlank = z.string().refine((value) => value.trim().length > 0, "内容不能为空");
const timestamp = z.iso.datetime();

export const submitChatSchema = z.object({
  stageId: id, sessionId: id, sceneId: id, requestId: id, question: z.string().trim().min(1),
}).strict();
export const readChatSchema = z.object({ stageId: id, sessionId: id, turnId: id.optional(), requestId: id.optional() }).strict()
  .refine((input) => !(input.turnId && input.requestId), "轮次与请求身份只能选择一个");
export const chatTurnKeySchema = z.object({ stageId: id, sessionId: id, turnId: id, sceneId: id }).strict();
export const chatExecutionKeySchema = chatTurnKeySchema.extend({ executionId: id }).strict();
export const retryChatSchema = chatTurnKeySchema.extend({ expectedExecutionId: id }).strict();
export const chatRequestSchema = z.union([
  submitChatSchema,
  retryChatSchema.extend({ action: z.literal("retry") }).strict(),
]);
// 路由一次返回教师身份及是否需要轻量测验检查。
export const chatRouteSchema = z.object({ teacherId: z.enum(CHAT_TEACHER_IDS), needsQuizCheck: z.boolean() }).strict();
export const readSceneToolSchema = z.object({ sceneId: id }).strict();
export const searchPdfToolSchema = z.object({ query: z.string().trim().min(1).max(1000) }).strict();
export const chatAnswerSchema = z.object({
  reply: nonBlank.pipe(z.string().max(12000)), chunkIds: z.array(id).max(8),
}).strict().refine((value) => new Set(value.chunkIds).size === value.chunkIds.length, "来源不能重复");
export const completeChatSchema = chatExecutionKeySchema.extend({
  reply: nonBlank, teacherId: z.enum(CHAT_TEACHER_IDS), chunkIds: z.array(id),
}).strict().refine((input) => new Set(input.chunkIds).size === input.chunkIds.length, "来源不能重复");
export const failChatSchema = chatExecutionKeySchema.extend({ failureCode: z.enum(CHAT_FAILURE_CODES) }).strict();
export const chatSourceSchema = z.object({
  chunkId: id, documentId: id, filename: nonBlank, page: z.number().int().positive().nullable(), excerpt: nonBlank,
}).strict();

export const chatTurnSchema = z.object({
  id, stageId: id, sessionId: id, sceneId: id, requestId: id, question: nonBlank,
  status: z.enum(["pending", "processing", "failed", "completed"]),
  reply: nonBlank.nullable(), teacherId: z.enum(CHAT_TEACHER_IDS).nullable(),
  sources: z.array(chatSourceSchema).nullable(), failureCode: z.enum(CHAT_FAILURE_CODES).nullable(),
  executionId: id.nullable(), executionStartedAt: timestamp.nullable(), executionExpiresAt: timestamp.nullable(),
  executionExpired: z.boolean(), completedAt: timestamp.nullable(), createdAt: timestamp, updatedAt: timestamp,
}).strict().superRefine((record, context) => {
  const hasExecution = record.executionId !== null && record.executionStartedAt !== null
    && record.executionExpiresAt !== null && record.executionExpiresAt > record.executionStartedAt;
  const noExecution = record.executionId === null && record.executionStartedAt === null && record.executionExpiresAt === null;
  const noResult = record.reply === null && record.teacherId === null && record.sources === null && record.completedAt === null;
  const valid = record.status === "pending" ? noExecution && noResult && record.failureCode === null
    : record.status === "processing" ? hasExecution && noResult && record.failureCode === null
    : record.status === "failed" ? hasExecution && noResult && record.failureCode !== null
    : hasExecution && record.reply !== null && record.teacherId !== null && record.sources !== null
      && record.completedAt !== null && record.completedAt >= record.executionStartedAt!
      && record.completedAt < record.executionExpiresAt! && record.failureCode === null;
  if (!valid || (record.status !== "processing" && record.executionExpired)
    || record.question !== record.question.trim()
    || (record.sources && new Set(record.sources.map((source) => source.chunkId)).size !== record.sources.length)) {
    context.addIssue({ code: "custom", message: "聊天状态与保存内容不一致" });
  }
});

export const chatSaveResultSchema = z.object({
  success: z.literal(true), questionSaved: z.literal(true), record: chatTurnSchema,
}).strict();
export const chatReadResultSchema = z.object({ success: z.literal(true), records: z.array(chatTurnSchema) }).strict();
export const chatErrorResponseSchema = z.object({
  success: z.literal(false), code: z.enum(CHAT_ERROR_CODES), error: nonBlank,
  questionSaved: z.boolean().nullable(), turnId: id.nullable(), record: chatTurnSchema.nullable(),
}).strict().refine((value) => !value.record || value.questionSaved === true && value.turnId === value.record.id,
  "错误记录与保存身份不一致");

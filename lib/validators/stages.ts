import {
  PREVIEW_PHASES,
  STAGE_STATUSES,
  type ApiErrorResponse,
  type CreateStageBody,
  type CreateStageResponse,
  type DeleteStageResponse,
  type StageRequirements,
} from "@/lib/types/stage";
import { z } from "zod";

/**
 * 可选画像文本：trim 后为空则丢掉，响应与入库都不保留空字符串。
 * 缺省键与空白字符串都变成省略。
 */
const optionalProfileText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

/** 规范化后的 requirements：提示词必填，昵称与背景空白则省略 */
export const stageRequirementsSchema = z
  .object({
    requirement: z
      .string()
      .trim()
      .min(10, "requirement must be at least 10 characters")
      .max(10000, "requirement must not exceed 10000 characters"),
    userNickname: optionalProfileText,
    userBio: optionalProfileText,
  })
  .transform(
    (value): StageRequirements => ({
      requirement: value.requirement,
      ...(value.userNickname ? { userNickname: value.userNickname } : {}),
      ...(value.userBio ? { userBio: value.userBio } : {}),
    }),
  );

/** POST /api/stages 的 JSON 体；未知字段（含 interactiveMode）被丢掉 */
export const createStageBodySchema = z.object({
  requirements: stageRequirementsSchema,
}) satisfies z.ZodType<CreateStageBody, CreateStageBody>;

export const createStageDocumentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  storagePath: z.string(),
});

/** 创建与 GET 共用的课堂 DTO。requirements 为规范化结果 */
export const stageResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  requirements: z.object({
    requirement: z.string(),
    userNickname: z.string().optional(),
    userBio: z.string().optional(),
  }),
  status: z.enum(STAGE_STATUSES),
  previewPhase: z.enum(PREVIEW_PHASES),
  createdAt: z.iso.datetime(),
  hasKnowledgeBase: z.boolean(),
  document: createStageDocumentSchema.optional(),
}) satisfies z.ZodType<CreateStageResponse>;

export const apiErrorSchema = z.object({
  error: z.string(),
}) satisfies z.ZodType<ApiErrorResponse>;

export const stageIdSchema = z.uuid("stageId must be a uuid");

export const deleteStageResponseSchema = z.object({
  id: z.uuid(),
}) satisfies z.ZodType<DeleteStageResponse>;

import type {
  ApiErrorResponse,
  CreateStageBody,
  CreateStageResponse,
  DeleteStageResponse,
} from "@/lib/types/stage";
import { z } from "zod";

export const createStageBodySchema = z.object({
  requirement: z
    .string()
    .trim()
    .min(10, "requirement must be at least 10 characters")
    .max(10000, "requirement must not exceed 10000 characters"),
}) satisfies z.ZodType<CreateStageBody>;

export const createStageDocumentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  storagePath: z.string(),
});

export const createStageResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  requirement: z.string(),
  status: z.literal("draft"),
  previewPhase: z.literal("preparing"),
  createdAt: z.iso.datetime(),
  hasKnowledgeBase: z.literal(false),
  document: createStageDocumentSchema.optional(),
}) satisfies z.ZodType<CreateStageResponse>;

export const apiErrorSchema = z.object({
  error: z.string(),
}) satisfies z.ZodType<ApiErrorResponse>;

export const stageIdSchema = z.uuid("stageId must be a uuid");

export const deleteStageResponseSchema = z.object({
  id: z.uuid(),
}) satisfies z.ZodType<DeleteStageResponse>;

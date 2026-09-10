import type {
  ApiErrorResponse,
  CreateStageBody,
  CreateStageResponse,
} from "@/lib/types/stage";
import { z } from "zod";

export const createStageBodySchema = z.object({
  requirement: z
    .string({ error: "requirement is required" })
    .trim()
    .min(10, "requirement must be at least 10 characters")
    .max(10000, "requirement must not exceed 10000 characters"),
}) satisfies z.ZodType<CreateStageBody>;

export const createStageResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  requirement: z.string(),
  status: z.literal("draft"),
  previewPhase: z.literal("preparing"),
  createdAt: z.iso.datetime(),
}) satisfies z.ZodType<CreateStageResponse>;

export const apiErrorSchema = z.object({
  error: z.string(),
}) satisfies z.ZodType<ApiErrorResponse>;

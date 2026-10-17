import type { ConfirmOutlinesBody, ConfirmOutlinesResponse, GenerationPreviewResponse } from "@/lib/types/stage-generation";
import { sceneOutlinesSchema } from "@/lib/validators/outline";
import { z } from "zod";

export const confirmOutlinesBodySchema = z.strictObject({
  outlines: sceneOutlinesSchema,
  languageDirective: z.string().nullable().optional(),
  outlineStreamCompleted: z.literal(true),
}) satisfies z.ZodType<ConfirmOutlinesBody>;

export const confirmOutlinesResponseSchema = z.object({
  stageId: z.uuid(),
  outlinesStatus: z.literal("confirmed"),
  outlines: sceneOutlinesSchema,
  languageDirective: z.string().nullable(),
}) satisfies z.ZodType<ConfirmOutlinesResponse>;

export const generationPreviewResponseSchema = z.discriminatedUnion("outlinesStatus", [
  z.object({
    stageId: z.uuid(),
    hasKnowledgeBase: z.boolean(),
    outlinesStatus: z.literal("draft"),
  }),
  confirmOutlinesResponseSchema.extend({ hasKnowledgeBase: z.boolean() }),
]) satisfies z.ZodType<GenerationPreviewResponse>;

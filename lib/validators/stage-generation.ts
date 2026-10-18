import type { ConfirmOutlinesBody, ConfirmOutlinesResponse, GenerationPreviewResponse, SceneContentGenerationBody, SceneActionsGenerationBody, SceneContentGenerationResponse, SceneActionsGenerationResponse } from "@/lib/types/stage-generation";
import { sceneOutlineSchema, sceneOutlinesSchema } from "@/lib/validators/outline";
import { generatedContentForOutlineSchema, generatedQuizContentSchema, generatedSlideContentSchema, sceneSchema } from "@/lib/validators/scenes";
import { z } from "zod";

const nonBlank = z.string().refine((value) => value.trim().length > 0, "不能为空");

export const sceneContentGenerationBodySchema = z.strictObject({
  stageId: z.uuid().toLowerCase(),
  outline: sceneOutlineSchema,
  allOutlines: sceneOutlinesSchema,
  requirement: nonBlank,
  languageDirective: z.string().nullable().optional(),
  userProfile: nonBlank.optional(),
}) satisfies z.ZodType<SceneContentGenerationBody>;

export const sceneActionsGenerationBodySchema = sceneContentGenerationBodySchema.extend({
  content: z.union([generatedSlideContentSchema, generatedQuizContentSchema]),
  previousSpeeches: z.array(nonBlank),
}).superRefine((body, context) => {
  const schema = body.outline.type === "slide" ? generatedSlideContentSchema : generatedQuizContentSchema;
  if (!schema.safeParse(body.content).success) {
    context.addIssue({ code: "custom", path: ["content"], message: "内容与目标场景类型不匹配" });
  }
}) satisfies z.ZodType<SceneActionsGenerationBody>;

export const sceneContentGenerationResponseSchema = z.strictObject({
  success: z.literal(true),
  content: z.union([generatedSlideContentSchema, generatedQuizContentSchema]),
  effectiveOutline: sceneOutlineSchema,
}).superRefine((response, context) => {
  if (!generatedContentForOutlineSchema(response.effectiveOutline).safeParse(response.content).success) {
    context.addIssue({ code: "custom", path: ["content"], message: "生成内容不符合目标大纲" });
  }
}) satisfies z.ZodType<SceneContentGenerationResponse>;

export const sceneActionsGenerationResponseSchema = z.strictObject({
  success: z.literal(true),
  scene: sceneSchema,
  previousSpeeches: z.array(nonBlank),
}).superRefine((response, context) => {
  const speeches = response.scene.actions.flatMap((action) => action.type === "speech" ? [action.text] : []);
  if (speeches.length !== response.previousSpeeches.length
    || speeches.some((speech, index) => speech !== response.previousSpeeches[index])) {
    context.addIssue({ code: "custom", path: ["previousSpeeches"], message: "响应讲稿必须来自当前场景并保持顺序" });
  }
}) satisfies z.ZodType<SceneActionsGenerationResponse>;

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
  confirmOutlinesResponseSchema.extend({ hasKnowledgeBase: z.boolean(), firstScene: sceneSchema.nullable() }),
]) satisfies z.ZodType<GenerationPreviewResponse>;

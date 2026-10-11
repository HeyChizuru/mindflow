import type { SceneOutline } from "@/lib/types/outline";
import { z } from "zod";

const quizDifficultySchema = z.enum(["easy", "medium", "hard"]);
const quizQuestionTypeSchema = z.enum(["single", "multiple", "short_answer"]);

const quizConfigSchema = z.object({
  questionCount: z.number().int().positive(),
  difficulty: quizDifficultySchema,
  questionTypes: z.array(quizQuestionTypeSchema).min(1),
});

const sceneBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  order: z.number().int().positive(),
  teachingObjective: z.string().optional(),
  estimatedDuration: z.number().positive().optional(),
  languageNote: z.string().optional(),
});

export const slideSceneOutlineSchema = sceneBaseSchema.extend({
  type: z.literal("slide"),
});

export const quizSceneOutlineSchema = sceneBaseSchema.extend({
  type: z.literal("quiz"),
  quizConfig: quizConfigSchema,
});

/** 单条场景大纲（仅 slide / quiz） */
export const sceneOutlineSchema = z.discriminatedUnion("type", [
  slideSceneOutlineSchema,
  quizSceneOutlineSchema,
]);

/**
 * 校验 LLM 解析出的场景对象。
 * 失败时返回 undefined，不向客户端暴露 Zod 细节。
 */
export function parseSceneOutline(value: unknown): SceneOutline | undefined {
  const result = sceneOutlineSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

/**
 * 校验整份大纲列表；任一条无效则返回 false。
 */
export function areSceneOutlinesValid(outlines: unknown[]): boolean {
  if (outlines.length === 0) {
    return false;
  }
  return outlines.every((item) => sceneOutlineSchema.safeParse(item).success);
}

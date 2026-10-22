import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { getSceneByOutline, insertScene } from "@/lib/db/queries/scenes";
import { getStageById } from "@/lib/db/queries/stages";
import { formatUserProfile } from "@/lib/generation/prompt-formatters";
import { SceneGenerationError } from "@/lib/generation/scene-generation-error";
import { StageNotFoundError } from "@/lib/services/stages";
import type { SceneContentGenerationBody } from "@/lib/types/stage-generation";
import type { SceneOutline } from "@/lib/types/outline";
import type { CreateSceneInput, Scene } from "@/lib/types/scene";
import { sceneOutlinesSchema } from "@/lib/validators/outline";
import { createSceneSchema, generatedContentForOutlineSchema, sceneSchema } from "@/lib/validators/scenes";

const savedStageSchema = z.object({
  id: z.uuid(),
  outlinesStatus: z.enum(["draft", "confirmed", "scenes_ready", "archived"]),
  outlines: z.unknown(),
  requirement: z.string().refine((value) => !!value.trim()),
  languageDirective: z.string().nullable(),
  userNickname: z.string().nullable(),
  userBio: z.string().nullable(),
  hasKnowledgeBase: z.boolean(),
});

function comparableLanguage(value?: string | null) {
  return value?.trim() ? value : null;
}

/** Checks the explicit target without choosing or replacing any generation input. */
export async function validateSceneGenerationInput(input: SceneContentGenerationBody) {
  let row;
  try {
    row = await getStageById(input.stageId);
  } catch {
    throw new SceneGenerationError("读取课堂失败，请重试", 500);
  }
  if (!row) throw new StageNotFoundError("课堂不存在");
  const parsedStage = savedStageSchema.safeParse(row);
  if (!parsedStage.success || parsedStage.data.id !== input.stageId) {
    throw new SceneGenerationError("已保存课堂数据无效，无法生成场景", 500);
  }
  const stage = parsedStage.data;
  if (stage.outlinesStatus === "draft") {
    if (!Array.isArray(stage.outlines) || stage.outlines.length !== 0 || stage.languageDirective !== null) {
      throw new SceneGenerationError("已保存课堂定稿状态无效，无法生成场景", 500);
    }
    throw new SceneGenerationError("请先确认课堂大纲", 409);
  }
  const savedOutlines = sceneOutlinesSchema.safeParse(stage.outlines);
  if (!savedOutlines.success) {
    throw new SceneGenerationError("已保存大纲无效，无法生成场景", 500);
  }
  if (stage.outlinesStatus === "archived") {
    throw new SceneGenerationError("课堂已归档，无法生成场景", 409);
  }
  const target = savedOutlines.data.find((outline) => outline.id === input.outline.id);
  const userProfile = formatUserProfile({
    userNickname: stage.userNickname ?? undefined,
    userBio: stage.userBio ?? undefined,
  });
  if (!target || !isDeepStrictEqual(target, input.outline)
    || !isDeepStrictEqual(savedOutlines.data, input.allOutlines)
    || stage.requirement !== input.requirement
    || comparableLanguage(stage.languageDirective) !== comparableLanguage(input.languageDirective)
    || userProfile !== input.userProfile) {
    throw new SceneGenerationError("生成依据与课堂定稿不一致，请重新读取课堂后重试", 400);
  }

  return {
    hasKnowledgeBase: stage.hasKnowledgeBase,
    existingScene: await getSceneForOutline(input.stageId, input.outline),
  };
}

export function validateSavedScene(scene: Scene, stageId: string, outline: SceneOutline) {
  const result = sceneSchema.parse(scene);
  if (result.stageId !== stageId || result.outlineId !== outline.id || result.type !== outline.type
    || result.title !== outline.title || result.order !== outline.order) {
    throw new Error("Invalid saved scene association");
  }
  if (outline.type === "quiz" && result.content.type === "quiz") {
    generatedContentForOutlineSchema(outline).parse({ questions: result.content.questions });
  }
  return result;
}

/** Read only the explicitly supplied target, shared by generation and preview recovery. */
export async function getSceneForOutline(stageId: string, outline: SceneOutline): Promise<Scene | null> {
  try {
    const scene = await getSceneByOutline(stageId, outline.id);
    return scene === null ? null : validateSavedScene(scene, stageId, outline);
  } catch {
    throw new SceneGenerationError("读取已保存场景失败，请重试", 500);
  }
}

/** Atomic insert; concurrent winners are read back without overwriting their content. */
export async function saveGeneratedScene(input: CreateSceneInput, outline: SceneOutline): Promise<Scene> {
  const result = createSceneSchema.safeParse(input);
  if (!result.success || input.outlineId !== outline.id || input.type !== outline.type
    || input.order !== outline.order || input.title !== outline.title) {
    throw new SceneGenerationError("场景内容与动作不完整，请重试", 502);
  }
  const content = result.data.content.type === "slide"
    ? { elements: result.data.content.canvas.elements, background: result.data.content.canvas.background }
    : { questions: result.data.content.questions };
  if (!generatedContentForOutlineSchema(outline).safeParse(content).success) {
    throw new SceneGenerationError("场景内容不符合定稿要求，请重试", 502);
  }
  try {
    const scene = await insertScene(result.data);
    return validateSavedScene(scene, input.stageId, outline);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") {
        const winner = await getSceneForOutline(input.stageId, outline);
        if (winner) return winner;
      }
      if (error.code === "P2003") throw new StageNotFoundError("课堂已删除，无法保存场景");
    }
    throw new SceneGenerationError("保存完整场景失败，请重试", 500);
  }
}

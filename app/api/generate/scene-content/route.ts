import { NextResponse } from "next/server";
import { generateSceneContent } from "@/lib/generation/scene-generator";
import { prepareSceneContentGeneration } from "@/lib/generation/scene-generation-context";
import { SceneGenerationError } from "@/lib/generation/scene-generation-error";
import { validateSceneGenerationInput } from "@/lib/services/scene-generation";
import { parseSceneGenerationRequest, sceneGenerationErrorResponse } from "../scene-generation-http";
import { sceneContentGenerationBodySchema, sceneContentGenerationResponseSchema } from "@/lib/validators/stage-generation";

/** 场景内容生成可能多次调用模型，需放宽 serverless 超时。 */
export const maxDuration = 300;

/**
 * 按大纲生成场景教学内容（中间结果，不写库）。
 * 该 outline 已有定稿场景时返回 409；响应经 schema 校验后返回 content + effectiveOutline。
 */
export async function POST(request: Request) {
  try {
    const body = await parseSceneGenerationRequest(request, sceneContentGenerationBodySchema);
    const { hasKnowledgeBase, existingScene } = await validateSceneGenerationInput(body);
    if (existingScene) throw new SceneGenerationError("目标场景已保存，请读取已有结果", 409);

    const { aiCall, options } = await prepareSceneContentGeneration(request, body, hasKnowledgeBase);
    const content = await generateSceneContent(body.outline, aiCall, options);
    if (!content) throw new SceneGenerationError("场景内容生成不完整，请重试", 502);

    const result = sceneContentGenerationResponseSchema.safeParse({
      success: true,
      content,
      effectiveOutline: body.outline,
    });
    if (!result.success) throw new SceneGenerationError("场景内容不符合定稿要求，请重试", 502);

    return NextResponse.json(result.data);
  } catch (error) {
    return sceneGenerationErrorResponse(error, "content");
  }
}
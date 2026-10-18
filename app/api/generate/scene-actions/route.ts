import { NextResponse } from "next/server";
import { buildCompleteScene } from "@/lib/generation/scene-assembly";
import { generateSceneActions } from "@/lib/generation/scene-generator";
import { prepareSceneActionsGeneration } from "@/lib/generation/scene-generation-context";
import { SceneGenerationError } from "@/lib/generation/scene-generation-error";
import { saveGeneratedScene, validateSceneGenerationInput } from "@/lib/services/scene-generation";
import { parseSceneGenerationRequest, sceneGenerationErrorResponse } from "../scene-generation-http";
import { sceneActionsGenerationBodySchema, sceneActionsGenerationResponseSchema } from "@/lib/validators/stage-generation";
import { generatedContentForOutlineSchema } from "@/lib/validators/scenes";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await parseSceneGenerationRequest(request, sceneActionsGenerationBodySchema);
    const { existingScene } = await validateSceneGenerationInput(body);
    let savedScene = existingScene;
    if (!savedScene) {
      const content = generatedContentForOutlineSchema(body.outline).safeParse(body.content);
      if (!content.success) throw new SceneGenerationError("场景内容不符合定稿要求，请重新生成内容", 400);
      const { aiCall, options } = await prepareSceneActionsGeneration(request, body);
      const actions = await generateSceneActions(body.outline, content.data, aiCall, options);
      const scene = buildCompleteScene(body.outline, content.data, actions, body.stageId);
      if (!scene) throw new SceneGenerationError("场景内容与动作不完整，请重试", 502);
      savedScene = await saveGeneratedScene(scene, body.outline);
    }
    const result = sceneActionsGenerationResponseSchema.safeParse({
      success: true,
      scene: savedScene,
      previousSpeeches: savedScene.actions.flatMap((action) => action.type === "speech" ? [action.text] : []),
    });
    if (!result.success) throw new SceneGenerationError("读取场景生成结果失败，请重试", 500);
    return NextResponse.json(result.data);
  } catch (error) {
    return sceneGenerationErrorResponse(error, "actions");
  }
}

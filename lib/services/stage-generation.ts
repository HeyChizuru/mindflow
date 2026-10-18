import { confirmStageOutlines, getStageById } from "@/lib/db/queries/stages";
import { StageNotFoundError } from "@/lib/services/stages";
import { getSceneForOutline } from "@/lib/services/scene-generation";
import type { ConfirmOutlinesBody, ConfirmOutlinesResponse, GenerationPreviewResponse } from "@/lib/types/stage-generation";
import { confirmOutlinesBodySchema, confirmOutlinesResponseSchema, generationPreviewResponseSchema } from "@/lib/validators/stage-generation";
import { stageIdSchema } from "@/lib/validators/stages";

export class StageGenerationConflictError extends Error {
  constructor(message = "课堂大纲已定稿，不能再次确认或修改") {
    super(message);
    this.name = "StageGenerationConflictError";
  }
}

function assertDraftStage(stage: { outlinesStatus: string; outlines: unknown }) {
  if (stage.outlinesStatus !== "draft" || !Array.isArray(stage.outlines) || stage.outlines.length > 0) {
    throw new StageGenerationConflictError();
  }
}

export async function getGenerationPreview(stageId: string): Promise<GenerationPreviewResponse> {
  const id = stageIdSchema.parse(stageId);
  const stage = await getStageById(id);
  if (!stage) throw new StageNotFoundError("课堂不存在");
  const base = { stageId: stage.id, hasKnowledgeBase: stage.hasKnowledgeBase };
  if (stage.outlinesStatus === "draft" && Array.isArray(stage.outlines) && stage.outlines.length === 0) {
    return generationPreviewResponseSchema.parse({ ...base, outlinesStatus: "draft" });
  }
  if (!["confirmed", "scenes_ready", "archived"].includes(stage.outlinesStatus)) {
    throw new Error("Invalid saved outline status");
  }
  const confirmed = confirmOutlinesResponseSchema.parse({
    stageId: stage.id,
    outlinesStatus: "confirmed",
    outlines: stage.outlines,
    languageDirective: stage.languageDirective,
  });
  const firstScene = await getSceneForOutline(stage.id, confirmed.outlines[0]);
  return generationPreviewResponseSchema.parse({ ...base, ...confirmed, firstScene });
}

export async function getStageForConfirmation(stageId: string) {
  const id = stageIdSchema.parse(stageId);
  const stage = await getStageById(id);
  if (!stage) throw new StageNotFoundError("课堂不存在");
  assertDraftStage(stage);
  return stage;
}

export async function confirmOutlines(
  stageId: string,
  input: ConfirmOutlinesBody,
  hasKnowledgeBase: boolean,
): Promise<ConfirmOutlinesResponse> {
  const id = stageIdSchema.parse(stageId);
  const body = confirmOutlinesBodySchema.parse(input);
  const result = await confirmStageOutlines(id, body, hasKnowledgeBase);
  if (result.count !== 1) {
    const stage = await getStageById(id);
    if (!stage) throw new StageNotFoundError("课堂不存在");
    assertDraftStage(stage);
    throw new StageGenerationConflictError("课堂知识库状态已变化，请重试确认");
  }
  return confirmOutlinesResponseSchema.parse({
    stageId: id,
    outlinesStatus: "confirmed",
    outlines: body.outlines,
    languageDirective: body.languageDirective ?? null,
  });
}

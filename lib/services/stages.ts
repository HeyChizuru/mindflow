import { insertStage } from "@/lib/db/queries/stages";
import type { CreateStageResponse } from "@/lib/types/stage";
import { deriveStageName } from "@/lib/utils/derive-stage-name";
import {
  createStageBodySchema,
  createStageResponseSchema,
} from "@/lib/validators/stages";

export async function createStage(input: unknown): Promise<CreateStageResponse> {
  const { requirement } = createStageBodySchema.parse(input);

  const stage = await insertStage({
    name: deriveStageName(requirement),
    requirement,
  });

  return createStageResponseSchema.parse({
    id: stage.id,
    name: stage.name,
    requirement: stage.requirement,
    status: stage.status,
    previewPhase: stage.previewPhase,
    createdAt: stage.createdAt.toISOString(),
  });
}

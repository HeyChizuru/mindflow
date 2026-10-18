/** HTTP request parsing and error responses for the generation routes. */
import { NextResponse } from "next/server";
import type { z } from "zod";
import { LlmSettingsError } from "@/lib/ai/openai-compat";
import { SceneGenerationError } from "@/lib/generation/scene-generation-error";
import { StageNotFoundError } from "@/lib/services/stages";

export async function parseSceneGenerationRequest<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new SceneGenerationError("请求体必须是合法 JSON", 400);
  }
  const result = schema.safeParse(input);
  if (!result.success) throw new SceneGenerationError("场景生成参数无效，请检查大纲与生成内容", 400);
  return result.data;
}

export function sceneGenerationErrorResponse(error: unknown, step: string) {
  if (error instanceof SceneGenerationError || error instanceof LlmSettingsError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  if (error instanceof StageNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  // Upstream messages and exception objects may contain credentials or private prompt data.
  console.error(`[scene-generation:${step}] failed`);
  return NextResponse.json({ error: "场景生成失败，请重试" }, { status: 500 });
}

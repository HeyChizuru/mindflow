import { LlmSettingsError, requireChatModel } from "@/lib/ai/openai-compat";
import { requireEmbeddingModel } from "@/lib/knowledge/embedding-config";
import {
  confirmOutlines,
  getStageForConfirmation,
  StageGenerationConflictError,
} from "@/lib/services/stage-generation";
import { StageNotFoundError } from "@/lib/services/stages";
import { confirmOutlinesBodySchema } from "@/lib/validators/stage-generation";
import { stageIdSchema } from "@/lib/validators/stages";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const stageId = stageIdSchema.parse(id);
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 });
    }
    const body = confirmOutlinesBodySchema.parse(input);
    const stage = await getStageForConfirmation(stageId);
    await requireChatModel(request);
    if (stage.hasKnowledgeBase) await requireEmbeddingModel(request);
    const result = await confirmOutlines(stageId, body, stage.hasKnowledgeBase);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "确认参数无效，请检查大纲及流完成声明" }, { status: 400 });
    }
    if (error instanceof StageNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof StageGenerationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof LlmSettingsError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[POST /api/stages/[id]/confirm-outlines] failed");
    return NextResponse.json({ error: "确认大纲失败，请重试" }, { status: 500 });
  }
}

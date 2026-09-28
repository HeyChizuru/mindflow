import { LlmSettingsError } from "@/lib/ai/llm-connection";
import { requireEmbeddingModel } from "@/lib/knowledge/embedding-config";
import {
  ingestStage,
  KnowledgeNotFoundError,
  KnowledgeValidationError,
} from "@/lib/services/knowledge";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * 解析已上传 PDF：读盘 → unpdf → 切分 → 向量化写入 chunks。
 * 不接收文件。向量模型从头解析，不要求 Chat-Model。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { model: embedding } = await requireEmbeddingModel(request);
    const result = await ingestStage(id, { embeddingModel: embedding });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof LlmSettingsError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof KnowledgeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof KnowledgeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Validation failed" },
        { status: 400 },
      );
    }

    console.error("[POST /api/stages/[id]/ingest]", error);

    return NextResponse.json({ error: "Failed to ingest stage" }, { status: 500 });
  }
}

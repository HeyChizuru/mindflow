import { LlmSettingsError } from "@/lib/ai/llm-connection";
import { requireEmbeddingModel } from "@/lib/knowledge/embedding-config";
import {
  ingestStage,
  KnowledgeNotFoundError,
  KnowledgeValidationError,
} from "@/lib/services/knowledge";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { claimIngest, failIngest, IngestBusyError, IngestSupersededError, readIngestStatus } from "@/lib/services/ingest-execution";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await readIngestStatus(id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof KnowledgeNotFoundError) return NextResponse.json({ error: 'stage not found' }, { status: 404 });
    if (error instanceof ZodError) return NextResponse.json({ error: 'stageId must be a uuid' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to read ingest status' }, { status: 500 });
  }
}

/**
 * 解析已上传 PDF：读盘 → unpdf → 切分 → 向量化写入 chunks。
 * 不接收文件。向量模型从头解析，不要求 Chat-Model。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let executionId: string | undefined;

  try {
    executionId = await claimIngest(id, request.headers.get('x-mindflow-ingest-mode') === 'if-unready');
    const { model: embedding } = await requireEmbeddingModel(request);
    const result = await ingestStage(id, { embeddingModel: embedding, executionId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (executionId) {
      const code = error instanceof LlmSettingsError ? 'configuration'
        : error instanceof KnowledgeValidationError ? 'document' : 'processing';
      await failIngest(id, executionId, code).catch(() => undefined);
    }
    if (error instanceof IngestBusyError || error instanceof IngestSupersededError) {
      return NextResponse.json({ error: 'ingest already processing or result expired' }, { status: 409 });
    }
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

    console.error("[POST /api/stages/[id]/ingest] processing failed");

    return NextResponse.json({ error: "Failed to ingest stage" }, { status: 500 });
  }
}

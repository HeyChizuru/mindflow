import {
  ingestStage,
  KnowledgeNotFoundError,
  KnowledgeValidationError,
} from "@/lib/services/knowledge";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * 解析已上传 PDF：读 uploads/ → unpdf → 切分 → 写 raw_text 与 chunks。
 * 不接收文件，不写 embedding。
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const result = await ingestStage(id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
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

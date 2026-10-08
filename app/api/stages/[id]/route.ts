import {
  getStage,
  removeStage,
  StageNotFoundError,
  StageValidationError,
} from "@/lib/services/stages";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * 按课堂 id 读回 requirements 与文档摘要。
 * 不读 PDF、不返回全文。不存在时 404。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const stage = await getStage(id);
    return NextResponse.json(stage, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "[GET /api/stages/[id]]", "Failed to get stage");
  }
}

/**
 * 删除课堂及其 chunks、documents，并清掉 uploads/{id}。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const result = await removeStage(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error, "[DELETE /api/stages/[id]]", "Failed to delete stage");
  }
}

/** 把课堂服务错误映射为 JSON。校验 400，不存在 404，其余 500 且不回传堆栈 */
function toErrorResponse(error: unknown, logLabel: string, fallback: string) {
  if (error instanceof StageNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof StageValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Validation failed" },
      { status: 400 },
    );
  }

  console.error(logLabel, error);

  return NextResponse.json({ error: fallback }, { status: 500 });
}

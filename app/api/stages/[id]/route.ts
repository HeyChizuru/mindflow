import {
  removeStage,
  StageNotFoundError,
  StageValidationError,
} from "@/lib/services/stages";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

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

    console.error("[DELETE /api/stages/[id]]", error);

    return NextResponse.json({ error: "Failed to delete stage" }, { status: 500 });
  }
}

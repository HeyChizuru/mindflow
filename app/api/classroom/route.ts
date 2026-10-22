import { NextResponse } from "next/server";
import { ClassroomReadError, getClassroom } from "@/lib/services/classroom";
import { classroomErrorResponseSchema } from "@/lib/validators/classroom";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const ids = new URL(request.url).searchParams.getAll("id");
    if (ids.length !== 1) throw new ClassroomReadError("INVALID_REQUEST", "请提供唯一的课堂 id");
    return NextResponse.json(await getClassroom(ids[0]), { headers });
  } catch (error) {
    const failure = error instanceof ClassroomReadError
      ? error : new ClassroomReadError("READ_FAILED", "读取课堂失败，请重试");
    if (failure.code === "READ_FAILED") console.error("[GET /api/classroom] failed");
    const body = classroomErrorResponseSchema.parse({
      success: false, code: failure.code, error: failure.message,
      answerSaved: null, submissionId: null, record: null,
    });
    return NextResponse.json(body, { status: failure.statusCode, headers });
  }
}

import { NextResponse } from "next/server";
import { ClassroomError, getClassroom, savePlaybackPosition } from "@/lib/services/classroom";
import { classroomErrorResponseSchema } from "@/lib/validators/classroom";

const headers = { "Cache-Control": "no-store" };

function classroomId(request: Request) {
  const ids = new URL(request.url).searchParams.getAll("id");
  if (ids.length !== 1) throw new ClassroomError("INVALID_REQUEST", "请提供唯一的课堂 id");
  return ids[0];
}

function errorResponse(error: unknown, method: "GET" | "PATCH") {
  const failure = error instanceof ClassroomError ? error : method === "GET"
    ? new ClassroomError("READ_FAILED", "读取课堂失败，请重试")
    : new ClassroomError("SAVE_FAILED", "保存播放位置失败，请重新读取课堂后重试");
  if (failure.statusCode === 500) console.error(`[${method} /api/classroom] failed`);
  const body = classroomErrorResponseSchema.parse({
    success: false, code: failure.code, error: failure.message,
    answerSaved: null, submissionId: null, record: null,
  });
  return NextResponse.json(body, { status: failure.statusCode, headers });
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getClassroom(classroomId(request)), { headers });
  } catch (error) {
    return errorResponse(error, "GET");
  }
}

export async function PATCH(request: Request) {
  try {
    const id = classroomId(request);
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new ClassroomError("INVALID_REQUEST", "请求体必须是有效 JSON"); }
    return NextResponse.json(await savePlaybackPosition(id, body), { headers });
  } catch (error) {
    return errorResponse(error, "PATCH");
  }
}

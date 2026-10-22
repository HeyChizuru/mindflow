import { NextResponse } from "next/server";
import { requireChatModel } from "@/lib/ai/openai-compat";
import { gradeQuiz, QuizRequestError } from "@/lib/services/quiz";
import { classroomErrorResponseSchema } from "@/lib/validators/classroom";

// The execution lease remains 120 seconds; allow time for request parsing and persistence too.
export const maxDuration = 180;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new QuizRequestError("INVALID_REQUEST", 400, "请求体必须是有效 JSON"); }
    const result = await gradeQuiz(body, () => requireChatModel(request));
    return NextResponse.json(result, { headers });
  } catch (error) {
    const failure = error instanceof QuizRequestError ? error
      : new QuizRequestError("READ_FAILED", 500, "处理测验失败，请读取当前记录后重试", null);
    if (failure.statusCode >= 500) console.error("[POST /api/quiz-grade] failed");
    return NextResponse.json(classroomErrorResponseSchema.parse({
      success: false, code: failure.code, error: failure.message, answerSaved: failure.answerSaved,
      submissionId: failure.submissionId, record: failure.record,
    }), { status: failure.statusCode, headers });
  }
}

import type { ClassroomErrorResponse, ClassroomReadResponse, QuizGradeBody, QuizSubmission } from '@/lib/types/classroom';
import { classroomIdSchema, classroomReadResponseSchema, classroomErrorResponseSchema, quizGradeBodySchema, quizGradeResponseSchema, savePlaybackPositionResponseSchema } from '@/lib/validators/classroom';

export type ReadyClassroom = Extract<ClassroomReadResponse, { state: 'ready' }>['classroom'];
export class ClassroomRequestError extends Error {
  constructor(message: string, readonly status = 0, readonly payload: ClassroomErrorResponse | null = null) {
    super(message);
    this.name = 'ClassroomRequestError';
  }
}
async function responseBody(response: Response, fallback: string): Promise<unknown> {
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ClassroomRequestError(fallback, response.status); }
  if (!response.ok) {
    const parsed = classroomErrorResponseSchema.safeParse(body);
    throw new ClassroomRequestError(parsed.success ? parsed.data.error : fallback, response.status, parsed.success ? parsed.data : null);
  }
  return body;
}
export async function readClassroom(id: string, signal?: AbortSignal): Promise<ClassroomReadResponse> {
  const normalized = classroomIdSchema.parse(id);
  const response = await fetch('/api/classroom?id=' + encodeURIComponent(normalized), { cache: 'no-store', signal });
  const parsed = classroomReadResponseSchema.safeParse(await responseBody(response, '读取课堂失败，请重试'));
  if (!parsed.success || (parsed.data.state === 'ready' ? parsed.data.classroom.stage.id : parsed.data.stage.id) !== normalized) {
    throw new ClassroomRequestError('课堂读取响应无效，请重试', response.status);
  }
  return parsed.data;
}
export async function writePlaybackPosition(stageId: string, sceneId: string, signal?: AbortSignal) {
  const response = await fetch('/api/classroom?id=' + encodeURIComponent(stageId), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId }), signal,
  });
  const parsed = savePlaybackPositionResponseSchema.safeParse(await responseBody(response, '位置保存结果待确认，请先重新读取'));
  if (!parsed.success || parsed.data.stageId !== stageId || parsed.data.sceneId !== sceneId) {
    throw new ClassroomRequestError('位置保存响应无效，请先重新读取', response.status);
  }
  return parsed.data;
}
export function belongsToQuestion(record: QuizSubmission, key: { stageId: string; sceneId: string; questionId: string }) {
  return record.stageId === key.stageId && record.sceneId === key.sceneId && record.questionId === key.questionId;
}
export async function sendQuizAnswer(body: QuizGradeBody, headers: HeadersInit, signal?: AbortSignal): Promise<QuizSubmission> {
  const input = quizGradeBodySchema.parse(body);
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Content-Type', 'application/json');
  const response = await fetch('/api/quiz-grade', { method: 'POST', headers: requestHeaders, body: JSON.stringify(input), signal });
  let value: unknown;
  try { value = await responseBody(response, '提交结果待确认，请先读取当前记录'); }
  catch (error) {
    if (error instanceof ClassroomRequestError && error.payload?.record && !belongsToQuestion(error.payload.record, input)) {
      throw new ClassroomRequestError('提交响应与当前题目不一致，请重新读取', response.status);
    }
    throw error;
  }
  const parsed = quizGradeResponseSchema.safeParse(value);
  const submissionId = input.operation === 'submit' ? input.requestId : input.submissionId;
  if (!parsed.success || !belongsToQuestion(parsed.data.record, input) || parsed.data.record.submissionId !== submissionId) {
    throw new ClassroomRequestError('批改响应与本次提交不一致，请重新读取', response.status);
  }
  return parsed.data.record;
}

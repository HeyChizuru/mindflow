import { randomUUID } from "node:crypto";
import { LlmSettingsError } from "@/lib/ai/llm-connection";
import { prisma } from "@/lib/db/client";
import {
  claimQuizGrading, completeQuizGrading, expireQuizGrading, failQuizGrading,
  getLockedQuizSubmission, getQuizGradingRemainingMs, getQuizSubmission, insertQuizSubmission, replaceQuizSubmission,
} from "@/lib/db/queries/quiz";
import { arraysEqual, gradeChoiceQuestions } from "@/lib/quiz/grading";
import { gradeShortAnswer, ShortAnswerGradingError, type QuizModelResolver } from "@/lib/quiz/short-answer";
import { ClassroomError, getLockedPlayableScene, validateSavedSubmission } from "@/lib/services/classroom";
import type {
  ClassroomErrorCode, QuizAnswer, QuizExecutionKey, QuizFailureCode, QuizGradeBody,
  QuizGradeResponse, QuizGradeResult, QuizQuestionKey, QuizSubmission,
} from "@/lib/types/classroom";
import type { QuizQuestion, Scene } from "@/lib/types/scene";
import { quizGradeBodySchema, quizGradeResponseSchema } from "@/lib/validators/classroom";

/** Per execution, including the model call and result persistence; no automatic model retries. */
export const QUIZ_GRADING_TIMEOUT_MS = 120_000;

export class QuizRequestError extends Error {
  constructor(
    readonly code: ClassroomErrorCode, readonly statusCode: number, message: string,
    readonly answerSaved: boolean | null = false, readonly submissionId: string | null = null,
    readonly record: QuizSubmission | null = null,
  ) {
    super(message);
    this.name = "QuizRequestError";
  }
}

type PreparedQuiz = {
  input: QuizGradeBody; key: QuizQuestionKey; scene: Scene; question: QuizQuestion;
  languageDirective: string | null; record: QuizSubmission; ownsExecution: boolean;
};

function questionKey(input: QuizGradeBody): QuizQuestionKey {
  return { stageId: input.stageId, sceneId: input.sceneId, questionId: input.questionId };
}

function submissionId(input: QuizGradeBody) {
  return input.operation === "submit" ? input.requestId : input.submissionId;
}

function sameAnswer(a: QuizAnswer, b: QuizAnswer) {
  if (a.type === "multiple" && b.type === "multiple") return arraysEqual(a.values, b.values);
  if (a.type === "single" && b.type === "single") return a.value === b.value;
  return a.type === "short_answer" && b.type === "short_answer" && a.text === b.text;
}

function conflict(input: QuizGradeBody, record: QuizSubmission | null) {
  return new QuizRequestError("CONFLICT", 409, "记录已变化，请恢复最新记录后再操作",
    record?.submissionId === submissionId(input), submissionId(input), record);
}

function failure(record: QuizSubmission): QuizRequestError {
  const code = record.failureCode;
  if (code === "MODEL_CONFIG_REQUIRED") {
    return new QuizRequestError("MODEL_CONFIG_REQUIRED", 401, "答案已保存，请检查对话模型配置后显式重试", true, record.submissionId, record);
  }
  if (code === "GRADING_TIMEOUT" || record.executionExpired) {
    return new QuizRequestError("GRADING_TIMEOUT", 504, "答案已保存，本次批改已超时，可显式重试或重做", true, record.submissionId, record);
  }
  if (code === "RESULT_SAVE_FAILED") {
    return new QuizRequestError("SAVE_FAILED", 500, "答案已保存，批改结果未保存，请读取当前记录后选择是否重新批改", true, record.submissionId, record);
  }
  return new QuizRequestError("GRADING_FAILED", 502, "答案已保存，批改失败，可显式重试或重做", true, record.submissionId, record);
}

function response(record: QuizSubmission): QuizGradeResponse {
  if (record.status === "failed" || record.executionExpired) throw failure(record);
  return quizGradeResponseSchema.parse({ success: true, record });
}

function validateAnswer(question: QuizQuestion, answer: QuizAnswer) {
  if (question.type !== answer.type) throw new QuizRequestError("INVALID_REQUEST", 400, "答案题型与已保存题目不一致");
  if (question.type !== "short_answer" && answer.type !== "short_answer") {
    const values = answer.type === "single" ? [answer.value] : answer.values;
    if (values.some((value) => !question.options.some((option) => option.value === value))) {
      throw new QuizRequestError("INVALID_REQUEST", 400, "答案包含本题不存在的选项");
    }
  }
}

function choiceResult(question: QuizQuestion, answer: QuizAnswer): QuizGradeResult | null {
  if (question.type === "short_answer" || answer.type === "short_answer") return null;
  const [grade] = gradeChoiceQuestions([question], { [question.id]: answer.type === "single" ? answer.value : answer.values });
  return { type: question.type, correct: grade.correct === true, earned: grade.earned,
    points: question.points, analysis: question.analysis, correctAnswer: question.answer };
}

async function prepareQuiz(input: QuizGradeBody): Promise<PreparedQuiz> {
  const key = questionKey(input);
  let writing = false;
  let validated: Pick<PreparedQuiz, "scene" | "question" | "languageDirective"> | undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      const { stage, scene } = await getLockedPlayableScene(input.stageId, input.sceneId, tx);
      if (scene.content.type !== "quiz") throw new QuizRequestError("INVALID_REQUEST", 400, "目标场景不是测验");
      const question = scene.content.questions.find((candidate) => candidate.id === input.questionId);
      if (!question) throw new QuizRequestError("NOT_FOUND", 404, "本场景不存在该题目");
      validated = { scene, question, languageDirective: stage.languageDirective };
      let record = await getLockedQuizSubmission(key, tx);
      if (record) validateSavedSubmission(record, [scene], input.stageId);
      if (input.operation === "submit") {
        validateAnswer(question, input.answer);
        if (record?.submissionId === input.requestId) {
          if (!sameAnswer(record.answer, input.answer)) {
            throw new QuizRequestError("INVALID_REQUEST", 400, "同一提交标识不能携带不同答案", false, null, record);
          }
          if (record.version !== (input.expectedVersion ?? 0) + 1) throw conflict(input, record);
        } else {
          if (record ? record.version !== input.expectedVersion : input.expectedVersion !== null) throw conflict(input, record);
          if (record?.status === "processing") {
            if (!record.executionExpired) {
              throw new QuizRequestError("GRADING_IN_PROGRESS", 409, "本题正在批改，暂不能改答或重做", false, input.requestId, record);
            }
            writing = true;
            const expired = await expireQuizGrading({ ...key, submissionId: record.submissionId, executionId: record.executionId! }, tx);
            if (!expired) throw conflict(input, await getQuizSubmission(key, tx));
            record = expired;
          }
          if (record && record.version === 2_147_483_647) throw conflict(input, record);
          writing = true;
          const data = { ...key, submissionId: input.requestId, answer: input.answer, result: choiceResult(question, input.answer) };
          record = record
            ? await replaceQuizSubmission({ ...data, expectedVersion: record.version }, tx)
            : await insertQuizSubmission(data, tx);
          if (!record) throw conflict(input, await getQuizSubmission(key, tx));
        }
      } else {
        if (!record) throw new QuizRequestError("NOT_FOUND", 404, "当前提交不存在");
        if (record.submissionId !== input.submissionId) throw conflict(input, record);
        if (question.type !== "short_answer") throw new QuizRequestError("INVALID_REQUEST", 400, "选择题无需请求模型批改", true, record.submissionId, record);
        if (record.status !== "completed" && record.gradingRequestId !== input.requestId) {
          if (record.executionId !== input.expectedExecutionId) throw conflict(input, record);
          if (record.status === "processing" && !record.executionExpired) {
            throw new QuizRequestError("GRADING_IN_PROGRESS", 409, "本题正在批改，请稍后读取当前记录", true, record.submissionId, record);
          }
        }
        if (record.status === "processing" && record.executionExpired) {
          writing = true;
          record = await expireQuizGrading({ ...key, submissionId: record.submissionId, executionId: record.executionId! }, tx);
          if (!record) throw conflict(input, await getQuizSubmission(key, tx));
        }
      }

      const context = { input, key, scene, question, languageDirective: stage.languageDirective, record, ownsExecution: false };
      const canClaim = record.answer.type === "short_answer"
        && (record.status === "pending" || (input.operation === "retry" && record.status === "failed"))
        && record.gradingRequestId !== input.requestId;
      if (!canClaim) return context;
      writing = true;
      const claimed = await claimQuizGrading({ ...key, submissionId: record.submissionId, executionId: randomUUID(),
        requestId: input.requestId, expectedExecutionId: record.executionId, timeoutMs: QUIZ_GRADING_TIMEOUT_MS }, tx);
      if (!claimed) throw conflict(input, await getQuizSubmission(key, tx));
      return { ...context, record: claimed, ownsExecution: true };
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    if (error instanceof QuizRequestError) throw error;
    if (error instanceof ClassroomError) throw new QuizRequestError(error.code, error.statusCode, error.message);
    // Readback resolves a known commit; storage errors never start another model call.
    if (writing) {
      try {
        const latest = await getQuizSubmission(key);
        if (validated && latest?.submissionId === submissionId(input)
          && (input.operation === "retry" || sameAnswer(input.answer, latest.answer))) {
          validateSavedSubmission(latest, [validated.scene], input.stageId);
          if (latest.status === "completed") return { input, key, ...validated, record: latest, ownsExecution: false };
          throw new QuizRequestError("SAVE_FAILED", 500, "存储响应异常，请读取已保存记录后再操作", true, latest.submissionId, latest);
        }
      } catch (recoveryError) {
        if (recoveryError instanceof QuizRequestError) throw recoveryError;
      }
    }
    throw new QuizRequestError(writing ? "SAVE_FAILED" : "READ_FAILED", 500,
      writing ? "保存结果暂无法确认，请重新读取课堂后重试" : "读取或校验测验失败，请重试", null, submissionId(input));
  }
}

async function latestForExecution(context: PreparedQuiz): Promise<QuizSubmission> {
  const latest = await getQuizSubmission(context.key);
  if (!latest) throw new QuizRequestError("NOT_FOUND", 404, "提交或所属课堂已被删除", false, context.record.submissionId);
  validateSavedSubmission(latest, [context.scene], context.input.stageId);
  if (latest.submissionId !== context.record.submissionId || latest.executionId !== context.record.executionId) {
    throw conflict(context.input, latest);
  }
  return latest;
}

/** Resolve ambiguous writes before allowing the user to request another model execution. */
async function recoverExecutionWrite(context: PreparedQuiz, key: QuizExecutionKey): Promise<QuizGradeResponse> {
  let latest: QuizSubmission | null = null;
  try {
    latest = await latestForExecution(context);
    if (latest.status === "completed") return response(latest);
    if (latest.status === "processing") {
      latest = await failQuizGrading({ ...key, failureCode: "RESULT_SAVE_FAILED" })
        ?? await expireQuizGrading(key) ?? await latestForExecution(context);
    }
    if (latest.status === "completed") return response(latest);
  } catch (error) {
    if (error instanceof QuizRequestError) throw error;
  }
  throw new QuizRequestError("SAVE_FAILED", 500, "答案已保存，结果存储异常，请读取当前记录后选择是否重试",
    true, context.record.submissionId, latest);
}

async function runGrading(context: PreparedQuiz, resolveModel: QuizModelResolver): Promise<QuizGradeResponse> {
  const { record, question } = context;
  if (question.type !== "short_answer" || record.answer.type !== "short_answer" || !record.executionId) {
    throw new QuizRequestError("READ_FAILED", 500, "批改执行数据无效", true, record.submissionId, record);
  }
  const key: QuizExecutionKey = { ...context.key, submissionId: record.submissionId, executionId: record.executionId };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const remaining = await getQuizGradingRemainingMs(key);
    if (remaining === null) return response(await latestForExecution(context));
    let result: QuizGradeResult | undefined;
    let gradingError: unknown;
    try {
      if (remaining <= 0) throw new Error("Deadline exceeded");
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Deadline exceeded")); }, Math.ceil(remaining));
      });
      const work = async () => {
        const model = await resolveModel();
        controller.signal.throwIfAborted();
        return gradeShortAnswer(question, record.answer.type === "short_answer" ? record.answer.text : "",
          context.languageDirective, model.chat, controller.signal);
      };
      result = await Promise.race([work(), deadline]);
    } catch (error) {
      gradingError = error;
    }
    if (gradingError) {
      const timedOut = controller.signal.aborted || remaining <= 0;
      const failureCode: Exclude<QuizFailureCode, "GRADING_TIMEOUT"> = gradingError instanceof LlmSettingsError
        ? "MODEL_CONFIG_REQUIRED" : gradingError instanceof ShortAnswerGradingError ? gradingError.failureCode : "MODEL_CALL_FAILED";
      const failed = timedOut ? await expireQuizGrading(key)
        : await failQuizGrading({ ...key, failureCode }) ?? await expireQuizGrading(key);
      const latest = failed ?? await latestForExecution(context);
      if (latest.status === "completed") return response(latest);
      if (gradingError instanceof LlmSettingsError && latest.failureCode === "MODEL_CONFIG_REQUIRED") {
        throw new QuizRequestError(gradingError.statusCode === 400 ? "INVALID_REQUEST" : "MODEL_CONFIG_REQUIRED",
          gradingError.statusCode, "答案已保存，请检查本次对话模型配置后显式重试", true, latest.submissionId, latest);
      }
      throw failure(latest);
    }
    const completed = await completeQuizGrading({ ...key, result: result! });
    if (completed) return response(completed);
    const latest = await expireQuizGrading(key) ?? await latestForExecution(context);
    return response(latest);
  } catch (error) {
    if (error instanceof QuizRequestError) throw error;
    return recoverExecutionWrite(context, key);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Single request: persist submission, then grade only when this request acquired an execution lease. */
export async function gradeQuiz(input: unknown, resolveModel: QuizModelResolver): Promise<QuizGradeResponse> {
  const parsed = quizGradeBodySchema.safeParse(input);
  if (!parsed.success) throw new QuizRequestError("INVALID_REQUEST", 400, "提交格式无效，请提供题目标识、请求标识、预期版本及有效答案");
  const context = await prepareQuiz(parsed.data);
  return context.ownsExecution ? runGrading(context, resolveModel) : response(context.record);
}

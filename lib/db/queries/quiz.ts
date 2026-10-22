import { prisma } from "@/lib/db/client";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type {
  QuizAnswer, QuizExecutionKey, QuizFailureCode, QuizGradeResult,
  QuizQuestionKey, QuizSubmission, QuizSubmissionKey,
} from "@/lib/types/classroom";
import {
  classroomIdSchema, quizAnswerSchema, quizExecutionKeySchema, quizGradeResultSchema,
  quizQuestionKeySchema, quizSubmissionKeySchema, quizSubmissionSchema,
} from "@/lib/validators/classroom";
import { z } from "zod";

type QuizDatabase = Pick<PrismaClient, "$queryRaw">;
type DateField = "gradingStartedAt" | "gradingExpiresAt" | "gradedAt" | "createdAt" | "updatedAt";
type QuizRow = Omit<QuizSubmission, DateField> & {
  gradingStartedAt: Date | null;
  gradingExpiresAt: Date | null;
  gradedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Fixed identifiers only. Values below always use Prisma's parameterized SQL.
const columns = Prisma.sql`
  q.stage_id AS "stageId", q.scene_id AS "sceneId", q.question_id AS "questionId",
  q.submission_id AS "submissionId", q.version, q.answer, q.status, q.result,
  q.failure_code AS "failureCode", q.grading_request_id AS "gradingRequestId",
  q.execution_id AS "executionId", q.grading_started_at AS "gradingStartedAt",
  q.grading_expires_at AS "gradingExpiresAt", q.graded_at AS "gradedAt",
  (q.status = 'processing' AND q.grading_expires_at <= clock_timestamp()) AS "executionExpired",
  q.created_at AS "createdAt", q.updated_at AS "updatedAt"
`;

function toSubmission(row: QuizRow): QuizSubmission {
  return quizSubmissionSchema.parse({
    ...row,
    gradingStartedAt: row.gradingStartedAt?.toISOString() ?? null,
    gradingExpiresAt: row.gradingExpiresAt?.toISOString() ?? null,
    gradedAt: row.gradedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function first(rows: QuizRow[]) {
  return rows.length === 0 ? null : toSubmission(rows[0]);
}

function questionWhere(key: QuizQuestionKey) {
  return Prisma.sql`q.stage_id = ${key.stageId}::uuid AND q.scene_id = ${key.sceneId}::uuid AND q.question_id = ${key.questionId}`;
}

function executionWhere(key: QuizExecutionKey) {
  return Prisma.sql`${questionWhere(key)} AND q.submission_id = ${key.submissionId}::uuid AND q.execution_id = ${key.executionId}::uuid`;
}

/** PostgreSQL may evaluate UPDATE conditions/values before waiting for a row lock. Read time after locking. */
function lockedExecution(key: QuizExecutionKey) {
  return Prisma.sql`
    WITH candidate AS MATERIALIZED (
      SELECT q.scene_id, q.question_id, q.grading_expires_at FROM quiz_submissions AS q
      WHERE ${executionWhere(key)} AND q.status = 'processing' FOR UPDATE
    ), timing AS MATERIALIZED (
      SELECT scene_id, question_id, grading_expires_at,
        date_trunc('milliseconds', clock_timestamp()) AS checked_at FROM candidate
    )
  `;
}

export async function getQuizSubmission(key: QuizQuestionKey, db: QuizDatabase = prisma) {
  const parsed = quizQuestionKeySchema.parse(key);
  const rows = await db.$queryRaw<QuizRow[]>(Prisma.sql`
    SELECT ${columns} FROM quiz_submissions AS q WHERE ${questionWhere(parsed)}
  `);
  return first(rows);
}

export async function getQuizSubmissionsByStageId(stageId: string, db: QuizDatabase = prisma) {
  const id = classroomIdSchema.parse(stageId);
  const rows = await db.$queryRaw<QuizRow[]>(Prisma.sql`
    SELECT ${columns} FROM quiz_submissions AS q WHERE q.stage_id = ${id}::uuid ORDER BY q.scene_id, q.question_id
  `);
  return rows.map(toSubmission);
}

type SubmissionWrite = QuizSubmissionKey & { answer: QuizAnswer; result: QuizGradeResult | null };
const submissionWriteSchema = quizSubmissionKeySchema.extend({ answer: quizAnswerSchema, result: quizGradeResultSchema.nullable() })
  .superRefine((input, context) => {
    if (input.answer.type === "short_answer" ? input.result !== null : input.result?.type !== input.answer.type) {
      context.addIssue({ code: "custom", message: "新简答必须待批改，选择题必须同时保存相同题型的判分结果" });
    }
  });

/** Null means another request already created this question's current record. Never overwrites it. */
export async function insertQuizSubmission(input: SubmissionWrite, db: QuizDatabase = prisma) {
  const data = submissionWriteSchema.parse(input);
  const completed = data.answer.type !== "short_answer";
  const rows = await db.$queryRaw<QuizRow[]>(Prisma.sql`
    INSERT INTO quiz_submissions AS q (
      stage_id, scene_id, question_id, submission_id, version, answer, status, result, graded_at, updated_at
    ) VALUES (
      ${data.stageId}::uuid, ${data.sceneId}::uuid, ${data.questionId}, ${data.submissionId}::uuid, 1,
      ${JSON.stringify(data.answer)}::jsonb, ${completed ? "completed" : "pending"},
      ${data.result === null ? null : JSON.stringify(data.result)}::jsonb,
      CASE WHEN ${completed} THEN clock_timestamp() ELSE NULL END, clock_timestamp()
    ) ON CONFLICT (scene_id, question_id) DO NOTHING RETURNING ${columns}
  `);
  return first(rows);
}

/** Services must first validate the saved question/answer; this primitive only performs compare-and-swap. */
export async function replaceQuizSubmission(input: SubmissionWrite & { expectedVersion: number }, db: QuizDatabase = prisma) {
  const { expectedVersion, ...write } = input;
  const data = submissionWriteSchema.parse(write);
  const expected = z.number().int().positive().max(2_147_483_646).parse(expectedVersion);
  const completed = data.answer.type !== "short_answer";
  const rows = await db.$queryRaw<QuizRow[]>(Prisma.sql`
    UPDATE quiz_submissions AS q SET
      submission_id = ${data.submissionId}::uuid, version = q.version + 1,
      answer = ${JSON.stringify(data.answer)}::jsonb, status = ${completed ? "completed" : "pending"},
      result = ${data.result === null ? null : JSON.stringify(data.result)}::jsonb,
      graded_at = CASE WHEN ${completed} THEN clock_timestamp() ELSE NULL END,
      failure_code = NULL, grading_request_id = NULL, execution_id = NULL,
      grading_started_at = NULL, grading_expires_at = NULL, updated_at = clock_timestamp()
    WHERE ${questionWhere(data)} AND q.version = ${expected} AND q.submission_id <> ${data.submissionId}::uuid
      AND q.status <> 'processing'
    RETURNING ${columns}
  `);
  return first(rows);
}

/** Locked candidate fixes the start time after acquiring the row lock, not before a possible wait. */
export async function claimQuizGrading(
  input: QuizExecutionKey & { requestId: string; expectedExecutionId: string | null; timeoutMs: number }, db: QuizDatabase = prisma,
) {
  const { requestId, expectedExecutionId, timeoutMs, ...identity } = input;
  const key = quizExecutionKeySchema.parse(identity);
  const request = classroomIdSchema.parse(requestId);
  const expectedExecution = classroomIdSchema.nullable().parse(expectedExecutionId);
  const duration = z.literal(120_000).parse(timeoutMs);
  const rows = await db.$queryRaw<QuizRow[]>(Prisma.sql`
    WITH candidate AS MATERIALIZED (
      SELECT q.scene_id, q.question_id FROM quiz_submissions AS q
      WHERE ${questionWhere(key)} AND q.submission_id = ${key.submissionId}::uuid
        AND q.answer->>'type' = 'short_answer' AND q.status IN ('pending', 'failed')
        AND q.execution_id IS NOT DISTINCT FROM ${expectedExecution}::uuid
        AND q.grading_request_id IS DISTINCT FROM ${request}::uuid
        AND q.execution_id IS DISTINCT FROM ${key.executionId}::uuid
      FOR UPDATE
    ), timing AS MATERIALIZED (
      SELECT scene_id, question_id, date_trunc('milliseconds', clock_timestamp()) AS started_at FROM candidate
    )
    UPDATE quiz_submissions AS q SET
      status = 'processing', grading_request_id = ${request}::uuid, execution_id = ${key.executionId}::uuid,
      grading_started_at = timing.started_at,
      grading_expires_at = timing.started_at + ${duration} * INTERVAL '1 millisecond',
      result = NULL, graded_at = NULL, failure_code = NULL, updated_at = timing.started_at
    FROM timing WHERE q.scene_id = timing.scene_id AND q.question_id = timing.question_id
    RETURNING ${columns}
  `);
  return first(rows);
}

/** Only a still-current, still-live execution may persist a final result. */
export async function completeQuizGrading(
  input: QuizExecutionKey & { result: QuizGradeResult }, db: QuizDatabase = prisma,
) {
  const { result, ...identity } = input;
  const key = quizExecutionKeySchema.parse(identity);
  const grade = quizGradeResultSchema.parse(result);
  if (grade.type !== "short_answer") throw new Error("Model grading only accepts a short-answer result");
  const rows = await db.$queryRaw<QuizRow[]>(Prisma.sql`
    ${lockedExecution(key)}
    UPDATE quiz_submissions AS q SET status = 'completed', result = ${JSON.stringify(grade)}::jsonb,
      failure_code = NULL, graded_at = timing.checked_at, updated_at = timing.checked_at
    FROM timing WHERE q.scene_id = timing.scene_id AND q.question_id = timing.question_id
      AND timing.grading_expires_at > timing.checked_at
    RETURNING ${columns}
  `);
  return first(rows);
}

/** An ordinary error ends the current live execution immediately; expired ones use expireQuizGrading. */
export async function failQuizGrading(
  input: QuizExecutionKey & { failureCode: Exclude<QuizFailureCode, "GRADING_TIMEOUT"> }, db: QuizDatabase = prisma,
) {
  const { failureCode, ...identity } = input;
  const key = quizExecutionKeySchema.parse(identity);
  const failure = z.enum(["MODEL_CONFIG_REQUIRED", "MODEL_CALL_FAILED", "INVALID_MODEL_RESULT", "RESULT_SAVE_FAILED"]).parse(failureCode);
  const rows = await db.$queryRaw<QuizRow[]>(Prisma.sql`
    ${lockedExecution(key)}
    UPDATE quiz_submissions AS q SET status = 'failed', failure_code = ${failure}, updated_at = timing.checked_at
    FROM timing WHERE q.scene_id = timing.scene_id AND q.question_id = timing.question_id
      AND timing.grading_expires_at > timing.checked_at
    RETURNING ${columns}
  `);
  return first(rows);
}

/** Explicit submit/retry paths may close the observed expired execution. GET never calls this. */
export async function expireQuizGrading(input: QuizExecutionKey, db: QuizDatabase = prisma) {
  const key = quizExecutionKeySchema.parse(input);
  const rows = await db.$queryRaw<QuizRow[]>(Prisma.sql`
    ${lockedExecution(key)}
    UPDATE quiz_submissions AS q SET status = 'failed', failure_code = 'GRADING_TIMEOUT', updated_at = timing.checked_at
    FROM timing WHERE q.scene_id = timing.scene_id AND q.question_id = timing.question_id
      AND timing.grading_expires_at <= timing.checked_at
    RETURNING ${columns}
  `);
  return first(rows);
}

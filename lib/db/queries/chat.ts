import { prisma } from "@/lib/db/client";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  CHAT_EXECUTION_TTL_MS,
  type ChatTurn,
  type ChatTurnKey,
  type ChatExecutionKey,
  type SubmitChat,
  type ChatSource,
  type CompleteChat,
  type FailChat,
} from "@/lib/types/chat";
import { chatTurnSchema } from "@/lib/validators/chat";

type ChatDatabase = Pick<PrismaClient, "$queryRaw">;
type DateField = "executionStartedAt" | "executionExpiresAt" | "completedAt" | "createdAt" | "updatedAt";
type ChatRow = Omit<ChatTurn, DateField> & {
  executionStartedAt: Date | null;
  executionExpiresAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
const columns = Prisma.sql`
  c.id, c.stage_id AS "stageId", c.session_id AS "sessionId", c.scene_id AS "sceneId", c.request_id AS "requestId", c.question,
  c.status, c.reply, c.teacher_id AS "teacherId", c.sources, c.failure_code AS "failureCode",
  c.execution_id AS "executionId", c.execution_started_at AS "executionStartedAt",
  c.execution_expires_at AS "executionExpiresAt", c.completed_at AS "completedAt",
  (c.status = 'processing' AND c.execution_expires_at <= clock_timestamp()) AS "executionExpired",
  c.created_at AS "createdAt", c.updated_at AS "updatedAt"
`;
function toTurn(row: ChatRow): ChatTurn {
  return chatTurnSchema.parse({
    ...row,
    executionStartedAt: row.executionStartedAt?.toISOString() ?? null,
    executionExpiresAt: row.executionExpiresAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
function first(rows: ChatRow[]) {
  return rows.length ? toTurn(rows[0]) : null;
}
function turnWhere(key: ChatTurnKey) {
  return Prisma.sql`c.id = ${key.turnId}::uuid AND c.session_id = ${key.sessionId}::uuid
    AND c.stage_id = ${key.stageId}::uuid AND c.scene_id = ${key.sceneId}::uuid`;
}
function executionWhere(key: ChatExecutionKey) {
  return Prisma.sql`${turnWhere(key)} AND c.execution_id = ${key.executionId}::uuid`;
}

/** Stable reception order, independent of reply or retry time. Never mutates expiry. */
export async function readChatTurns(stageId: string, sessionId: string, filter: { turnId?: string; requestId?: string } = {}, db: ChatDatabase = prisma) {
  const rows = await db.$queryRaw<ChatRow[]>(Prisma.sql`
    SELECT ${columns} FROM chat_turns AS c WHERE c.stage_id = ${stageId}::uuid AND c.session_id = ${sessionId}::uuid
      ${filter.turnId ? Prisma.sql`AND c.id = ${filter.turnId}::uuid` : Prisma.empty}
      ${filter.requestId ? Prisma.sql`AND c.request_id = ${filter.requestId}::uuid` : Prisma.empty}
    ORDER BY c.created_at, c.id
  `);
  return rows.map(toTurn);
}

/** A single statement fixes both visibility and the current question's stable cutoff. */
// 只读取当前会话中在本轮开始前已完成的问答，避免未来回复混入上下文。
export async function readAnswerHistory(key: ChatTurnKey, db: ChatDatabase = prisma) {
  const rows = await db.$queryRaw<ChatRow[]>(Prisma.sql`
    SELECT ${columns} FROM chat_turns AS c
    JOIN chat_turns AS target ON target.id = ${key.turnId}::uuid
      AND target.stage_id = ${key.stageId}::uuid AND target.scene_id = ${key.sceneId}::uuid
      AND target.session_id = ${key.sessionId}::uuid
    WHERE c.stage_id = target.stage_id AND c.session_id = target.session_id AND c.status = 'completed'
      AND (c.created_at, c.id) < (target.created_at, target.id)
      AND c.completed_at <= target.execution_started_at
    ORDER BY c.created_at, c.id
  `);
  return rows.map(toTurn);
}

/** Call inside a short transaction. Read the expiry flag only after acquiring the lock. */
export async function lockChatTurn(key: ChatTurnKey, db: ChatDatabase) {
  // 领取与写回都先锁定同一轮记录，串行检查竞争中的状态变化。
  await db.$queryRaw(Prisma.sql`SELECT c.id FROM chat_turns AS c WHERE ${turnWhere(key)} FOR UPDATE`);
  const rows = await db.$queryRaw<ChatRow[]>(Prisma.sql`SELECT ${columns} FROM chat_turns AS c WHERE ${turnWhere(key)}`);
  return first(rows);
}

export async function insertChatTurn(input: SubmitChat & { turnId: string }, db: ChatDatabase) {
  const rows = await db.$queryRaw<ChatRow[]>(Prisma.sql`
    INSERT INTO chat_turns AS c (id, stage_id, session_id, scene_id, request_id, question, status, created_at, updated_at)
    VALUES (${input.turnId}::uuid, ${input.stageId}::uuid, ${input.sessionId}::uuid, ${input.sceneId}::uuid, ${input.requestId}::uuid,
      ${input.question}, 'pending', clock_timestamp(), clock_timestamp())
    ON CONFLICT (session_id, request_id) DO NOTHING RETURNING ${columns}
  `);
  return first(rows);
}

/** 服务层已锁定并检查记录；SQL 再约束状态、执行身份和数据库时间。 */
// 数据库条件同时检查旧执行身份与状态，确保只有符合条件的请求能领取。
export async function claimChatTurn(key: ChatExecutionKey, expectedExecutionId: string | null, db: ChatDatabase) {
  const rows = await db.$queryRaw<ChatRow[]>(Prisma.sql`
    WITH timing AS MATERIALIZED (SELECT date_trunc('milliseconds', clock_timestamp()) AS started_at)
    UPDATE chat_turns AS c SET status = 'processing', execution_id = ${key.executionId}::uuid,
      execution_started_at = timing.started_at,
      execution_expires_at = timing.started_at + ${CHAT_EXECUTION_TTL_MS} * INTERVAL '1 millisecond',
      failure_code = NULL, reply = NULL, teacher_id = NULL, sources = NULL, completed_at = NULL, updated_at = timing.started_at
    FROM timing WHERE ${turnWhere(key)} AND c.execution_id IS NOT DISTINCT FROM ${expectedExecutionId}::uuid
      AND ((c.status = 'pending' AND ${expectedExecutionId}::uuid IS NULL)
        OR (c.status = 'failed' AND ${expectedExecutionId}::uuid IS NOT NULL)
        OR (c.status = 'processing' AND c.execution_expires_at <= timing.started_at AND ${expectedExecutionId}::uuid IS NOT NULL))
    RETURNING ${columns}
  `);
  return first(rows);
}

/** 已持有行锁；写回时重新读取数据库时间，避免来源校验期间执行过期仍被保存。 */
// 用数据库时间与执行身份约束完成写入，过期结果不能覆盖当前状态。
export async function completeChatTurn(input: CompleteChat, sources: ChatSource[], db: ChatDatabase) {
  const rows = await db.$queryRaw<ChatRow[]>(Prisma.sql`
    WITH timing AS MATERIALIZED (SELECT date_trunc('milliseconds', clock_timestamp()) AS checked_at)
    UPDATE chat_turns AS c SET status = 'completed', reply = ${input.reply}, teacher_id = ${input.teacherId},
      sources = ${JSON.stringify(sources)}::jsonb, failure_code = NULL, completed_at = timing.checked_at, updated_at = timing.checked_at
    FROM timing WHERE ${executionWhere(input)} AND c.status = 'processing' AND c.execution_expires_at > timing.checked_at
    RETURNING ${columns}
  `);
  return first(rows);
}

export async function failChatTurn(input: FailChat, db: ChatDatabase) {
  const rows = await db.$queryRaw<ChatRow[]>(Prisma.sql`
    WITH timing AS MATERIALIZED (SELECT date_trunc('milliseconds', clock_timestamp()) AS checked_at)
    UPDATE chat_turns AS c SET status = 'failed', failure_code = ${input.failureCode}, updated_at = timing.checked_at
    FROM timing WHERE ${executionWhere(input)} AND c.status = 'processing' AND c.execution_expires_at > timing.checked_at
    RETURNING ${columns}
  `);
  return first(rows);
}

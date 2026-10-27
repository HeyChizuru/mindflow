import { prisma } from "@/lib/db/client";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { chatSessionSchema } from "@/lib/validators/chat-session";
import type { ChatSession } from "@/lib/types/chat-session";

type Database = Pick<PrismaClient, "$queryRaw">;
type Row = Omit<ChatSession, "createdAt" | "lastUsedAt"> & { createdAt: Date; lastUsedAt: Date };

export async function readChatSessions(filter: { stageId?: string; sessionId?: string } = {}, db: Database = prisma): Promise<ChatSession[]> {
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT s.id, s.stage_id AS "stageId", COALESCE(NULLIF(btrim(st.name), ''), '课堂') AS "stageName",
      s.is_history AS "isHistory", s.created_at AS "createdAt", s.last_used_at AS "lastUsedAt", first_turn.preview
    FROM chat_sessions AS s JOIN stage AS st ON st.id = s.stage_id
    LEFT JOIN LATERAL (SELECT left(t.question, 80) AS preview FROM chat_turns AS t
      WHERE t.session_id = s.id ORDER BY t.created_at, t.id LIMIT 1) AS first_turn ON true
    WHERE true ${filter.stageId ? Prisma.sql`AND s.stage_id = ${filter.stageId}::uuid` : Prisma.empty}
      ${filter.sessionId ? Prisma.sql`AND s.id = ${filter.sessionId}::uuid` : Prisma.empty}
    ORDER BY s.last_used_at DESC, s.id DESC
  `);
  return rows.map((row) => chatSessionSchema.parse({ ...row, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt.toISOString() }));
}

/** Always lock the session before its turns. No locks span model calls. */
export async function lockChatSession(key: { sessionId: string; stageId: string }, db: Database) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM chat_sessions WHERE id = ${key.sessionId}::uuid AND stage_id = ${key.stageId}::uuid FOR UPDATE
  `;
  return rows.length === 1;
}

export async function insertChatSession(key: { sessionId: string; stageId: string }, db: Database) {
  await db.$queryRaw`INSERT INTO chat_sessions (id, stage_id, created_at, last_used_at)
    VALUES (${key.sessionId}::uuid, ${key.stageId}::uuid, clock_timestamp(), clock_timestamp())`;
}

export async function touchChatSession(key: { sessionId: string; stageId: string }, db: Database) {
  await db.$queryRaw`UPDATE chat_sessions SET last_used_at = GREATEST(last_used_at, clock_timestamp())
    WHERE id = ${key.sessionId}::uuid AND stage_id = ${key.stageId}::uuid`;
}

export async function deleteChatSessionRow(key: { sessionId: string; stageId: string }, db: Database) {
  await db.$queryRaw`DELETE FROM chat_sessions WHERE id = ${key.sessionId}::uuid AND stage_id = ${key.stageId}::uuid`;
}

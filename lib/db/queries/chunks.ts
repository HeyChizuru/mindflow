import { prisma } from "@/lib/db/client";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";

/** 删除某课堂下全部 chunks，供 ingest 重跑覆盖 */
export async function deleteChunksByStageId(
  stageId: string,
  db: Pick<PrismaClient, "chunk"> = prisma,
) {
  return db.chunk.deleteMany({ where: { stageId } });
}

type ChunkInsert = {
  stageId: string;
  documentId: string;
  content: string;
  page: number;
  chunkIndex: number;
  embedding: number[];
};

type ChunkWriter = Pick<PrismaClient, "$executeRaw">;

/**
 * 批量插入切块。必须带 1024 维向量，禁止无向量入库。
 * db 可传入事务客户端，默认使用全局客户端。
 */
export async function insertChunks(rows: ChunkInsert[], db: ChunkWriter = prisma) {
  if (rows.length === 0) {
    return { count: 0 };
  }

  for (const row of rows) {
    const vector = Prisma.raw(`'${toVectorLiteral(row.embedding)}'::vector`);
    await db.$executeRaw`
      INSERT INTO chunks (id, stage_id, document_id, content, page, chunk_index, embedding)
      VALUES (
        gen_random_uuid(),
        ${row.stageId}::uuid,
        ${row.documentId}::uuid,
        ${row.content},
        ${row.page},
        ${row.chunkIndex},
        ${vector}
      )
    `;
  }

  return { count: rows.length };
}

type SimilarChunkRow = {
  id: string;
  content: string;
  page: number | null;
  score: number;
};

/** 按课堂隔离做 cosine 近邻检索；必须带 stage_id */
export async function searchSimilarChunks(
  stageId: string,
  embedding: number[],
  limit = 8,
): Promise<SimilarChunkRow[]> {
  const vector = Prisma.raw(`'${toVectorLiteral(embedding)}'::vector`);

  return prisma.$queryRaw<SimilarChunkRow[]>`
    SELECT
      id::text AS id,
      content,
      page,
      (1 - (embedding <=> ${vector}))::float AS score
    FROM chunks
    WHERE stage_id = ${stageId}::uuid
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vector}
    LIMIT ${limit}
  `;
}

/** 把 number[] 转成 pgvector 字面量；必须是 1024 个有限数字 */
function toVectorLiteral(values: number[]): string {
  if (values.length !== 1024) {
    throw new Error(`embedding must have 1024 dimensions, got ${values.length}`);
  }

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("embedding contains non-finite numbers");
  }

  return `[${values.join(",")}]`;
}

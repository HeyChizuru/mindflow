import { prisma } from "@/lib/db/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/** 删除某课堂下全部 chunks，供 ingest 重跑覆盖 */
export async function deleteChunksByStageId(
  stageId: string,
  db: Pick<PrismaClient, "chunk"> = prisma,
) {
  return db.chunk.deleteMany({ where: { stageId } });
}

/** 批量插入切块正文；不写 embedding */
export async function insertChunks(
  rows: {
    stageId: string;
    documentId: string;
    content: string;
    page: number;
    chunkIndex: number;
  }[],
) {
  if (rows.length === 0) {
    return { count: 0 };
  }

  return prisma.chunk.createMany({ data: rows });
}

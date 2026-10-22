import { prisma } from "@/lib/db/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export async function insertDocument(data: {
  stageId: string;
  filename: string;
  storagePath: string;
}) {
  return prisma.document.create({ data });
}

/** 取该课堂的第一份文档（M1 每课堂最多一份 PDF） */
export async function getDocumentByStageId(stageId: string, db: Pick<PrismaClient, "document"> = prisma) {
  return db.document.findFirst({ where: { stageId } });
}

/**
 * 回写页数与全文，不改 hasKnowledgeBase。
 * db 可传入事务客户端，便于与切块替换一起提交。
 */
export async function updateDocumentParse(
  data: {
    id: string;
    pageCount: number;
    rawText: string;
  },
  db: Pick<PrismaClient, "document"> = prisma,
) {
  return db.document.update({
    where: { id: data.id },
    data: {
      pageCount: data.pageCount,
      rawText: data.rawText,
    },
  });
}

/** 删除某课堂下全部 documents */
export async function deleteDocumentsByStageId(
  stageId: string,
  db: Pick<PrismaClient, "document"> = prisma,
) {
  return db.document.deleteMany({ where: { stageId } });
}

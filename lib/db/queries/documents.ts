import { prisma } from "@/lib/db/client";

export async function insertDocument(data: {
  stageId: string;
  filename: string;
  storagePath: string;
}) {
  return prisma.document.create({ data });
}

/** 取该课堂的第一份文档（M1 每课堂最多一份 PDF） */
export async function getDocumentByStageId(stageId: string) {
  return prisma.document.findFirst({ where: { stageId } });
}

/** ingest 后回写页数与全文；不改 hasKnowledgeBase */
export async function updateDocumentParse(data: {
  id: string;
  pageCount: number;
  rawText: string;
}) {
  return prisma.document.update({
    where: { id: data.id },
    data: {
      pageCount: data.pageCount,
      rawText: data.rawText,
    },
  });
}

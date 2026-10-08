import { prisma } from "@/lib/db/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * 插入课堂。提示词、昵称、背景分列写入；后两者未填时传 null。
 * 不写 requirements JSON，也不解析 PDF。
 */
export async function insertStage(data: {
  name: string;
  requirement: string;
  userNickname: string | null;
  userBio: string | null;
}) {
  return prisma.stage.create({ data });
}

/** 按主键取课堂；不存在返回 null */
export async function getStageById(id: string) {
  return prisma.stage.findUnique({ where: { id } });
}

export async function deleteStage(
  id: string,
  db: Pick<PrismaClient, "stage"> = prisma,
) {
  return db.stage.delete({ where: { id } });
}

/** ingest 完成后打开 RAG 开关 */
export async function setStageHasKnowledgeBase(id: string, value: boolean) {
  return prisma.stage.update({
    where: { id },
    data: { hasKnowledgeBase: value },
  });
}

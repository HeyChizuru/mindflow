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

/**
 * 设置知识库开关。
 * db 可传入事务客户端，便于与切块写入一起提交。
 */
export async function setStageHasKnowledgeBase(
  id: string,
  value: boolean,
  db: Pick<PrismaClient, "stage"> = prisma,
) {
  return db.stage.update({
    where: { id },
    data: { hasKnowledgeBase: value },
  });
}

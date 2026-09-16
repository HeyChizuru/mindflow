import { prisma } from "@/lib/db/client";

export async function insertStage(data: { name: string; requirement: string }) {
  return prisma.stage.create({ data });
}

/** 按主键取课堂；不存在返回 null */
export async function getStageById(id: string) {
  return prisma.stage.findUnique({ where: { id } });
}

export async function deleteStage(id: string) {
  return prisma.stage.delete({ where: { id } });
}

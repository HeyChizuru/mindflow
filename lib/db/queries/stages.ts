import { prisma } from "@/lib/db/client";

export async function insertStage(data: { name: string; requirement: string }) {
  return prisma.stage.create({ data });
}

export async function deleteStage(id: string) {
  return prisma.stage.delete({ where: { id } });
}

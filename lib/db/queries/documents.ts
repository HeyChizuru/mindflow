import { prisma } from "@/lib/db/client";

export async function insertDocument(data: {
  stageId: string;
  filename: string;
  storagePath: string;
}) {
  return prisma.document.create({ data });
}

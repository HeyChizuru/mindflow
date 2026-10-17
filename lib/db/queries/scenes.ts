import { prisma } from "@/lib/db/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { CreateSceneInput } from "@/lib/types/scene";
import { createSceneSchema, sceneSchema } from "@/lib/validators/scenes";

type SceneDatabase = Pick<PrismaClient, "scene">;

function toScene(row: NonNullable<Awaited<ReturnType<PrismaClient["scene"]["findUnique"]>>>) {
  return sceneSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function insertScene(input: CreateSceneInput, db: SceneDatabase = prisma) {
  const data = createSceneSchema.parse(input);
  return toScene(await db.scene.create({ data }));
}

export async function getSceneByOutline(stageId: string, outlineId: string, db: SceneDatabase = prisma) {
  const row = await db.scene.findUnique({ where: { stageId_outlineId: { stageId, outlineId } } });
  return row ? toScene(row) : null;
}

export async function getScenesByStageId(stageId: string, db: SceneDatabase = prisma) {
  const rows = await db.scene.findMany({ where: { stageId }, orderBy: { order: "asc" } });
  return rows.map(toScene);
}

import { prisma } from "@/lib/db/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { CreateSceneInput } from "@/lib/types/scene";
import { createSceneSchema, sceneSchema } from "@/lib/validators/scenes";

type SceneDatabase = Pick<PrismaClient, "scene">;
type SceneRow = NonNullable<Awaited<ReturnType<PrismaClient["scene"]["findUnique"]>>>;

function toScene(row: SceneRow) {
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

/** Protect the first and target scenes from changes until the position transaction commits. */
export async function lockScenesForPlayback(
  stageId: string, sceneId: string, firstOutlineId: string, db: Pick<PrismaClient, "$queryRaw">,
) {
  const rows = await db.$queryRaw<SceneRow[]>`
    SELECT id, stage_id AS "stageId", outline_id AS "outlineId", type, title, "order", content, actions,
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM scenes
    WHERE stage_id = ${stageId}::uuid AND (id = ${sceneId}::uuid OR outline_id = ${firstOutlineId})
    ORDER BY id FOR SHARE
  `;
  return rows.map(toScene);
}

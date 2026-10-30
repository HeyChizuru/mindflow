import { prisma } from '@/lib/db/client';
import type { Prisma } from '@/lib/generated/prisma/client';
import { validateSavedScene } from '@/lib/services/scene-generation';
import { StageNotFoundError, StageValidationError } from '@/lib/services/stages';
import type { StageHistoryItem } from '@/lib/types/stage-history';
import { sceneOutlinesSchema } from '@/lib/validators/outline';
import { sceneSchema } from '@/lib/validators/scenes';
import { stageIdSchema } from '@/lib/validators/stages';
import { historyCursorSchema, historyQuerySchema, renameStageSchema } from '@/lib/validators/stage-history';

const historySelect = {
  id: true, name: true, createdAt: true, outlinesStatus: true, outlines: true, languageDirective: true,
  scenes: true,
} satisfies Prisma.StageSelect;
type HistoryRow = Prisma.StageGetPayload<{ select: typeof historySelect }>;

/** Only the first scene's display content leaves the server; no actions or quiz answers. */
function summarize(row: HistoryRow): StageHistoryItem {
  const base = { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
  try {
    if (row.outlinesStatus === 'draft') {
      if (!Array.isArray(row.outlines) || row.outlines.length || row.languageDirective !== null || row.scenes.length) throw new Error('Invalid draft');
      return { ...base, phase: 'draft', totalPages: null, readyPages: 0, preview: null };
    }
    if (!['confirmed', 'scenes_ready', 'archived'].includes(row.outlinesStatus)) throw new Error('Invalid outline state');
    const outlines = sceneOutlinesSchema.parse(row.outlines);
    const scenes = row.scenes.map(stored => {
      const outline = outlines.find(item => item.id === stored.outlineId);
      if (!outline) throw new Error('Invalid scene association');
      return validateSavedScene(sceneSchema.parse({ ...stored, createdAt: stored.createdAt.toISOString(), updatedAt: stored.updatedAt.toISOString() }), row.id, outline);
    });
    const first = scenes.find(scene => scene.outlineId === outlines[0].id);
    return {
      ...base, totalPages: outlines.length, readyPages: scenes.length,
      phase: !first ? 'first_scene_pending' : scenes.length === outlines.length ? 'ready' : 'partial',
      preview: !first ? null : first.content.type === 'slide'
        ? { type: 'slide', canvas: first.content.canvas } : { type: 'quiz', title: first.title },
    };
  } catch {
    // Keep malformed legacy records visible and manageable, without inventing a recovery state.
    return { ...base, phase: 'invalid', totalPages: null, readyPages: 0, preview: null };
  }
}

export async function listStageHistory(input: unknown) {
  const { query, cursor, limit } = historyQuerySchema.parse(input);
  let before: { createdAt: string; id: string } | undefined;
  if (cursor) {
    try { before = historyCursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))); }
    catch { throw new StageValidationError('列表位置无效，请重新读取'); }
  }
  // Prisma's contains uses LIKE; escape wildcard characters to implement literal contains.
  const where: Prisma.StageWhereInput = query ? { name: { contains: query.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } } : {};
  return prisma.$transaction(async tx => {
    const total = await tx.stage.count();
    const matched = await tx.stage.count({ where });
    const rows = await tx.stage.findMany({
      where: before ? { AND: [where, { OR: [
        { createdAt: { lt: new Date(before.createdAt) } },
        { createdAt: new Date(before.createdAt), id: { lt: before.id } },
      ] }] } : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, select: historySelect,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return { items: page.map(summarize), total, matched,
      nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null };
  }, { isolationLevel: 'RepeatableRead' });
}

export async function getStageHistoryItem(stageId: string) {
  const id = stageIdSchema.parse(stageId);
  const row = await prisma.stage.findUnique({ where: { id }, select: historySelect });
  if (!row) throw new StageNotFoundError('课堂已不存在，请刷新历史列表');
  return summarize(row);
}

export async function renameStage(stageId: string, input: unknown) {
  const id = stageIdSchema.parse(stageId);
  const { name } = renameStageSchema.parse(input);
  // Updating the existing identity can never recreate a concurrently deleted classroom.
  const result = await prisma.stage.updateMany({ where: { id }, data: { name } });
  if (!result.count) throw new StageNotFoundError('课堂已不存在，请刷新历史列表');
  return { id, name };
}

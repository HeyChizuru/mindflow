import { z } from 'zod';
import { slideCanvasSchema } from '@/lib/validators/scenes';
import type { StageHistoryItem, StageHistoryPage, StageDeletionResult } from '@/lib/types/stage-history';

export const renameStageSchema = z.object({
  name: z.string().trim().min(1, '课堂名称不能为空').max(100, '课堂名称不能超过 100 个字符'),
}).strict();
export const historyQuerySchema = z.object({
  query: z.string().trim().max(100).default(''),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(9),
});
export const historyCursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() }).strict();
export const historyItemSchema = z.object({
  id: z.uuid(), name: z.string(), createdAt: z.iso.datetime(),
  phase: z.enum(['draft', 'first_scene_pending', 'partial', 'ready', 'invalid']),
  totalPages: z.number().int().nonnegative().nullable(), readyPages: z.number().int().nonnegative(),
  preview: z.discriminatedUnion('type', [
    z.object({ type: z.literal('slide'), canvas: slideCanvasSchema }),
    z.object({ type: z.literal('quiz'), title: z.string() }),
  ]).nullable(),
}) satisfies z.ZodType<StageHistoryItem>;
export const historyPageSchema = z.object({
  items: z.array(historyItemSchema), total: z.number().int().nonnegative(), matched: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
}) satisfies z.ZodType<StageHistoryPage>;
export const stageDeletionSchema = z.object({
  id: z.uuid(), recordDeleted: z.literal(true), filesDeleted: z.boolean(),
}) satisfies z.ZodType<StageDeletionResult>;

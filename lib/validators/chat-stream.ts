import { z } from 'zod';
import { CHAT_PHASES } from '@/lib/types/chat-stream';
import { CHAT_TEACHER_IDS } from '@/lib/types/chat';
import { chatErrorResponseSchema, chatTurnSchema } from './chat';

const id = z.uuid();
const identity = z.object({ stageId: id, sessionId: id, sceneId: id, requestId: id, turnId: id, executionId: id }).strict();
const sequence = z.number().int().nonnegative();
export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('record'), record: chatTurnSchema, sequence }).strict(),
  z.object({ type: z.literal('start'), record: chatTurnSchema.refine((record) => record.status === 'processing'), sequence }).strict(),
  z.object({ type: z.literal('progress'), identity, phase: z.enum(CHAT_PHASES), teacherId: z.enum(CHAT_TEACHER_IDS).nullable(), sequence }).strict(),
  z.object({ type: z.literal('delta'), identity, text: z.string().min(1).max(12000), sequence }).strict(),
  z.object({ type: z.literal('answer'), identity, reply: z.string().min(1).max(12000), teacherId: z.enum(CHAT_TEACHER_IDS), sequence }).strict(),
  z.object({ type: z.literal('done'), record: chatTurnSchema, sequence }).strict(),
  z.object({ type: z.literal('error'), error: chatErrorResponseSchema, sequence }).strict(),
]);

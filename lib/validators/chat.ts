import type { ChatRequest, ChatResponse } from "@/lib/types/chat";
import type { SourceRef } from "@/lib/types/knowledge";
import { z } from "zod";

export const sourceRefSchema = z.object({
  chunkId: z.uuid(),
  page: z.number().int().positive().optional(),
  excerpt: z.string(),
  score: z.number().optional(),
}) satisfies z.ZodType<SourceRef>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const chatRequestSchema = z.object({
  stageId: z.uuid("stageId must be a uuid"),
  messages: z.array(chatMessageSchema).min(1, "messages must not be empty"),
}) satisfies z.ZodType<ChatRequest>;

export const chatResponseSchema = z.object({
  text: z.string(),
  sources: z.array(sourceRefSchema),
}) satisfies z.ZodType<ChatResponse>;

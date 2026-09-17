import type { IngestResponse } from "@/lib/types/knowledge";
import { z } from "zod";

export const stageIdSchema = z.uuid("stageId must be a uuid");

export const ingestResponseSchema = z.object({
  stageId: z.uuid(),
  documentId: z.uuid(),
  pageCount: z.number().int().positive(),
  charCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  hasKnowledgeBase: z.literal(false),
}) satisfies z.ZodType<IngestResponse>;

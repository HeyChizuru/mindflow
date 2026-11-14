import "server-only";
import type { EmbeddingModel } from "ai";
import { embedQuery } from "@/lib/knowledge/embed";
import { getStageById } from "@/lib/db/queries/stages";
import { getChatSourcesByChunkIds, searchSimilarChunks } from "@/lib/db/queries/chunks";
import type { ChatSource } from "@/lib/types/chat";
import { chatSourceSchema } from "@/lib/validators/chat";

// 将本轮查询向量化，并仅检索当前课堂的资料片段。
export async function retrieveChat(stageId: string, query: string, model: EmbeddingModel, abortSignal: AbortSignal): Promise<ChatSource[]> {
  const stage = await getStageById(stageId);
  if (!stage) throw new Error("Missing classroom");
  if (!stage.hasKnowledgeBase) return [];
  const embedding = await embedQuery(query, model, { abortSignal, maxRetries: 0 });
  abortSignal.throwIfAborted();
  const rows = await searchSimilarChunks(stageId, embedding, 8);
  const sources = await getChatSourcesByChunkIds(stageId, rows.map((row) => row.id));
  if (sources.length !== rows.length) throw new Error("Invalid retrieval ownership");
  const byId = new Map(sources.map((source) => [source.chunkId, source]));
  return rows.map((row) => chatSourceSchema.parse(byId.get(row.id)));
}

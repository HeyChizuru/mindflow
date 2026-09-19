import { searchSimilarChunks } from "@/lib/db/queries/chunks";
import { getStageById } from "@/lib/db/queries/stages";
import { embedQuery } from "@/lib/knowledge/embed";
import type { SourceRef } from "@/lib/types/knowledge";

const EXCERPT_CHARS = 120;
const RETRIEVE_LIMIT = 8;

/**
 * 按课堂检索相关切块。无知识库、课堂不存在或问题为空时返回 []，不抛错。
 * 必须按 stage_id 过滤，防止跨课堂泄漏。
 */
export async function retrieve(
  stageId: string,
  query: string,
): Promise<SourceRef[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const stage = await getStageById(stageId);
  if (!stage?.hasKnowledgeBase) {
    return [];
  }

  const embedding = await embedQuery(trimmed);
  const rows = await searchSimilarChunks(stageId, embedding, RETRIEVE_LIMIT);

  return rows.map((row) => ({
    chunkId: row.id,
    ...(row.page != null ? { page: row.page } : {}),
    excerpt: toExcerpt(row.content),
    score: Number(row.score),
  }));
}

/** 压空白后截约 120 字，供引用展示 */
function toExcerpt(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= EXCERPT_CHARS) {
    return compact;
  }

  return compact.slice(0, EXCERPT_CHARS);
}

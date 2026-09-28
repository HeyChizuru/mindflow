import { embedMany } from "ai";
import type { EmbeddingModel } from "ai";

/** BGE-M3 / 当前 pgvector 列维度 */
const EMBEDDING_DIMS = 1024;

/**
 * 用已解析的 embedding 模型把文本批量转成 1024 维向量。
 * 不传 dimensions（BGE-M3 不支持该参数）。不写库、不读 env。
 */
export async function embedTexts(
  texts: string[],
  model: EmbeddingModel,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const { embeddings } = await embedMany({
    model,
    values: texts,
  });

  for (const embedding of embeddings) {
    if (embedding.length !== EMBEDDING_DIMS) {
      throw new Error(
        `embedding must have ${EMBEDDING_DIMS} dimensions, got ${embedding.length}`,
      );
    }
  }

  return embeddings;
}

/**
 * 把单条查询转成 1024 维向量，供 retrieve 使用。
 */
export async function embedQuery(
  text: string,
  model: EmbeddingModel,
): Promise<number[]> {
  const [embedding] = await embedTexts([text], model);
  if (!embedding) {
    throw new Error("failed to embed query");
  }

  return embedding;
}

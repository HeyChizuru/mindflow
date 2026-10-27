import { embedMany } from "ai";
import type { EmbeddingModel } from "ai";

/** BGE-M3 / 当前 pgvector 列维度 */
const EMBEDDING_DIMS = 1024;

/** 返回向量的维度与存储列要求的 1024 不一致 */
export class EmbeddingDimensionError extends Error {
  constructor(actual: number) {
    super(`embedding must have 1024 dimensions, got ${actual}`);
    this.name = "EmbeddingDimensionError";
  }
}

/**
 * 用已解析的 embedding 模型把文本批量转成 1024 维向量。
 * 不传 dimensions（BGE-M3 不支持该参数）。不写库、不读 env。
 * 维度不符时抛 EmbeddingDimensionError，由调用方决定如何拒绝。
 */
export async function embedTexts(
  texts: string[],
  model: EmbeddingModel,
  options: { abortSignal?: AbortSignal; maxRetries?: number } = {},
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const { embeddings } = await embedMany({
    model,
    values: texts,
    ...options,
  });

  for (const embedding of embeddings) {
    if (embedding.length !== EMBEDDING_DIMS) {
      throw new EmbeddingDimensionError(embedding.length);
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
  options: { abortSignal?: AbortSignal; maxRetries?: number } = {},
): Promise<number[]> {
  const [embedding] = await embedTexts([text], model, options);
  if (!embedding) {
    throw new Error("failed to embed query");
  }

  return embedding;
}

import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";

/** BGE-M3 / 当前 pgvector 列维度 */
const EMBEDDING_DIMS = 1024;

/**
 * 用 SiliconFlow OpenAI 兼容接口把文本批量转成 1024 维向量。
 * 不传 dimensions（BGE-M3 不支持该参数）。不写库。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const siliconflow = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
  });

  const { embeddings } = await embedMany({
    model: siliconflow.embeddingModel(
      process.env.EMBEDDING_MODEL ?? "BAAI/bge-m3",
    ),
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

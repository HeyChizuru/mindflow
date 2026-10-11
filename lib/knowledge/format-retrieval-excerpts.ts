import type { SourceRef } from "@/lib/types/knowledge";

/**
 * 将检索结果格式化为大纲 prompt 中的摘录块。
 * 空数组返回空字符串，调用方不应把该变量传入 buildPrompt。
 */
export function formatRetrievalExcerpts(sources: SourceRef[]): string {
  if (sources.length === 0) {
    return "";
  }

  return sources
    .map((source, index) => {
      const pageSuffix = source.page != null ? ` (page ${source.page})` : "";
      return `${index + 1}. ${source.excerpt}${pageSuffix}`;
    })
    .join("\n\n");
}

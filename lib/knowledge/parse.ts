import type { ParsedPdfPage } from "@/lib/types/knowledge";
import { extractText } from "unpdf";

/**
 * 用 unpdf 按页抽文本。必须 mergePages:false，否则没有页码。
 * 不读盘、不写库。
 */
export async function parsePdf(data: Uint8Array): Promise<ParsedPdfPage[]> {
  const { text } = await extractText(data, { mergePages: false });

  return text.map((pageText, index) => ({
    page: index + 1,
    text: pageText.trim(),
  }));
}

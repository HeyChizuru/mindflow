import type { ParsedPdfPage, TextChunk } from "@/lib/types/knowledge";

/** 按字符近似 token（M1 不引 tokenizer） */
const CHUNK_SIZE = 650;

/** 相邻块重叠字符数，减少句中切断 */
const CHUNK_OVERLAP = 80;

const DEFAULT_SEPARATORS = ["\n\n", "\n", "。", "！", "？", "；", " ", ""] as const;

/**
 * 按页递归切分，返回带页码与全局序号的块。无向量、不写库。
 * 空页跳过；禁止先把全书拼成一条再切。
 */
export function splitPagesToChunks(pages: ParsedPdfPage[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) {
      continue;
    }

    const parts = splitTextRecursive(
      text,
      DEFAULT_SEPARATORS,
      CHUNK_SIZE,
      CHUNK_OVERLAP,
    );

    for (const content of parts) {
      if (!content) {
        continue;
      }

      chunks.push({
        content,
        page: page.page,
        chunkIndex,
      });
      chunkIndex += 1;
    }
  }

  return chunks;
}

/**
 * 按分隔符优先级递归拆段，再合并到 chunkSize，并叠 chunkOverlap。
 */
function splitTextRecursive(
  text: string,
  separators: readonly string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const pieces = splitToPieces(text, separators, chunkSize);
  return mergeWithOverlap(pieces, chunkSize, chunkOverlap);
}

/** 用当前分隔符拆段；超长段用后续分隔符继续拆，直到硬切为码点 */
function splitToPieces(
  text: string,
  separators: readonly string[],//只读数组
  chunkSize: number,
): string[] {
  if (text.length <= chunkSize) {
    return text ? [text] : [];
  }
  //将切分方法解构为两个变量
  const [separator, ...rest] = separators;//rest是剩余的分离器

  if (separator === "") {
    return [...text];
  }

  const raw = text.split(separator);
  const pieces: string[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const isLast = index === raw.length - 1;
    const part = isLast ? raw[index] : `${raw[index]}${separator}`;
    if (!part) {
      continue;
    }

    if (part.length > chunkSize) {
      pieces.push(...splitToPieces(part, rest, chunkSize));
    } else {
      pieces.push(part);
    }
  }

  return pieces;
}

/** 把短段拼到不超过 chunkSize；下一块开头带上上一块末尾 overlap 字符 */
function mergeWithOverlap(
  pieces: string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    if (!piece) {
      continue;
    }

    if (!current) {
      current = piece;
      continue;
    }

    if (current.length + piece.length <= chunkSize) {
      current += piece;
      continue;
    }

    chunks.push(current);
    const overlap = current.slice(-Math.min(chunkOverlap, current.length));
    current =
      overlap.length + piece.length <= chunkSize ? `${overlap}${piece}` : piece;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

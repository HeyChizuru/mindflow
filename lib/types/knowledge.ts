/** unpdf 按页抽文本后的一页 */
export type ParsedPdfPage = {
  page: number;
  text: string;
};

/** 按页切分后的一块（无向量） */
export type TextChunk = {
  content: string;
  page: number;
  chunkIndex: number;
};

/** POST /api/stages/[id]/ingest 成功响应（本轮切分落库，不建知识库） */
export type IngestResponse = {
  stageId: string;
  documentId: string;
  pageCount: number;
  charCount: number;
  chunkCount: number;
  hasKnowledgeBase: false;
};

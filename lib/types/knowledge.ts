/** unpdf 按页抽文本后的一页 */
export type ParsedPdfPage = {
  page: number;
  text: string;
};

/** POST /api/stages/[id]/ingest 成功响应（本轮仅解析，不建知识库） */
export type IngestResponse = {
  stageId: string;
  documentId: string;
  pageCount: number;
  charCount: number;
  hasKnowledgeBase: false;
};

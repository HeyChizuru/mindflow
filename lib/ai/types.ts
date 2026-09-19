/** 请求体或 localStorage 中的部分配置（字段均可选） */
export type LlmSettings = {
  apiKey?: string;
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
};

/** resolve 之后：调用模型前必填项已填满 */
export type ResolvedLlmSettings = {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
};

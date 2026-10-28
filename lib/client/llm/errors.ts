export const MODEL_ERRORS: Record<string, string> = {
  'LLM chatModel is not set': '请先配置对话模型',
  'LLM chat apiKey is not set': '请先配置对话模型密钥',
  'LLM chat baseUrl is not set': '请先配置对话模型 API 地址',
  'LLM chat baseUrl is invalid': '对话模型 API 地址无效',
  'LLM chat baseUrl is not allowed': '对话模型 API 地址不可用',
  'LLM embeddingModel is not set': '本次资料查询需要向量模型，请先配置',
  'LLM embedding apiKey is not set': '请先配置向量模型密钥',
  'LLM embedding baseUrl is not set': '请先配置向量模型 API 地址',
  'LLM embedding baseUrl is invalid': '向量模型 API 地址无效',
  'LLM embedding baseUrl is not allowed': '向量模型 API 地址不可用',
};

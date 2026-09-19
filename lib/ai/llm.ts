import { generateText, streamText } from "ai";

type GenerateTextParams = Parameters<typeof generateText>[0];
type StreamTextParams = Parameters<typeof streamText>[0];

/** 从 AI SDK model 取出可打日志的 id，不含 apiKey */
function modelLabel(model: GenerateTextParams["model"]): string {
  if (typeof model === "string") {
    return model;
  }

  if (model && typeof model === "object" && "modelId" in model) {
    return String(model.modelId);
  }

  return "unknown";
}

/**
 * 非流式文本补全。params 与 generateText 相同，必须已带解析后的 model。
 * source 仅作日志标签；不重试、不修 JSON。
 */
export async function callLLM(params: GenerateTextParams, source: string) {
  console.info(`[llm:${source}] generateText model=${modelLabel(params.model)}`);
  return generateText(params);
}

/**
 * 流式文本补全。不把流读完，调用方自行消费 textStream。
 * source 仅作日志标签。
 */
export function streamLLM(params: StreamTextParams, source: string) {
  console.info(`[llm:${source}] streamText model=${modelLabel(params.model)}`);
  return streamText(params);
}

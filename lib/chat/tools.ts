import "server-only";
import { tool, type EmbeddingModel, type LanguageModel, type ToolSet } from "ai";
import { LlmSettingsError } from "@/lib/ai/llm-connection";
import { ClassroomError } from "@/lib/services/classroom";
import { projectTeachingContext } from "@/lib/services/teaching-context";
import { retrieveChat } from "@/lib/knowledge/retrieve-chat";
import { readSceneToolSchema, searchPdfToolSchema } from "@/lib/validators/chat";
import type { ChatSource } from "@/lib/types/chat";
import { ChatBudget, ChatAgentError, CHAT_LIMITS } from "./budget";
import { filterRelevantCandidates, protectedQuestions, readChatClassroom, type ChatContext } from "./context";

export function chatTools(hasKnowledgeBase: boolean): ToolSet {
  return {
    read_scene: tool({ description: "Read one ready saved scene in this classroom. Select its sceneId from the course directory.", inputSchema: readSceneToolSchema }),
    ...(hasKnowledgeBase ? { search_course_pdf: tool({ description: "Search this course's PDF when document evidence is needed. Use a specific contextual query; revise it if no relevant evidence was found.", inputSchema: searchPdfToolSchema }) } : {}),
  };
}

export async function executeChatTool(
  name: string, input: unknown,
  dependencies: { stageId: string; context: ChatContext; sources: Map<string, ChatSource>; model: LanguageModel;
    resolveEmbedding: () => Promise<EmbeddingModel>; budget: ChatBudget },
) {
  const { stageId, context, model, budget, sources } = dependencies;
  if (name !== "read_scene" && name !== "search_course_pdf") throw new ChatAgentError("TOOL_FAILED", "模型选择了未授权工具", "TOOL_FAILED");
  budget.takeTool(name === "search_course_pdf");
  let toolSignal: AbortSignal | undefined;
  try {
    const classroom = await readChatClassroom(stageId);
    // Refresh saved facts without changing this turn's routing decision.
    context.protectedQuestions = protectedQuestions(classroom);
    context.pendingGrading = classroom.answers.filter((answer) => answer.status !== "completed")
      .map(({ sceneId, questionId, status }) => ({ sceneId, questionId, status }));
    if (name === "read_scene") {
      const parsed = readSceneToolSchema.safeParse(input);
      if (!parsed.success) throw new ChatAgentError("TOOL_FAILED", "场景读取参数无效", "TOOL_FAILED");
      const teaching = projectTeachingContext({ stageId, sceneId: parsed.data.sceneId }, classroom);
      if (JSON.stringify(teaching.scene).length > CHAT_LIMITS.toolChars) throw new ChatAgentError("LIMIT_EXCEEDED", "场景内容超过本轮工具长度");
      return { status: "ok", scene: teaching.scene, protectedQuestions: context.protectedQuestions };
    }
    const parsed = searchPdfToolSchema.safeParse(input);
    if (!parsed.success || !context.course.hasKnowledgeBase) throw new ChatAgentError("TOOL_FAILED", "本轮不允许该 PDF 检索请求", "TOOL_FAILED");
    const embedding = await dependencies.resolveEmbedding();
    toolSignal = budget.callSignal();
    const found = await retrieveChat(stageId, parsed.data.query, embedding, toolSignal);
    budget.check();
    const relevant = await filterRelevantCandidates(found.map((source) => ({ id: source.chunkId, text: JSON.stringify(source) })), model, budget, parsed.data.query);
    const admitted = found.filter((source) => relevant.has(source.chunkId));
    if (JSON.stringify(admitted).length > CHAT_LIMITS.toolChars) throw new ChatAgentError("LIMIT_EXCEEDED", "检索资料超过本轮工具长度，请缩小查询范围");
    admitted.forEach((source) => sources.set(source.chunkId, source));
    return { status: admitted.length ? "ok" : "no_match", sources: admitted, protectedQuestions: context.protectedQuestions };
  } catch (error) {
    if (error instanceof ChatAgentError) throw error;
    budget.check();
    if (toolSignal?.aborted) throw new ChatAgentError("LIMIT_EXCEEDED", "本次资料查询超时，本轮未完成");
    if (error instanceof LlmSettingsError) throw new ChatAgentError("TOOL_CONFIG_MISSING", "本次 PDF 查询配置缺失或无效，请检查向量设置后重试", "TOOL_FAILED");
    if (error instanceof ClassroomError && (error.code === "NOT_FOUND" || error.code === "NOT_READY")) {
      return { status: error.code === "NOT_FOUND" ? "not_found" : "not_ready" };
    }
    throw new ChatAgentError("TOOL_FAILED", "本次课程资料查询失败，请重试", "TOOL_FAILED");
  }
}

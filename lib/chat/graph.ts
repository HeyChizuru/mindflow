import "server-only";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { tool, type EmbeddingModel, type LanguageModel, type ModelMessage } from "ai";
import { buildChatPrompt } from "@/lib/prompts/build-chat-prompt";
import { chatAnswerSchema, chatRouteSchema } from "@/lib/validators/chat";
import type { ChatSource, ChatTeacherId, ChatTurn } from "@/lib/types/chat";
import { chatStreamIdentity, type ChatObserver, type ChatPhase } from "@/lib/types/chat-stream";
import { ChatBudget, ChatAgentError, CHAT_LIMITS } from "./budget";
import { checkFinalAnswer, prepareChatContext, type ChatContext } from "./context";
import { chatTools, executeChatTool } from "./tools";
import { ReplyPreview } from './reply-preview';

const AnswerState = Annotation.Root({
  context: Annotation<ChatContext | null>,
  teacherId: Annotation<ChatTeacherId | null>,
  messages: Annotation<ModelMessage[]>,
  calls: Annotation<{ toolCallId: string; toolName: string; input: unknown }[]>,
  answer: Annotation<{ reply: string; chunkIds: string[] } | null>,
});

function onlyAddsCitations(original: string, formatted: string): boolean {
  let input = 0;
  let output = 0;
  while (output < formatted.length) {
    if (input < original.length && original[input] === formatted[output]) { input++; output++; continue; }
    const marker = formatted.slice(output).match(/^[ \t]?\[\d+\]/);
    if (!marker) return false;
    output += marker[0].length;
  }
  return input === original.length;
}

export async function runChatGraph(record: ChatTurn, dependencies: {
  model: LanguageModel; budget: ChatBudget; resolveEmbedding: () => Promise<EmbeddingModel>; observe?: ChatObserver;
}) {
  const { model, budget } = dependencies;
  const identity = chatStreamIdentity(record);
  const progress = (phase: ChatPhase, teacherId: ChatTeacherId | null = null) =>
    dependencies.observe?.({ type: 'progress', identity, phase, teacherId });
  const sources = new Map<string, ChatSource>();
  const graph = new StateGraph(AnswerState)
    .addNode("prepare_context", async () => {
      progress('preparing');
      const context = await prepareChatContext(record, model, budget);
      return { context, messages: [
        { role: "user" as const, content: JSON.stringify({ referenceContext: {
          course: context.course, scene: context.scene, protectedQuestions: context.protectedQuestions,
          memory: context.memory, restrictedHistory: context.restrictedHistory,
        } }) },
        ...context.history,
        { role: "user" as const, content: record.question },
      ] };
    })
    .addNode("route_teacher", async (state) => {
      progress('routing');
      const route = await budget.structured(model, buildChatPrompt("chat-router"), {
        question: record.question, context: state.context,
      }, chatRouteSchema);
      return { teacherId: route.teacherId };
    })
    .addNode("teacher", async (state) => {
      if (!state.context || !state.teacherId) throw new ChatAgentError("CONTEXT_FAILED", "本轮教师上下文未就绪");
      // Tools can add protected questions/pending grades. Re-evaluate before every teacher invocation.
      const protectedReply = !!(state.context.protectedQuestions.length || state.context.pendingGrading.length);
      progress(protectedReply ? 'reviewing' : 'answering', state.teacherId);
      const previews = new Map<string, ReplyPreview>();
      let preview = '';
      const tools = { ...chatTools(state.context.course.hasKnowledgeBase),
        final_answer: tool({ description: "Return the complete draft reply and actually used source IDs. This is a structured output, not a database write.", inputSchema: chatAnswerSchema }),
      };
      const result = await budget.model(model, buildChatPrompt("chat-teacher", state.teacherId), state.messages, tools, "auto",
        dependencies.observe ? (chunk) => {
          if (protectedReply) return;
          if (chunk.type === 'tool-input-start' && chunk.toolName === 'final_answer') previews.set(chunk.id, new ReplyPreview());
          if (chunk.type !== 'tool-input-delta') return;
          const reader = previews.get(chunk.id);
          if (!reader) return;
          let text: string;
          try { text = reader.append(chunk.delta); }
          catch { throw new ChatAgentError('REPLY_INVALID', '回复增量格式无效，本轮未完成', 'REPLY_INVALID'); }
          if (text) {
            preview += text;
            dependencies.observe!({ type: 'delta', identity, text });
          }
        } : undefined);
      const final = result.toolCalls.find((call) => call.toolName === "final_answer");
      if (final) {
        const parsed = chatAnswerSchema.safeParse(final.input);
        if (final.invalid || result.toolCalls.length !== 1 || !parsed.success) {
          throw new ChatAgentError("REPLY_INVALID", "模型的完整回复出口无效或与资料调用混用", "REPLY_INVALID");
        }
        if (preview && preview !== parsed.data.reply) {
          throw new ChatAgentError('REPLY_INVALID', '回复增量与完整结果不一致，本轮未完成', 'REPLY_INVALID');
        }
        return { calls: [], answer: parsed.data };
      }
      if (result.toolCalls.length) {
        if (result.toolCalls.some((call) => call.invalid || !Object.hasOwn(tools, call.toolName))) {
          throw new ChatAgentError("TOOL_FAILED", "模型返回了无效或未授权的工具调用", "TOOL_FAILED");
        }
        return { messages: [...state.messages, ...result.response.messages], calls: result.toolCalls.map((call) => ({
          toolCallId: call.toolCallId, toolName: call.toolName, input: call.input,
        })) };
      }
      if (dependencies.observe) {
        throw new ChatAgentError('MODEL_UNSUPPORTED', '模型未返回可流式处理的最终回复，请检查模型工具能力', 'MODEL_FAILED');
      }
      let raw: unknown;
      try { raw = JSON.parse(result.text); }
      catch {
        if (result.finishReason !== "stop" || !result.text.trim() || /^\s*\{/.test(result.text)) {
          throw new ChatAgentError("REPLY_INVALID", "教师未返回完整回复", "REPLY_INVALID");
        }
        if (!sources.size) {
          const plain = chatAnswerSchema.safeParse({ reply: result.text, chunkIds: [] });
          if (!plain.success) throw new ChatAgentError("REPLY_INVALID", "教师回复长度或内容无效", "REPLY_INVALID");
          return { calls: [], answer: plain.data };
        }
        raw = await budget.structured(model, buildChatPrompt("chat-context-filter"),
          { task: "format_answer", draft: result.text, sources: [...sources.values()] }, chatAnswerSchema);
        const formatted = chatAnswerSchema.safeParse(raw);
        if (!formatted.success || !onlyAddsCitations(result.text, formatted.data.reply)) {
          throw new ChatAgentError("REPLY_INVALID", "回复整理改写了正文，未保存结果", "REPLY_INVALID");
        }
      }
      const parsed = chatAnswerSchema.safeParse(raw);
      if (!parsed.success) throw new ChatAgentError("REPLY_INVALID", "教师回复或引用字段无效", "REPLY_INVALID");
      return { calls: [], answer: parsed.data };
    })
    .addNode("tools", async (state) => {
      if (!state.context) throw new ChatAgentError("CONTEXT_FAILED", "工具上下文未就绪");
      const messages: ModelMessage[] = [];
      for (const call of state.calls) {
        progress(call.toolName === 'search_course_pdf' ? 'searching_pdf' : 'reading_scene', state.teacherId);
        const result = await executeChatTool(call.toolName, call.input, {
          ...dependencies, stageId: record.stageId, context: state.context, sources,
        });
        messages.push({ role: "tool", content: [{ type: "tool-result", toolCallId: call.toolCallId,
          toolName: call.toolName, output: { type: "json", value: JSON.parse(JSON.stringify(result)) } }] });
      }
      return { messages: [...state.messages, ...messages], calls: [] };
    })
    .addNode("validate_answer", async (state) => {
      progress('validating', state.teacherId);
      if (!state.answer || !state.context) throw new ChatAgentError("REPLY_INVALID", "本轮未产生完整回复", "REPLY_INVALID");
      if (state.answer.chunkIds.some((id) => !sources.has(id))) {
        throw new ChatAgentError("REPLY_INVALID", "回复引用不属于本轮实际取得的资料", "REPLY_INVALID");
      }
      if (state.answer.chunkIds.some((_, i) => !state.answer!.reply.includes(`[${i + 1}]`))) {
        throw new ChatAgentError("REPLY_INVALID", "回复引用未与正文标注对应", "REPLY_INVALID");
      }
      await checkFinalAnswer(state.answer.reply, state.context, model, budget);
      budget.check();
      return {};
    })
    .addEdge(START, "prepare_context")
    .addEdge("prepare_context", "route_teacher")
    .addEdge("route_teacher", "teacher")
    .addConditionalEdges("teacher", (state) => state.calls.length ? "tools" : "validate_answer")
    .addEdge("tools", "teacher")
    .addEdge("validate_answer", END)
    .compile();
  const result = await graph.invoke({ context: null, teacherId: null, messages: [], calls: [], answer: null }, {
    recursionLimit: CHAT_LIMITS.recursion, signal: budget.signal,
  });
  if (!result.answer || !result.teacherId) throw new ChatAgentError("REPLY_INVALID", "本轮问答未完成", "REPLY_INVALID");
  return { ...result.answer, teacherId: result.teacherId, sources: result.answer.chunkIds.map((id) => sources.get(id)!) };
}

import { NextResponse } from "next/server";
import { ChatError, getChatHistory } from "@/lib/services/chat";
import { answerChat } from "@/lib/chat/answer";
import { requireChatModel } from "@/lib/ai/openai-compat";
import { requireEmbeddingModel } from "@/lib/knowledge/embedding-config";
import { chatRequestSchema } from '@/lib/validators/chat';
import type { ChatRequest } from '@/lib/types/chat';
import type { ChatStreamPayload } from '@/lib/types/chat-stream';

// 路由时限还包括执行租约之外的请求准备和数据保存。
export const maxDuration = 210;

const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const safe = safeError(error);
  return NextResponse.json(safe.toResponse(), { status: safe.statusCode, headers });
}
function safeError(error: unknown) {
  return error instanceof ChatError ? error : new ChatError('READ_FAILED', '聊天服务暂时不可用，请重试');
}

// 将问答执行事件编码为 SSE；最终保存状态以返回的记录为准。
function streamAnswer(request: Request, input: ChatRequest) {
  const connection = new AbortController();
  const signal = AbortSignal.any([request.signal, connection.signal]);
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let sequence = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      function enqueue(text: string) {
        if (closed || signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
          connection.abort();
        }
      }
      const send = (event: ChatStreamPayload) =>
        enqueue('data: ' + JSON.stringify({ ...event, sequence: sequence++ }) + '\n\n');
      heartbeat = setInterval(() => enqueue(': heartbeat\n\n'), 15000);
      void (async () => {
        try {
          const result = await answerChat(input, {
            resolveModel: async () => (await requireChatModel(request)).chat,
            resolveEmbedding: async () => (await requireEmbeddingModel(request)).model,
            signal, observe: send,
          });
          send({ type: 'done', record: result.record });
        } catch (error) {
          send({ type: 'error', error: safeError(error).toResponse() });
        } finally {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
      connection.abort();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}

/** 读取历史只返回已保存状态，不领取执行权或触发重试。 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input: Record<string, string> = Object.create(null);
    for (const [key, value] of params) {
      if (Object.hasOwn(input, key)) throw new ChatError("INVALID_REQUEST", "查询字段不能重复");
      input[key] = value;
    }
    return NextResponse.json(await getChatHistory(input), { headers });
  } catch (error) {
    return failure(error);
  }
}

/** 提交或恢复问题；只有成功领取执行权的请求才调用模型。 */
export async function POST(request: Request) {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new ChatError("INVALID_REQUEST", "请求正文必须是有效 JSON", { questionSaved: false });
    }
    const parsed = chatRequestSchema.safeParse(input);
    if (!parsed.success) throw new ChatError('INVALID_REQUEST', '聊天请求字段或身份无效', { questionSaved: false });
    if (request.headers.get('accept')?.split(',').some((type) => type.trim().split(';')[0] === 'text/event-stream')) {
      return streamAnswer(request, parsed.data);
    }
    return NextResponse.json(await answerChat(input, {
      resolveModel: async () => (await requireChatModel(request)).chat,
      resolveEmbedding: async () => (await requireEmbeddingModel(request)).model,
      signal: request.signal,
    }), { headers });
  } catch (error) {
    return failure(error);
  }
}

import { NextResponse } from "next/server";
import { ChatError, getChatHistory } from "@/lib/services/chat";
import { answerChat } from "@/lib/chat/answer";
import { requireChatModel } from "@/lib/ai/openai-compat";
import { requireEmbeddingModel } from "@/lib/knowledge/embedding-config";

// Includes request preparation and persistence outside the separate 180-second execution lease.
export const maxDuration = 210;

const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const safe = error instanceof ChatError ? error : new ChatError("READ_FAILED", "聊天服务暂时不可用，请重试");
  return NextResponse.json(safe.toResponse(), { status: safe.statusCode, headers });
}

/** Reading saved history never claims or resumes work. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input: Record<string, string> = Object.create(null);
    for (const [key, value] of params) {
      if (Object.hasOwn(input, key)) throw new ChatError("INVALID_REQUEST", "查询字段不能重复");
      input[key] = value;
    }
    return NextResponse.json(await getChatHistory(input), { headers });
  } catch (error) { return failure(error); }
}

/** Restore first; only a claimed execution may call the model. */
export async function POST(request: Request) {
  try {
    let input: unknown;
    try { input = await request.json(); }
    catch { throw new ChatError("INVALID_REQUEST", "请求正文必须是有效 JSON", { questionSaved: false }); }
    return NextResponse.json(await answerChat(input, {
      resolveModel: async () => (await requireChatModel(request)).chat,
      resolveEmbedding: async () => (await requireEmbeddingModel(request)).model,
      signal: request.signal,
    }), { headers });
  } catch (error) { return failure(error); }
}

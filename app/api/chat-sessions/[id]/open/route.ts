import { NextResponse } from "next/server";
import { ChatSessionError, safeChatSessionError, openChatSession } from "@/lib/services/chat-sessions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  try {
    let input: unknown;
    try { input = await request.json(); } catch { throw new ChatSessionError("INVALID_REQUEST"); }
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !("stageId" in input)) {
      throw new ChatSessionError("INVALID_REQUEST");
    }
    return NextResponse.json(await openChatSession({ ...input, sessionId: (await context.params).id }), { headers });
  } catch (error) {
    const safe = safeChatSessionError(error);
    return NextResponse.json(safe.toResponse(), { status: safe.statusCode, headers });
  }
}

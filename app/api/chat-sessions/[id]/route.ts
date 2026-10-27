import { NextResponse } from "next/server";
import { ChatSessionError, safeChatSessionError, getChatSession, deleteChatSession } from "@/lib/services/chat-sessions";

type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const safe = safeChatSessionError(error);
  return NextResponse.json(safe.toResponse(), { status: safe.statusCode, headers });
}
export async function GET(_request: Request, context: Context) {
  try { return NextResponse.json(await getChatSession((await context.params).id), { headers }); }
  catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.size !== 1 || params.getAll("stageId").length !== 1) throw new ChatSessionError("INVALID_REQUEST");
    return NextResponse.json(await deleteChatSession({ sessionId: (await context.params).id, stageId: params.get("stageId") }), { headers });
  } catch (error) { return failure(error); }
}

import { NextResponse } from "next/server";
import { ChatSessionError, safeChatSessionError, listChatSessions, createChatSession } from "@/lib/services/chat-sessions";

const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const safe = safeChatSessionError(error);
  return NextResponse.json(safe.toResponse(), { status: safe.statusCode, headers });
}
export async function GET(request: Request) {
  try {
    const input: Record<string, string> = Object.create(null);
    for (const [key, value] of new URL(request.url).searchParams) {
      if (Object.hasOwn(input, key)) throw new ChatSessionError("INVALID_REQUEST");
      input[key] = value;
    }
    return NextResponse.json(await listChatSessions(input), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    let input: unknown;
    try { input = await request.json(); } catch { throw new ChatSessionError("INVALID_REQUEST"); }
    return NextResponse.json(await createChatSession(input), { status: 201, headers });
  } catch (error) { return failure(error); }
}

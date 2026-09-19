import { chat, ChatNotFoundError, ChatValidationError } from "@/lib/services/chat";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * 最小课堂问答：JSON { stageId, messages } → { text, sources }。
 * 不落库、不走 SSE。
 */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await chat(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ChatNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof ChatValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Validation failed" },
        { status: 400 },
      );
    }

    console.error("[POST /api/chat]", error);

    return NextResponse.json({ error: "Failed to chat" }, { status: 500 });
  }
}

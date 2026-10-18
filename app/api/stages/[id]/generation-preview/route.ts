import { getGenerationPreview } from "@/lib/services/stage-generation";
import { StageNotFoundError } from "@/lib/services/stages";
import { stageIdSchema } from "@/lib/validators/stages";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsedId = stageIdSchema.safeParse(id);
  const headers = { "Cache-Control": "no-store" };
  if (!parsedId.success) {
    return NextResponse.json({ error: "课堂地址无效" }, { status: 400, headers });
  }
  try {
    return NextResponse.json(await getGenerationPreview(parsedId.data), { headers });
  } catch (error) {
    if (error instanceof StageNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404, headers });
    }
    console.error("[GET /api/stages/[id]/generation-preview] failed");
    return NextResponse.json({ error: "读取课堂大纲与首屏失败，请重试" }, { status: 500, headers });
  }
}

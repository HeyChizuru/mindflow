import { createStage, StageValidationError } from "@/lib/services/stages";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { listStageHistory } from '@/lib/services/stage-history';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listStageHistory(Object.fromEntries(new URL(request.url).searchParams)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof StageValidationError) {
      return NextResponse.json({ error: error instanceof StageValidationError ? error.message : '历史列表参数无效' }, { status: 400 });
    }
    console.error('[GET /api/stages]', error);
    return NextResponse.json({ error: '读取历史课堂失败，请重试' }, { status: 500 });
  }
}

/**
 * 创建课堂。JSON 体为 { requirements }；multipart 的 requirements 是该对象的 JSON 字符串，pdf 可选。
 * 不解析 PDF，不调用模型。校验失败 400，成功 201。
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const requirementsField = form.get("requirements");
      const pdfField = form.get("pdf");

      const pdf = pdfField instanceof File ? pdfField : undefined;

      if (!pdf && pdfField != null && pdfField !== "") {
        return NextResponse.json({ error: "pdf must be a file" }, { status: 400 });
      }

      if (typeof requirementsField !== "string" || requirementsField.trim() === "") {
        return NextResponse.json({ error: "requirements is required" }, { status: 400 });
      }

      let requirements: unknown;
      try {
        requirements = JSON.parse(requirementsField);
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const stage = await createStage(requirements, pdf);
      return NextResponse.json(stage, { status: 201 });
    }

    if (contentType.includes("application/json")) {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const stage = await createStage(body);
      return NextResponse.json(stage, { status: 201 });
    }

    return NextResponse.json(
      { error: "Content-Type must be application/json or multipart/form-data" },
      { status: 415 },
    );
  } catch (error) {
    if (error instanceof StageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Validation failed" },
        { status: 400 },
      );
    }

    console.error("[POST /api/stages]", error);

    return NextResponse.json({ error: "Failed to create stage" }, { status: 500 });
  }
}

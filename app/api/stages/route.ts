import { createStage, StageValidationError } from "@/lib/services/stages";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const requirementField = form.get("requirement");
      const pdfField = form.get("pdf");

      const requirement =
        typeof requirementField === "string" ? requirementField : undefined;
      const pdf = pdfField instanceof File ? pdfField : undefined;

      if (!pdf && pdfField != null && pdfField !== "") {
        return NextResponse.json({ error: "pdf must be a file" }, { status: 400 });
      }

      const stage = await createStage({ requirement }, pdf);
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

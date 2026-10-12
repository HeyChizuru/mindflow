import type { CreateStageBody } from "@/lib/types/stage";
import { stageRequirementsSchema } from "@/lib/validators/stages";

export type BuildCreateStageBodyInput = {
  requirement: string;
  nickname: string;
  bio: string;
};

export type BuildCreateStageBodyResult =
  | { ok: true; body: CreateStageBody }
  | { ok: false; errorKey: string };

/**
 * 从首页表单与学习者画像组装 POST 体，并用与 M0 相同的 schema 做客户端校验。
 */
export function buildCreateStageBody(
  input: BuildCreateStageBodyInput,
): BuildCreateStageBodyResult {
  if (!input.requirement.trim()) {
    return { ok: false, errorKey: "upload.requirementRequired" };
  }

  const parsed = stageRequirementsSchema.safeParse({
    requirement: input.requirement,
    userNickname: input.nickname.trim() || undefined,
    userBio: input.bio.trim() || undefined,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];

    if (field === "requirement") {
      if (issue.code === "too_small") {
        return { ok: false, errorKey: "upload.requirementTooShort" };
      }
      if (issue.code === "too_big") {
        return { ok: false, errorKey: "upload.requirementTooLong" };
      }
    }

    return { ok: false, errorKey: "upload.generateFailed" };
  }

  return { ok: true, body: { requirements: parsed.data } };
}

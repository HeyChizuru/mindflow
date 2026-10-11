import { buildPrompt, PROMPT_IDS } from "@/lib/prompts";

export type BuildOutlineGenerationPromptInput = {
  requirement: string;
  userNickname?: string;
  userBio?: string;
  retrievalExcerpts?: string;
};

/**
 * 组装大纲生成用的 system / user 提示词。
 * 仅传入 MindFlow 实际使用的变量；无画像、无检索时不传对应键。
 */
export function buildOutlineGenerationPrompt(
  input: BuildOutlineGenerationPromptInput,
): { system: string; user: string } {
  const vars: Record<string, unknown> = {
    requirement: input.requirement,
  };

  if (input.userNickname || input.userBio) {
    const nickname = input.userNickname ?? "Unknown";
    const bioPart = input.userBio ? ` — ${input.userBio}` : "";
    vars.userProfile = `Student: ${nickname}${bioPart}\n\nConsider this learner's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.`;
  }

  const excerpts = input.retrievalExcerpts?.trim();
  if (excerpts) {
    vars.retrievalExcerpts = excerpts;
  }

  const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, vars);
  if (!prompts) {
    throw new Error("Outline prompt template not found");
  }

  return prompts;
}
